import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import {
  parseAssignmentListQuery,
  parseCreateAssignmentDto,
  parseGradeSubmissionDto,
  parseSubmitAssignmentDto,
  parseUpdateAssignmentDto,
} from './assignments.dto';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const faculty: AuthorizationContext = { userId: 'fac-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
const student: AuthorizationContext = { userId: 'stu-user', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

const mockClass = { id: 'class-1', collegeId: 'col-a', sectionId: 'sec-1', subjectId: 'subj-1', facultyId: 'fac-1', section: { semester: { course: { departmentId: 'dept-a' } } } };
const mockFaculty = { id: 'fac-1', collegeId: 'col-a', userId: 'fac-user' };
const mockStudent = { id: 'stu-1', collegeId: 'col-a', userId: 'stu-user' };

const mockAssignment = {
  id: 'ass-1',
  collegeId: 'col-a',
  classId: 'class-1',
  title: 'Test Assignment',
  description: 'Details',
  dueAt: new Date('2026-12-31'),
  maxMarks: 100,
  class: mockClass,
  createdBy: { id: 'fac-1', firstName: 'Jane', lastName: 'Doe' },
};

const mockSubmission = {
  updatedAt: new Date('2026-11-18T10:00:00.000Z'),
  id: 'sub-1',
  collegeId: 'col-a',
  assignmentId: 'ass-1',
  studentId: 'stu-1',
  status: SubmissionStatus.SUBMITTED,
  fileKey: 'key.pdf',
  marksAwarded: null,
  feedback: null,
  student: { id: 'stu-1', firstName: 'John', lastName: 'Smith', studentCode: 'STU1' },
};

describe('AssignmentsService', () => {
  const database = {
    class: { findFirst: jest.fn() },
    faculty: { findFirst: jest.fn() },
    student: { findFirst: jest.fn() },
    assignment: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    submission: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(mockSubmission),
    },
  };
  const service = new AssignmentsService(database as never);

  beforeEach(() => jest.clearAllMocks());

  it('validates DTO parsing', () => {
    expect(() => parseCreateAssignmentDto({})).toThrow();
    expect(() => parseCreateAssignmentDto({ classId: 'c', title: '', maxMarks: 10 })).toThrow();
    expect(() => parseCreateAssignmentDto({ classId: 'c', title: 'T', maxMarks: -5 })).toThrow();
    expect(() => parseUpdateAssignmentDto({})).toThrow();
    expect(() => parseAssignmentListQuery({ page: 0 })).toThrow();

    const validCreate = parseCreateAssignmentDto({ classId: 'c', title: 'Title', maxMarks: 100 });
    expect(validCreate.title).toBe('Title');
    expect(validCreate.maxMarks).toBe(100);

    const validSubmit = parseSubmitAssignmentDto({ fileKey: 'file.pdf' });
    expect(validSubmit.fileKey).toBe('file.pdf');

    const validGrade = parseGradeSubmissionDto({ marksAwarded: 95, feedback: 'Great job' });
    expect(validGrade.marksAwarded).toBe(95);
  });

  it('allows ADMIN to create assignment', async () => {
    database.class.findFirst.mockResolvedValue(mockClass);
    database.faculty.findFirst.mockResolvedValue(mockFaculty);
    database.assignment.create.mockResolvedValue(mockAssignment);

    const result = await service.createAssignment({ classId: 'class-1', title: 'Test', maxMarks: 100 }, admin);
    expect(result).toEqual(mockAssignment);
  });

  it('blocks STUDENT from creating assignment', async () => {
    await expect(service.createAssignment({ classId: 'class-1', title: 'Test', maxMarks: 100 }, student)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows STUDENT to submit work', async () => {
    database.student.findFirst.mockResolvedValue(mockStudent);
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.submission.findFirst.mockResolvedValue(null);

    const result = await service.submitAssignment('ass-1', { fileKey: 'test.pdf' }, student);
    expect(result).toEqual(mockSubmission);
    expect(database.submission.create).toHaveBeenCalledWith({
      data: { collegeId: 'col-a', assignmentId: 'ass-1', studentId: 'stu-1', fileKey: 'test.pdf', status: SubmissionStatus.SUBMITTED, submittedAt: expect.any(Date) },
    });
  });

  it('never lets a student choose graded, returned or late', () => {
    for (const status of ['GRADED', 'RETURNED', 'LATE']) expect(() => parseSubmitAssignmentDto({ fileKey: 'f', status })).toThrow(BadRequestException);
    expect(parseSubmitAssignmentDto({ status: 'DRAFT' }).status).toBe('DRAFT');
    for (const status of ['DRAFT', 'SUBMITTED', 'LATE']) expect(() => parseGradeSubmissionDto({ marksAwarded: 5, status })).toThrow(BadRequestException);
    expect(parseGradeSubmissionDto({ marksAwarded: 5, status: 'RETURNED' }).status).toBe('RETURNED');
  });

  it('marks work late from the due date, whatever the student sends', async () => {
    database.student.findFirst.mockResolvedValue(mockStudent);
    database.assignment.findFirst.mockResolvedValue({ ...mockAssignment, dueAt: new Date('2020-01-01') });
    database.submission.findFirst.mockResolvedValue(null);
    await service.submitAssignment('ass-1', { fileKey: 'late.pdf', status: 'SUBMITTED' }, student);
    expect(database.submission.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: SubmissionStatus.LATE }) });
  });

  it('keeps graded work final and handed-in work out of drafts', async () => {
    database.student.findFirst.mockResolvedValue(mockStudent);
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.submission.findFirst.mockResolvedValue({ id: 'sub-1', status: SubmissionStatus.GRADED });
    await expect(service.submitAssignment('ass-1', { fileKey: 'v2.pdf' }, student)).rejects.toMatchObject({ response: { code: 'SUBMISSION_GRADED' } });
    database.submission.findFirst.mockResolvedValue({ id: 'sub-1', status: SubmissionStatus.SUBMITTED });
    await expect(service.submitAssignment('ass-1', { fileKey: 'v2.pdf', status: 'DRAFT' }, student)).rejects.toMatchObject({ response: { code: 'ALREADY_SUBMITTED' } });
    expect(database.submission.updateMany).not.toHaveBeenCalled();
  });

  it('clears the old marks when returned work is handed in again, and refuses if it was graded meanwhile', async () => {
    database.student.findFirst.mockResolvedValue(mockStudent);
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.submission.findFirst.mockResolvedValue({ id: 'sub-1', status: SubmissionStatus.RETURNED });
    await service.submitAssignment('ass-1', { fileKey: 'v2.pdf' }, student);
    expect(database.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', collegeId: 'col-a', status: SubmissionStatus.RETURNED },
      data: { fileKey: 'v2.pdf', status: SubmissionStatus.SUBMITTED, submittedAt: expect.any(Date), marksAwarded: null },
    });
    database.submission.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.submitAssignment('ass-1', { fileKey: 'v3.pdf' }, student)).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows FACULTY/HOD to grade submission', async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.class.findFirst.mockResolvedValue(mockClass);
    database.submission.findFirst.mockResolvedValue(mockSubmission);
    database.submission.findUniqueOrThrow.mockResolvedValueOnce({ ...mockSubmission, status: SubmissionStatus.GRADED, marksAwarded: 90 });

    const result = await service.gradeSubmission('ass-1', 'sub-1', { marksAwarded: 90, feedback: 'Good' }, faculty);
    expect(result.marksAwarded).toBe(90);
    expect(database.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', collegeId: 'col-a', status: SubmissionStatus.SUBMITTED, updatedAt: new Date('2026-11-18T10:00:00.000Z') },
      data: { marksAwarded: 90, feedback: 'Good', status: SubmissionStatus.GRADED },
    });
  });

  it('refuses a grade for a version of the work the teacher did not see', async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.class.findFirst.mockResolvedValue(mockClass);
    database.submission.findFirst.mockResolvedValue(mockSubmission);
    // The student updated the work after the teacher opened it: same status, newer version.
    const seen = parseGradeSubmissionDto({ marksAwarded: 5, version: '2026-11-18T09:00:00.000Z' });
    await expect(service.gradeSubmission('ass-1', 'sub-1', seen, faculty)).rejects.toMatchObject({ response: { code: 'SUBMISSION_CHANGED' } });
    expect(database.submission.updateMany).not.toHaveBeenCalled();
    expect(() => parseGradeSubmissionDto({ marksAwarded: 5, version: 'yesterday' })).toThrow(BadRequestException);
  });

  it('grades only handed-in work, and not over a change made meanwhile', async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.class.findFirst.mockResolvedValue(mockClass);
    database.submission.findFirst.mockResolvedValueOnce({ ...mockSubmission, status: SubmissionStatus.DRAFT });
    await expect(service.gradeSubmission('ass-1', 'sub-1', { marksAwarded: 5 }, faculty)).rejects.toMatchObject({ response: { code: 'NOT_SUBMITTED' } });
    database.submission.findFirst.mockResolvedValueOnce(mockSubmission);
    database.submission.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.gradeSubmission('ass-1', 'sub-1', { marksAwarded: 5 }, faculty)).rejects.toMatchObject({ response: { code: 'SUBMISSION_CHANGED' } });
  });

  it("shows a class's teacher by name only, without employee code or account id", async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.student.findFirst.mockResolvedValue(mockStudent);
    database.submission.findFirst.mockResolvedValue(null);
    await service.getAssignment('ass-1', student).catch(() => undefined);
    const include = (database.assignment.findFirst.mock.calls[0]?.[0] as { include: { class: { include: { faculty: unknown } } } }).include;
    expect(include.class.include.faculty).toEqual({ select: { id: true, firstName: true, lastName: true } });
  });

  it('rejects grade exceeding maxMarks', async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.class.findFirst.mockResolvedValue(mockClass);

    await expect(service.gradeSubmission('ass-1', 'sub-1', { marksAwarded: 150 }, faculty)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AssignmentsService student list', () => {
  const database = {
    student: { findFirst: jest.fn() },
    assignment: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(1) },
  };
  const service = new AssignmentsService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('gives students their own submission instead of a count of everyone else', async () => {
    database.student.findFirst.mockResolvedValue({ id: 'stu-1' });
    database.assignment.findMany.mockResolvedValue([{ ...mockAssignment, submissions: [{ id: 'sub-1', status: 'SUBMITTED' }] }]);
    const result = await service.listAssignments({ page: 1, pageSize: 20 }, student);
    const args = database.assignment.findMany.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(args.include.submissions).toEqual({ where: { collegeId: 'col-a', studentId: 'stu-1' }, take: 1 });
    expect(args.include._count).toBeUndefined();
    expect(result.items[0]).toMatchObject({ mySubmission: { id: 'sub-1', status: 'SUBMITTED' } });
    expect(result.items[0]).not.toHaveProperty('submissions');
  });

  it('returns null when the student has not submitted', async () => {
    database.student.findFirst.mockResolvedValue({ id: 'stu-1' });
    database.assignment.findMany.mockResolvedValue([{ ...mockAssignment, submissions: [] }]);
    const result = await service.listAssignments({ page: 1, pageSize: 20 }, student);
    expect(result.items[0]).toMatchObject({ mySubmission: null });
  });

  it('keeps the submission count for staff', async () => {
    database.assignment.findMany.mockResolvedValue([]);
    await service.listAssignments({ page: 1, pageSize: 20 }, admin);
    const args = database.assignment.findMany.mock.calls[0][0] as { include: Record<string, unknown> };
    expect(args.include._count).toEqual({ select: { submissions: true } });
    expect(database.student.findFirst).not.toHaveBeenCalled();
  });
});
