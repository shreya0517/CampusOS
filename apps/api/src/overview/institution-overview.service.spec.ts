import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { InstitutionOverviewService, todayAsStoredDate } from './institution-overview.service';

const admin: AuthorizationContext = { userId: 'admin-user', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-cse' };

const inDepartment = (departmentId: string) => ({ section: { semester: { course: { departmentId } } } });

function createDatabase() {
  return {
    college: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    student: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([{ id: 'stu-1', firstName: 'Aarav', lastName: 'Mehta', studentCode: 'S-1', createdAt: new Date('2026-11-10T09:00:00Z') }]),
    },
    faculty: {
      findMany: jest.fn().mockImplementation(({ take }: { take?: number }) =>
        take
          ? Promise.resolve([{ id: 'fac-2', firstName: 'Rohan', lastName: 'Das', employeeCode: 'F-2', createdAt: new Date('2026-11-12T09:00:00Z'), department: { code: 'ECE' } }])
          : Promise.resolve([
              { id: 'fac-1', userId: 'user-priya', departmentId: 'dept-cse', firstName: 'Priya', lastName: 'Sharma', employeeCode: 'F-1' },
              { id: 'fac-2', userId: 'user-rohan', departmentId: 'dept-ece', firstName: 'Rohan', lastName: 'Das', employeeCode: 'F-2' },
              { id: 'fac-3', userId: null, departmentId: 'dept-cse', firstName: 'Meera', lastName: 'Iyer', employeeCode: 'F-3' },
            ]),
      ),
    },
    department: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'dept-cse', code: 'CSE', name: 'Computer Science' },
        { id: 'dept-ece', code: 'ECE', name: 'Electronics' },
      ]),
    },
    attendanceRecord: {
      groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) =>
        by.length === 1
          ? Promise.resolve([
              { status: 'PRESENT', _count: { _all: 3 } },
              { status: 'ABSENT', _count: { _all: 1 } },
            ])
          : Promise.resolve([
              { attendanceId: 'att-cse', status: 'PRESENT', _count: { _all: 9 } },
              { attendanceId: 'att-cse', status: 'ABSENT', _count: { _all: 1 } },
              { attendanceId: 'att-ece', status: 'ABSENT', _count: { _all: 2 } },
              { attendanceId: 'att-ece', status: 'LATE', _count: { _all: 2 } },
            ]),
      ),
    },
    attendance: {
      findMany: jest.fn().mockImplementation(({ take }: { take?: number }) =>
        take
          ? Promise.resolve([
              {
                id: 'att-cse',
                heldOn: new Date('2026-11-18'),
                createdAt: new Date('2026-11-18T08:00:00Z'),
                class: { subject: { code: 'CS302', name: 'DBMS' }, section: { code: 'A' }, faculty: { firstName: 'Priya', lastName: 'Sharma' } },
              },
            ])
          : Promise.resolve([
              { id: 'att-cse', class: inDepartment('dept-cse') },
              { id: 'att-ece', class: inDepartment('dept-ece') },
            ]),
      ),
    },
    taskAssignment: {
      groupBy: jest.fn().mockResolvedValue([
        { assigneeUserId: 'user-priya', status: 'PENDING', _count: { _all: 2 } },
        { assigneeUserId: 'user-priya', status: 'APPROVED', _count: { _all: 1 } },
        { assigneeUserId: 'user-rohan', status: 'REWORK', _count: { _all: 1 } },
        { assigneeUserId: 'user-rohan', status: 'SUBMITTED', _count: { _all: 1 } },
      ]),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ submittedAt: new Date('2026-11-17T10:00:00Z'), task: { id: 'task-1', title: 'NAAC report' }, assignee: { displayName: 'Dr. Rohan Das' } }]),
    },
    visitor: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([{ id: 'vis-1', name: 'Ramesh', purpose: 'Parent meeting', status: 'PENDING', createdAt: new Date('2026-11-16T10:00:00Z') }]),
    },
    exam: { count: jest.fn().mockResolvedValue(1) },
    payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: '15000.00' } }) },
    invoice: {
      findMany: jest.fn().mockResolvedValue([
        { amountDue: '65000.00', dueOn: new Date('2026-01-01'), payments: [{ amount: '15000.00' }] },
        { amountDue: '20000.00', dueOn: new Date('2999-01-01'), payments: [] },
      ]),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([
        { studentId: 'stu-1', ...inDepartment('dept-cse') },
        { studentId: 'stu-1', ...inDepartment('dept-cse') },
        { studentId: 'stu-2', ...inDepartment('dept-cse') },
        { studentId: 'stu-3', ...inDepartment('dept-ece') },
      ]),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([{ userId: 'user-rohan' }]) },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([{ action: 'MARKS_SUBMITTED', entityId: 'es-1', createdAt: new Date('2026-11-18T09:00:00Z'), actor: { displayName: 'Dr. Priya Sharma' } }]),
    },
    examSubject: { findMany: jest.fn().mockResolvedValue([{ id: 'es-1', examId: 'exam-1', subject: { name: 'DBMS' } }]) },
  };
}

