import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExamStatus, ResultStatus } from '@prisma/client';
import { ExamsService } from './exams.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  parseCreateExamDto,
  parseUpdateExamDto,
  parseCreateExamSubjectDto,
  parseExamListQuery,
  parseReviewMarksDto,
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
      count: jest.fn().mockResolvedValue(1),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
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
    expect(() => parseCreateExamDto({})).toThrow(BadRequestException);
    // An edit rejects a field it was sent but can't use, instead of dropping it.
    for (const bad of [{ name: '  ' }, { startsOn: 'soon' }, { endsOn: 42 }, { status: 'DONE' }, { startsOn: '2026-12-10', endsOn: '2026-12-01' }]) {
      expect(() => parseUpdateExamDto(bad)).toThrow(BadRequestException);
    }
    expect(parseUpdateExamDto({ name: ' Finals ', status: 'scheduled' })).toEqual({ name: 'Finals', status: ExamStatus.SCHEDULED });
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

  it('shows students only scheduled and completed exams, in the list and by id', async () => {
    database.exam.findMany.mockResolvedValue([]);
    database.exam.count.mockResolvedValue(0);
    await service.listExams({ page: 1, pageSize: 20, status: ExamStatus.DRAFT }, student);
    expect(database.exam.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: [ExamStatus.SCHEDULED, ExamStatus.COMPLETED] } }) }));

    for (const status of [ExamStatus.DRAFT, ExamStatus.CANCELLED]) {
      database.exam.findFirst.mockResolvedValueOnce({ ...mockExam, status });
      await expect(service.getExam('exam-1', student)).rejects.toMatchObject({ response: { code: 'EXAM_NOT_FOUND' } });
    }
    expect(database.mark.findMany).not.toHaveBeenCalled();

    // Staff, and a platform SUPER_ADMIN, still open a draft and list every exam.
    database.exam.findFirst.mockResolvedValueOnce(mockExam);
    await expect(service.getExam('exam-1', faculty)).resolves.toMatchObject({ id: 'exam-1', status: ExamStatus.DRAFT });
    const superAdmin: AuthorizationContext = { ...admin, roles: ['SUPER_ADMIN'] };
    database.exam.findFirst.mockResolvedValueOnce(mockExam);
    await expect(service.getExam('exam-1', superAdmin)).resolves.toMatchObject({ status: ExamStatus.DRAFT });
    await service.listExams({ page: 1, pageSize: 20 }, superAdmin);
    expect(database.exam.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'col-a' } }));
  });

  it('refuses to publish when a paper was added or reopened after the papers were read', async () => {
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a', examSubjects: [{ id: 'es-1', maxMarks: 100, passMarks: 40, marksStatus: 'APPROVED', marks: [] }] });
    // Under the lock there are now two papers, one of them still a draft.
    database.examSubject.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    await expect(service.calculateAndPublishResults('exam-1', admin)).rejects.toMatchObject({ response: { code: 'EXAM_CHANGED' } });
    expect(database.result.upsert).not.toHaveBeenCalled();
  });

  it('validates marks obtained does not exceed maxMarks on updateSubjectMarks', async () => {
    database.class.findFirst.mockResolvedValue({ id: 'class-1' });
    database.examSubject.findFirst.mockResolvedValue({
      id: 'sub-1',
      collegeId: 'col-a',
      maxMarks: 100,
      marksStatus: 'DRAFT',
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
          marksStatus: 'APPROVED',
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

  it('shows a student marks only for exams whose result is published to them', async () => {
    database.student.findFirst.mockResolvedValue({ id: 'stu-profile-1' });
    database.result.findMany.mockResolvedValue([]);
    database.mark.findMany.mockResolvedValue([]);
    await service.getMyResults(student);
    expect(database.result.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ studentId: 'stu-profile-1', publishedAt: { not: null } }) }));
    expect(database.mark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          collegeId: 'col-a',
          studentId: 'stu-profile-1',
          examSubject: { exam: { status: { in: [ExamStatus.SCHEDULED, ExamStatus.COMPLETED] }, results: { some: { collegeId: 'col-a', studentId: 'stu-profile-1', publishedAt: { not: null } } } } },
        },
      }),
    );
  });

  it("gives a student an exam's marks only with their published result", async () => {
    database.student.findFirst.mockResolvedValue({ id: 'stu-profile-1' });
    database.exam.findFirst.mockResolvedValue({ ...mockExam, status: ExamStatus.SCHEDULED });
    database.result.findFirst.mockResolvedValueOnce(null);
    await expect(service.getExam('exam-1', student)).resolves.toMatchObject({ studentResult: null, studentMarks: [] });
    expect(database.result.findFirst).toHaveBeenCalledWith({ where: { collegeId: 'col-a', examId: 'exam-1', studentId: 'stu-profile-1', publishedAt: { not: null } } });
    expect(database.mark.findMany).not.toHaveBeenCalled();

    database.result.findFirst.mockResolvedValueOnce({ id: 'res-1', publishedAt: new Date() });
    database.mark.findMany.mockResolvedValueOnce([{ id: 'mark-1' }]);
    await expect(service.getExam('exam-1', student)).resolves.toMatchObject({ studentMarks: [{ id: 'mark-1' }] });
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
  const paper = { id: 'es-1', collegeId: 'col-a', subjectId: 'subj-1', sectionId: 'sec-1', semesterId: 'sem-1', maxMarks: 50, marksStatus: 'DRAFT' };
  const database = {
    examSubject: {
      findFirst: jest.fn().mockResolvedValue(paper),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'es-new' }),
    },
    class: { findFirst: jest.fn() },
    semester: { findFirst: jest.fn() },
    section: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    mark: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), count: jest.fn().mockResolvedValue(3) },
    exam: { findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    result: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    auditLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
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

  it("lets only an Admin create, edit or delete an exam, and maps a name clash to 409", async () => {
    const facultyUser: AuthorizationContext = { userId: 'fac-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
    for (const who of [hod, facultyUser]) {
      await expect(service.createExam({ name: 'Finals', startsOn: '2026-12-01', endsOn: '2026-12-10' } as never, who)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.updateExam('exam-1', { name: 'Finals' }, who)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.deleteExam('exam-1', who)).rejects.toBeInstanceOf(ForbiddenException);
    }
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a', name: 'Mids', status: 'DRAFT' });
    database.exam.update.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.updateExam('exam-1', { name: 'Finals' }, admin)).rejects.toMatchObject({ response: { code: 'EXAM_ALREADY_EXISTS' } });
  });

  it('refuses to delete an exam with marks under review or results, and audits a delete', async () => {
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a', name: 'Mids', status: 'DRAFT' });
    database.examSubject.count.mockResolvedValue(0);
    database.examSubject.count.mockResolvedValueOnce(1);
    await expect(service.deleteExam('exam-1', admin)).rejects.toMatchObject({ response: { code: 'EXAM_HAS_MARKS' } });
    database.result.count.mockResolvedValueOnce(4);
    await expect(service.deleteExam('exam-1', admin)).rejects.toMatchObject({ response: { code: 'EXAM_HAS_MARKS' } });
    expect(database.exam.delete).not.toHaveBeenCalled();
    await expect(service.deleteExam('exam-1', admin)).resolves.toEqual({ success: true });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'EXAM_DELETED', entityId: 'exam-1', metadata: { name: 'Mids', status: 'DRAFT' } }) });
    // The exam and its papers are locked before the check, so marks submitted at the same moment can't be cascaded away.
    expect(database.$queryRaw).toHaveBeenCalled();
    const locks = database.$queryRaw.mock.calls.map(([sql]) => (sql as string[]).join('?'));
    expect(locks.some((sql) => sql.includes('FROM "Exam"') && sql.includes('FOR UPDATE'))).toBe(true);
    expect(locks.some((sql) => sql.includes('FROM "ExamSubject"') && sql.includes('FOR UPDATE'))).toBe(true);
  });

  it("lets an HOD add and remove only their department's papers", async () => {
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a' });
    const input = { subjectId: 'subj-1', semesterId: 'sem-1', sectionId: 'sec-1', examAt: '2026-12-01T10:00:00Z', maxMarks: 50, passMarks: 20 };
    database.semester.findFirst.mockResolvedValue(null);
    await expect(service.addExamSubject('exam-1', input, hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeExamSubject('exam-1', 'es-1', hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.examSubject.create).not.toHaveBeenCalled();
    expect(database.examSubject.deleteMany).not.toHaveBeenCalled();

    database.semester.findFirst.mockResolvedValue({ id: 'sem-1' });
    database.section.findFirst.mockResolvedValue({ id: 'sec-1' });
    database.subject.findFirst.mockResolvedValue({ id: 'subj-1' });
    await expect(service.addExamSubject('exam-1', input, hod)).resolves.toEqual({ id: 'es-new' });
    await expect(service.removeExamSubject('exam-1', 'es-1', hod)).resolves.toEqual({ success: true });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'EXAM_PAPER_REMOVED', entityId: 'exam-1', metadata: { examSubjectId: 'es-1', subjectId: 'subj-1', marks: 3 } }) });
  });

  it('keeps papers fixed once marks are under review or results are published', async () => {
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a' });
    database.examSubject.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.removeExamSubject('exam-1', 'es-1', admin)).rejects.toMatchObject({ response: { code: 'MARKS_IN_REVIEW' } });
    expect(database.examSubject.deleteMany).toHaveBeenCalledWith({ where: { id: 'es-1', collegeId: 'col-a', marksStatus: 'DRAFT' } });
    database.result.count.mockResolvedValue(2);
    await expect(service.removeExamSubject('exam-1', 'es-1', admin)).rejects.toMatchObject({ response: { code: 'RESULTS_PUBLISHED' } });
    await expect(service.addExamSubject('exam-1', { subjectId: 'subj-1', semesterId: 'sem-1', examAt: '2026-12-01T10:00:00Z', maxMarks: 50, passMarks: 20 }, admin)).rejects.toMatchObject({ response: { code: 'RESULTS_PUBLISHED' } });
    database.result.count.mockResolvedValue(0);
  });

  it("scopes an exam's results: HODs to their department, faculty to the sections they teach", async () => {
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', collegeId: 'col-a' });
    await service.listExamResults('exam-1', admin);
    expect(database.result.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', examId: 'exam-1' } }));
    await service.listExamResults('exam-1', hod);
    expect(database.result.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { collegeId: 'col-a', examId: 'exam-1', student: { enrollments: { some: { collegeId: 'col-a', section: { semester: { course: { departmentId: 'dept-a' } } } } } } } }),
    );
    const facultyUser: AuthorizationContext = { userId: 'fac-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
    await service.listExamResults('exam-1', facultyUser);
    expect(database.result.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { collegeId: 'col-a', examId: 'exam-1', student: { enrollments: { some: { collegeId: 'col-a', status: 'ACTIVE', section: { classes: { some: { faculty: { userId: 'fac-user' } } } } } } } } }),
    );
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

