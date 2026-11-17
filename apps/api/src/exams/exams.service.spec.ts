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
    class: {
      findFirst: jest.fn(),
    },
    semester: {
      findFirst: jest.fn(),
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
    database.class.findFirst.mockResolvedValue({ id: 'class-1' });
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

describe('ExamsService student fields in results', () => {
  const database = {
    exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-a', collegeId: 'col-a' }) },
    result: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ExamsService(database as never);

  it('returns only identity fields for each student, never contact details', async () => {
    await service.listExamResults('exam-a', faculty);
    expect(database.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { student: { select: { id: true, studentCode: true, firstName: true, lastName: true } } },
    }));
  });
});

describe('ExamsService marks access', () => {
  const hod: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
  const paper = { id: 'es-1', collegeId: 'col-a', subjectId: 'subj-1', sectionId: 'sec-1', semesterId: 'sem-1', maxMarks: 50 };
  const database = {
    examSubject: { findFirst: jest.fn().mockResolvedValue(paper) },
    class: { findFirst: jest.fn() },
    semester: { findFirst: jest.fn() },
    section: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    mark: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    exam: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((fn: (tx: typeof database) => Promise<unknown>) => fn(database));
  const service = new ExamsService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('lets faculty open and enter marks only for a subject they teach in that section', async () => {
    database.class.findFirst.mockResolvedValue(null);
    await expect(service.getSubjectMarks('es-1', faculty)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateSubjectMarks('es-1', { marks: [{ studentId: 'stu-1', marksObtained: 40 }] }, faculty)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.class.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { collegeId: 'col-a', subjectId: 'subj-1', faculty: { userId: 'faculty-user' }, sectionId: 'sec-1' },
    }));
    expect(database.mark.upsert).not.toHaveBeenCalled();
  });

  it('checks the section as well as the semester for HODs', async () => {
    database.semester.findFirst.mockResolvedValue({ id: 'sem-1' });
    database.section.findFirst.mockResolvedValue(null);
    await expect(service.getSubjectMarks('es-1', hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.section.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sec-1', collegeId: 'col-a', semester: { course: { departmentId: 'dept-a' } } } }));
    database.section.findFirst.mockResolvedValue({ id: 'sec-1' });
    await expect(service.getSubjectMarks('es-1', hod)).resolves.toBeDefined();
  });

  it('rejects papers whose subject or section is not in the chosen semester', async () => {
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a' });
    database.subject.findFirst.mockResolvedValue({ id: 'subj-1' });
    database.section.findFirst.mockResolvedValue(null);
    const input = { subjectId: 'subj-1', semesterId: 'sem-1', sectionId: 'sec-other', examAt: '2026-12-01T10:00:00Z', maxMarks: 50, passMarks: 20 };
    await expect(service.addExamSubject('exam-1', input, admin)).rejects.toMatchObject({ response: { code: 'INVALID_EXAM_SUBJECT' } });
    expect(database.section.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sec-other', collegeId: 'col-a', semesterId: 'sem-1' } }));
    database.subject.findFirst.mockResolvedValue(null);
    await expect(service.addExamSubject('exam-1', { ...input, sectionId: undefined }, admin)).rejects.toMatchObject({ response: { code: 'INVALID_EXAM_SUBJECT' } });
  });

  it('keeps HODs inside their department', async () => {
    database.semester.findFirst.mockResolvedValue(null);
    await expect(service.getSubjectMarks('es-1', hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.semester.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sem-1', collegeId: 'col-a', course: { departmentId: 'dept-a' } } }));
  });

  it('rejects marks for students who are not enrolled for the paper', async () => {
    database.class.findFirst.mockResolvedValue({ id: 'class-1' });
    database.enrollment.findMany.mockResolvedValueOnce([{ studentId: 'stu-1' }]);
    await expect(service.updateSubjectMarks('es-1', { marks: [{ studentId: 'stu-1', marksObtained: 40 }, { studentId: 'outsider', marksObtained: 45 }] }, faculty)).rejects.toMatchObject({ response: { code: 'STUDENT_NOT_IN_EXAM' } });
    await expect(service.updateSubjectMarks('es-1', { marks: [{ studentId: 'stu-1', marksObtained: 40 }, { studentId: 'stu-1', marksObtained: 41 }] }, faculty)).rejects.toMatchObject({ response: { code: 'DUPLICATE_STUDENT' } });
    expect(database.mark.upsert).not.toHaveBeenCalled();
  });

  it('saves marks when the faculty teaches the subject and the students are enrolled', async () => {
    database.class.findFirst.mockResolvedValue({ id: 'class-1' });
    database.enrollment.findMany.mockResolvedValueOnce([{ studentId: 'stu-1' }]);
    await expect(service.updateSubjectMarks('es-1', { marks: [{ studentId: 'stu-1', marksObtained: 40 }] }, faculty)).resolves.toEqual({ success: true, count: 1 });
    expect(database.mark.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not let faculty publish results', async () => {
    await expect(service.calculateAndPublishResults('exam-1', faculty)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.exam.findFirst).not.toHaveBeenCalled();
  });
});