describe('InstitutionOverviewService', () => {
  it('is for admins only', async () => {
    const service = new InstitutionOverviewService(createDatabase() as never);
    await expect(service.overview(hod)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('adds up totals, attendance, tasks and fees from stored records', async () => {
    const database = createDatabase();
    const report = await new InstitutionOverviewService(database as never).overview(admin);

    expect(report.totals).toEqual({ students: 3, faculty: 3, departments: 2 });
    expect(report.attendance.today).toMatchObject({ attended: 3, counted: 4, percentage: 75 });
    expect(report.attendance.window).toMatchObject({ attended: 11, counted: 14, percentage: 78.6 });
    expect(report.tasks).toEqual({ pending: 2, inProgress: 0, submitted: 1, approved: 1, rework: 1, overdue: 1 });
    expect(report.pendingVisitors).toBe(2);
    expect(report.upcomingExams).toBe(1);
    expect(report.fees).toEqual({ collected: 15000, outstanding: 70000, openInvoices: 2, overdueInvoices: 1 });
    // Every query stays inside the admin's college.
    expect(database.college.findUnique).toHaveBeenCalledWith({ where: { id: 'col-a' }, select: { timezone: true } });
    const { college: _college, ...tenantModels } = database;
    for (const model of Object.values(tenantModels)) {
      for (const fn of Object.values(model)) {
        for (const [args] of (fn as jest.Mock).mock.calls) expect((args as { where: { collegeId: string } }).where.collegeId).toBe('col-a');
      }
    }
    // The attendance window stops at today, so future-dated sessions don't count.
    const windowQuery = database.attendance.findMany.mock.calls.find(([args]) => !(args as { take?: number }).take)?.[0] as { where: { heldOn: { gte: Date; lte: Date } } };
    expect(windowQuery.where.heldOn.lte).toEqual(todayAsStoredDate('Asia/Kolkata'));
  });

  it('gives each department its HOD, people, attendance and open tasks', async () => {
    const report = await new InstitutionOverviewService(createDatabase() as never).overview(admin);
    const [cse, ece] = report.departments;
    expect(cse).toMatchObject({ code: 'CSE', hod: null, faculty: 2, students: 2, openTasks: 2 });
    expect(cse?.attendance).toMatchObject({ percentage: 90, belowThreshold: false });
    expect(ece).toMatchObject({ code: 'ECE', hod: { id: 'fac-2', name: 'Rohan Das', employeeCode: 'F-2' }, faculty: 1, students: 1, openTasks: 1 });
    expect(ece?.attendance).toMatchObject({ percentage: 50, belowThreshold: true });
  });

  it('lists recent activity newest first with links to the records', async () => {
    const report = await new InstitutionOverviewService(createDatabase() as never).overview(admin);
    expect(report.recentActivity.map((item) => item.type)).toEqual([
      'MARKS_SUBMITTED',
      'ATTENDANCE_MARKED',
      'TASK_SUBMITTED',
      'VISITOR_REGISTERED',
      'FACULTY_ADDED',
      'STUDENT_ADDED',
    ]);
    expect(report.recentActivity[0]).toMatchObject({ detail: 'DBMS · by Dr. Priya Sharma', href: '/dashboard/exams/exam-1/subjects/es-1/marks' });
  });

  it("reads today in the college's timezone", () => {
    // 20:00 UTC on 18 Nov is already 19 Nov in India, still 18 Nov in New York.
    const now = new Date('2026-11-18T20:00:00Z');
    expect(todayAsStoredDate('Asia/Kolkata', now).toISOString()).toBe('2026-11-19T00:00:00.000Z');
    expect(todayAsStoredDate('America/New_York', now).toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(() => todayAsStoredDate('Not/AZone', now)).not.toThrow();
  });
});
