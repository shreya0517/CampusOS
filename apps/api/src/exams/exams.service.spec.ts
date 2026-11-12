import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExamStatus, ResultStatus } from '@prisma/client';
import { ExamsService } from './exams.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  parseCreateExamDto,
  parseCreateExamSubjectDto,
  parseExamListQuery,
  parseUpdateMarksDto,
} from './exams.dto';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const faculty: AuthorizationContext = { userId: 'faculty-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
const student: AuthorizationContext = { userId: 'stu-user', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

const mockExam = {
  id: 'exam-1',
  collegeId: 'col-a',
  name: 'Midterm 2026',
  status: ExamStatus.DRAFT,
  startsOn: new Date('2026-10-01'),
  endsOn: new Date('2026-10-15'),
  examSubjects: [],
};

describe('ExamsService', () => {
  const mockTransaction = jest.fn();
  const database = {
    exam: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    examSubject: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    mark: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    result: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
    $transaction: mockTransaction,
  };
  mockTransaction.mockImplementation((fn: (tx: typeof database) => Promise<unknown>) => fn(database));

  const service = new ExamsService(database as never);

  beforeEach(() => jest.clearAllMocks());

  it('validates DTO parsing', () => {
    expect(() => parseCreateExamDto({})).toThrow();
    expect(() => parseCreateExamDto({ name: 'Exam 1', startsOn: 'invalid-date', endsOn: '2026-10-10' })).toThrow();
    expect(() => parseCreateExamSubjectDto({ maxMarks: 100, passMarks: 150 })).toThrow();
    expect(() => parseUpdateMarksDto({ marks: [{ studentId: 's1', marksObtained: -10 }] })).toThrow();
    expect(parseExamListQuery({ page: '1', pageSize: '10' })).toMatchObject({ page: 1, pageSize: 10 });
  });

  it('creates an exam scoped to authenticated college for ADMIN', async () => {
    database.exam.create.mockResolvedValue(mockExam);
    const result = await service.createExam(
      { name: 'Midterm 2026', startsOn: '2026-10-01', endsOn: '2026-10-15' },
      admin,
    );
    expect(result).toEqual(mockExam);
    expect(database.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ collegeId: 'col-a', name: 'Midterm 2026' }),
      }),
    );
  });

  it('blocks STUDENT from creating or updating exams', async () => {
    await expect(
      service.createExam({ name: 'Test Exam', startsOn: '2026-10-01', endsOn: '2026-10-05' }, student),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.updateExam('exam-1', { name: 'Updated Exam' }, student),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists exams scoped by college and filter', async () => {
    database.exam.findMany.mockResolvedValue([mockExam]);
    database.exam.count.mockResolvedValue(1);

    const result = await service.listExams({ page: 1, pageSize: 20 }, admin);
    expect(result.items).toHaveLength(1);
    expect(database.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ collegeId: 'col-a' }) }),
    );
  });

  it('validates marks obtained does not exceed maxMarks on updateSubjectMarks', async () => {
    database.examSubject.findFirst.mockResolvedValue({
      id: 'sub-1',
      collegeId: 'col-a',
      maxMarks: 100,
    });

    await expect(
      service.updateSubjectMarks(
        'sub-1',
        { marks: [{ studentId: 'stu-1', marksObtained: 105 }] },
        faculty,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates totals and publishes results accurately', async () => {
    database.exam.findFirst.mockResolvedValue({
      id: 'exam-1',
      collegeId: 'col-a',
      examSubjects: [
        {
          id: 'es-1',
          maxMarks: 100,
          passMarks: 40,
          marks: [
            { studentId: 'stu-1', marksObtained: 80, isAbsent: false },
            { studentId: 'stu-2', marksObtained: 30, isAbsent: false },
          ],
        },
      ],
    });

    database.exam.update.mockResolvedValue({ id: 'exam-1', status: ExamStatus.COMPLETED });

    const result = await service.calculateAndPublishResults('exam-1', admin);
    expect(result.processedStudents).toBe(2);
    expect(database.result.upsert).toHaveBeenCalledTimes(2);

    // Verify student 1 gets PASSED and student 2 gets FAILED
    expect(database.result.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ studentId: 'stu-1', status: ResultStatus.PASSED, percentage: 80 }),
      }),
    );
    expect(database.result.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ studentId: 'stu-2', status: ResultStatus.FAILED, percentage: 30 }),
      }),
    );
  });

  it('returns student personal results for STUDENT caller', async () => {
    database.student.findFirst.mockResolvedValue({ id: 'stu-profile-1' });
    database.result.findMany.mockResolvedValue([{ id: 'res-1', status: ResultStatus.PASSED }]);
    database.mark.findMany.mockResolvedValue([]);

    const result = await service.getMyResults(student);
    expect(result.results).toHaveLength(1);
    expect(database.student.findFirst).toHaveBeenCalledWith({
      where: { collegeId: 'col-a', userId: 'stu-user' },
    });
  });
});
