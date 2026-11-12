import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    submission: { upsert: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
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
    database.submission.upsert.mockResolvedValue(mockSubmission);

    const result = await service.submitAssignment('ass-1', { fileKey: 'test.pdf' }, student);
    expect(result).toEqual(mockSubmission);
  });

  it('allows FACULTY/HOD to grade submission', async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.class.findFirst.mockResolvedValue(mockClass);
    database.submission.findFirst.mockResolvedValue(mockSubmission);
    database.submission.update.mockResolvedValue({ ...mockSubmission, status: SubmissionStatus.GRADED, marksAwarded: 90 });

    const result = await service.gradeSubmission('ass-1', 'sub-1', { marksAwarded: 90, feedback: 'Good' }, faculty);
    expect(result.marksAwarded).toBe(90);
  });

  it('rejects grade exceeding maxMarks', async () => {
    database.assignment.findFirst.mockResolvedValue(mockAssignment);
    database.class.findFirst.mockResolvedValue(mockClass);

    await expect(service.gradeSubmission('ass-1', 'sub-1', { marksAwarded: 150 }, faculty)).rejects.toBeInstanceOf(BadRequestException);
  });
});