describe('ExamsService marks approval', () => {
  const hod: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
  const paper = (marksStatus: string) => ({ id: 'es-1', collegeId: 'col-a', subjectId: 'subj-1', sectionId: 'sec-1', semesterId: 'sem-1', maxMarks: 50, marksStatus });
  const database = {
    examSubject: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    class: { findFirst: jest.fn().mockResolvedValue({ id: 'class-1' }) },
    semester: { findFirst: jest.fn().mockResolvedValue({ id: 'sem-1' }) },
    section: { findFirst: jest.fn().mockResolvedValue({ id: 'sec-1' }) },
    enrollment: { findMany: jest.fn() },
    mark: { findMany: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    exam: { findFirst: jest.fn(), update: jest.fn() },
    result: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((fn: (tx: typeof database) => Promise<unknown>) => fn(database));
  const service = new ExamsService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('locks marks once they are submitted', async () => {
    database.examSubject.findFirst.mockResolvedValue(paper('SUBMITTED'));
    await expect(service.updateSubjectMarks('es-1', { marks: [{ studentId: 'stu-1', marksObtained: 40 }] }, faculty)).rejects.toMatchObject({ response: { code: 'MARKS_LOCKED' } });
    expect(database.mark.upsert).not.toHaveBeenCalled();
  });

  it('refuses a save that loses the race with a submission', async () => {
    database.examSubject.findFirst.mockResolvedValue(paper('DRAFT'));
    database.enrollment.findMany.mockResolvedValue([{ studentId: 'stu-1' }]);
    database.examSubject.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.updateSubjectMarks('es-1', { marks: [{ studentId: 'stu-1', marksObtained: 40 }] }, faculty)).rejects.toMatchObject({ response: { code: 'MARKS_LOCKED' } });
    expect(database.examSubject.updateMany).toHaveBeenCalledWith({ where: { id: 'es-1', collegeId: 'col-a', marksStatus: 'DRAFT' }, data: { marksStatus: 'DRAFT' } });
    expect(database.mark.upsert).not.toHaveBeenCalled();
  });

  it('only accepts a complete marks sheet for review', async () => {
    database.examSubject.findFirst.mockResolvedValue(paper('DRAFT'));
    database.enrollment.findMany.mockResolvedValue([{ studentId: 'stu-1' }, { studentId: 'stu-2' }]);
    database.mark.findMany.mockResolvedValueOnce([{ studentId: 'stu-1' }]);
    await expect(service.submitSubjectMarks('es-1', faculty)).rejects.toMatchObject({ response: { code: 'MARKS_INCOMPLETE' } });
    expect(database.examSubject.updateMany).not.toHaveBeenCalled();
  });

  it('submits a complete draft and logs it', async () => {
    database.examSubject.findFirst.mockResolvedValue(paper('DRAFT'));
    database.enrollment.findMany.mockResolvedValue([{ studentId: 'stu-1' }]);
    database.mark.findMany.mockResolvedValue([{ studentId: 'stu-1' }]);
    await service.submitSubjectMarks('es-1', faculty);
    expect(database.examSubject.updateMany).toHaveBeenCalledWith({ where: { id: 'es-1', collegeId: 'col-a', marksStatus: 'DRAFT' }, data: { marksStatus: 'SUBMITTED', marksSubmittedAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'MARKS_SUBMITTED', entityType: 'ExamSubject', entityId: 'es-1', actorId: 'faculty-user' }) });
  });

  it('lets the HOD approve or return submitted marks, but not faculty', async () => {
    database.examSubject.findFirst.mockResolvedValue(paper('SUBMITTED'));
    database.enrollment.findMany.mockResolvedValue([]);
    database.mark.findMany.mockResolvedValue([]);
    await expect(service.reviewSubjectMarks('es-1', { decision: 'APPROVED' }, faculty)).rejects.toBeInstanceOf(ForbiddenException);
    await service.reviewSubjectMarks('es-1', { decision: 'RETURNED', comment: 'Recheck Q3 totals' }, hod);
    expect(database.examSubject.updateMany).toHaveBeenCalledWith({ where: { id: 'es-1', collegeId: 'col-a', marksStatus: 'SUBMITTED' }, data: { marksStatus: 'DRAFT', marksSubmittedAt: null } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'MARKS_RETURNED', metadata: { comment: 'Recheck Q3 totals' } }) });
  });

  it('turns a review of marks that are not submitted into a conflict', async () => {
    database.examSubject.findFirst.mockResolvedValue(paper('DRAFT'));
    database.examSubject.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.reviewSubjectMarks('es-1', { decision: 'APPROVED' }, hod)).rejects.toMatchObject({ response: { code: 'MARKS_NOT_SUBMITTED' } });
  });

  it('publishes results only for admins and only when every paper is approved', async () => {
    await expect(service.calculateAndPublishResults('exam-1', hod)).rejects.toBeInstanceOf(ForbiddenException);
    database.exam.findFirst.mockResolvedValue({ id: 'exam-1', examSubjects: [{ ...paper('APPROVED'), marks: [] }, { ...paper('SUBMITTED'), id: 'es-2', marks: [] }] });
    await expect(service.calculateAndPublishResults('exam-1', admin)).rejects.toMatchObject({ response: { code: 'MARKS_NOT_APPROVED' } });
    expect(database.result.upsert).not.toHaveBeenCalled();
  });

  it('validates review input', () => {
    expect(() => parseReviewMarksDto({ decision: 'MAYBE' })).toThrow();
    expect(() => parseReviewMarksDto({ decision: 'RETURNED', comment: 'x'.repeat(501) })).toThrow();
    expect(parseReviewMarksDto({ decision: 'RETURNED', comment: '  Recheck  ' })).toEqual({ decision: 'RETURNED', comment: 'Recheck' });
  });
});

describe('ExamsService marks review queue', () => {
  const hod: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
  const database = { examSubject: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new ExamsService(database as never);
  const lastWhere = (): unknown => (database.examSubject.findMany.mock.calls.at(-1)?.[0] as { where: unknown }).where;
  beforeEach(() => jest.clearAllMocks());

  it('gives an HOD the submitted papers of their own department only', async () => {
    await service.listMarksReviewQueue(hod);
    const inDepartment = { course: { departmentId: 'dept-a' } };
    expect(lastWhere()).toEqual({ collegeId: 'col-a', marksStatus: 'SUBMITTED', semester: inDepartment, OR: [{ sectionId: null }, { section: { semester: inDepartment } }] });
  });

  it('gives an admin every submitted paper, and blocks faculty', async () => {
    await service.listMarksReviewQueue(admin);
    expect(lastWhere()).toEqual({ collegeId: 'col-a', marksStatus: 'SUBMITTED' });
    await expect(service.listMarksReviewQueue(faculty)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
