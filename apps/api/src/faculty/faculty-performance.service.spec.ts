import { ForbiddenException } from '@nestjs/common';
import { FacultyPerformanceService } from './faculty-performance.service';
import type { AuthorizationContext } from '../authorization/authorization.types';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
const faculty: AuthorizationContext = { userId: 'fac', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };

describe('FacultyPerformanceService', () => {
  const database = {
    faculty: { findMany: jest.fn() },
    class: { findMany: jest.fn() },
    attendance: { findMany: jest.fn() },
    assignment: { groupBy: jest.fn() },
    submission: { findMany: jest.fn() },
    taskAssignment: { groupBy: jest.fn() },
  };
  const service = new FacultyPerformanceService(database as never);

  beforeEach(() => {
    jest.clearAllMocks();
    database.faculty.findMany.mockResolvedValue([
      { id: 'f1', userId: 'u1', employeeCode: 'E1', firstName: 'Priya', lastName: 'Sharma', department: { id: 'dept-a', code: 'CSE', name: 'CSE' } },
      { id: 'f2', userId: null, employeeCode: 'E2', firstName: 'Rohan', lastName: 'Das', department: { id: 'dept-a', code: 'CSE', name: 'CSE' } },
    ]);
    database.class.findMany.mockResolvedValue([{ id: 'c1', facultyId: 'f1' }, { id: 'c2', facultyId: 'f1' }]);
    database.attendance.findMany.mockResolvedValue([{ class: { facultyId: 'f1' } }, { class: { facultyId: 'f1' } }, { class: { facultyId: 'f1' } }]);
    database.assignment.groupBy.mockResolvedValue([{ createdById: 'f1', _count: { _all: 2 } }]);
    database.submission.findMany.mockResolvedValue([{ assignment: { class: { facultyId: 'f1' } } }]);
    database.taskAssignment.groupBy.mockImplementation(({ by }: { by: string[] }) =>
      Promise.resolve(by.length === 2
        ? [{ assigneeUserId: 'u1', status: 'PENDING', _count: { _all: 2 } }, { assigneeUserId: 'u1', status: 'APPROVED', _count: { _all: 1 } }]
        : [{ assigneeUserId: 'u1', _count: { _all: 1 } }]),
    );
  });

  it('keeps an HOD to their own department and blocks faculty', async () => {
    await expect(service.report({ departmentId: 'dept-b' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.report({}, faculty)).rejects.toBeInstanceOf(ForbiddenException);
    await service.report({}, hod);
    expect(database.faculty.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', departmentId: 'dept-a' } }));
  });

  it('lets an admin see every department or filter to one', async () => {
    await service.report({}, admin);
    expect(database.faculty.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'col-a' } }));
    await service.report({ departmentId: 'dept-b' }, admin);
    expect(database.faculty.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', departmentId: 'dept-b' } }));
  });

  it('builds each row from records: classes, sessions, coursework, evaluations and tasks', async () => {
    const report = await service.report({}, hod);
    expect(report.windowDays).toBe(30);
    expect(report.faculty[0]).toEqual({
      faculty: { id: 'f1', employeeCode: 'E1', firstName: 'Priya', lastName: 'Sharma', department: { id: 'dept-a', code: 'CSE', name: 'CSE' } },
      classes: 2,
      sessionsMarked: 3,
      assignmentsCreated: 2,
      pendingEvaluations: 1,
      tasks: { assigned: 3, pending: 2, inProgress: 0, submitted: 0, approved: 1, rework: 0, overdue: 1 },
    });
    expect(report.faculty[1]).toMatchObject({ classes: 0, sessionsMarked: 0, tasks: { assigned: 0 } });
    expect(report.faculty[1]!.faculty).not.toHaveProperty('userId');
  });
});
