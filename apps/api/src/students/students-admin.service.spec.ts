import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseAccountStatusDto, parseStudentListQuery } from './students.dto';
import { StudentRecordService } from './student-record.service';
import { csvCell, StudentsService } from './students.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'college-a', roles: ['HOD'], permissions: [], departmentId: 'department-a' };
const faculty: AuthorizationContext = { userId: 'fac', collegeId: 'college-a', roles: ['FACULTY'], permissions: [], departmentId: 'department-a' };

const section = { id: 'section-a', code: 'A', semester: { id: 'sem-1', name: 'Semester 1', number: 1, course: { id: 'c-1', code: 'BTECH', name: 'B.Tech CSE', department: { id: 'department-a', code: 'CSE', name: 'Computer Science' } } } };
const studentRow = {
  id: 'student-a',
  collegeId: 'college-a',
  userId: 'user-a',
  studentCode: 'STU-1',
  firstName: 'Aarav',
  lastName: 'Mehta',
  enrollments: [{ status: 'ACTIVE', section }],
  user: { email: 'aarav@college.test', status: 'ACTIVE' },
};

function createDatabase() {
  const database = {
    student: { findMany: jest.fn().mockResolvedValue([studentRow]), count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(studentRow) },
    section: { findMany: jest.fn().mockResolvedValue([section]) },
    user: { update: jest.fn() },
    authSession: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
  return database;
}

describe('StudentsService admin features', () => {
  it('parses the account filter and status bodies', () => {
    expect(parseStudentListQuery({ accountStatus: 'NO_ACCOUNT' })).toMatchObject({ accountStatus: 'NO_ACCOUNT' });
    expect(() => parseStudentListQuery({ accountStatus: 'SUSPENDED' })).toThrow();
    expect(parseAccountStatusDto({ status: 'INACTIVE' })).toEqual({ status: 'INACTIVE' });
    expect(() => parseAccountStatusDto({ status: 'SUSPENDED' })).toThrow();
  });

  it('shows account email and status to admins but not to faculty', async () => {
    const database = createDatabase();
    const service = new StudentsService(database as never);
    const asAdmin = await service.list(parseStudentListQuery({}), admin);
    expect(asAdmin.items[0]).toMatchObject({ account: { email: 'aarav@college.test', status: 'ACTIVE' } });
    expect(asAdmin.items[0]).not.toHaveProperty('user');
    database.student.findMany.mockResolvedValue([studentRow]);
    const asFaculty = await service.list(parseStudentListQuery({}), faculty);
    expect(asFaculty.items[0]).not.toHaveProperty('account');
    expect(asFaculty.items[0]).not.toHaveProperty('user');
  });

  it('filters by account status for admins and ignores the filter for faculty', async () => {
    const database = createDatabase();
    const service = new StudentsService(database as never);
    const whereFor = async (accountStatus: string, context: AuthorizationContext) => {
      await service.list(parseStudentListQuery({ accountStatus }), context);
      return (database.student.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> }).where;
    };
    expect(await whereFor('ACTIVE', admin)).toMatchObject({ user: { is: { status: 'ACTIVE' } } });
    expect(await whereFor('INACTIVE', admin)).toMatchObject({ user: { is: { status: { in: ['INACTIVE', 'SUSPENDED'] } } } });
    expect(await whereFor('NO_ACCOUNT', hod)).toMatchObject({ userId: null });
    const facultyWhere = await whereFor('NO_ACCOUNT', faculty);
    expect(facultyWhere).not.toHaveProperty('userId');
    expect(facultyWhere).not.toHaveProperty('user');
  });

  it('deactivates an account, ends its sessions and audits it; admins only', async () => {
    const database = createDatabase();
    const service = new StudentsService(database as never);
    await service.setAccountStatus('student-a', { status: 'INACTIVE' }, admin);
    expect(database.user.update).toHaveBeenCalledWith({ where: { collegeId_id: { collegeId: 'college-a', id: 'user-a' } }, data: { status: 'INACTIVE' } });
    expect(database.authSession.updateMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', userId: 'user-a', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'STUDENT_ACCOUNT_DEACTIVATED', entityId: 'student-a', actorId: 'admin' }) });

    database.authSession.updateMany.mockClear();
    await service.setAccountStatus('student-a', { status: 'ACTIVE' }, admin);
    expect(database.authSession.updateMany).not.toHaveBeenCalled();
    await expect(service.setAccountStatus('student-a', { status: 'INACTIVE' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the account details in the response after a profile edit', async () => {
    const database = { ...createDatabase(), student: { ...createDatabase().student, update: jest.fn().mockResolvedValue(studentRow) } };
    const service = new StudentsService(database as never);
    await expect(service.update('student-a', { firstName: 'Aarav' }, admin)).resolves.toMatchObject({ account: { email: 'aarav@college.test', status: 'ACTIVE' } });
  });

  it('refuses to change the status of a student without an account', async () => {
    const database = createDatabase();
    database.student.findFirst.mockResolvedValue({ id: 'student-b', userId: null });
    const service = new StudentsService(database as never);
    await expect(service.setAccountStatus('student-b', { status: 'INACTIVE' }, admin)).rejects.toMatchObject({ response: { code: 'NO_ACCOUNT' } });
    expect(database.user.update).not.toHaveBeenCalled();
  });

  it('exports CSV for admins, with formula-like cells neutralised', async () => {
    const database = createDatabase();
    database.student.findMany.mockResolvedValue([{ ...studentRow, firstName: '=HYPERLINK("x")' }]);
    const service = new StudentsService(database as never);
    const csv = await service.exportCsv(parseStudentListQuery({}), admin);
    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe('"Student code","First name","Last name","Email","Department","Course","Semester","Section","Enrollment status","Account status"');
    expect(row).toBe('"STU-1","\'=HYPERLINK(""x"")","Mehta","aarav@college.test","Computer Science","B.Tech CSE","Semester 1","A","ACTIVE","ACTIVE"');
    await expect(service.exportCsv(parseStudentListQuery({}), hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(csvCell('-1+2')).toBe('"\'-1+2"');
  });

  it("lists sections for enrollment forms, limited to an HOD's department", async () => {
    const database = createDatabase();
    const service = new StudentsService(database as never);
    await service.sections(hod);
    expect(database.section.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'college-a', semester: { course: { departmentId: 'department-a' } } } }));
    await service.sections(admin);
    expect(database.section.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'college-a' } }));
    await expect(service.sections(faculty)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('StudentRecordService', () => {
  function createRecordDatabase() {
    return {
      ...createDatabase(),
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'PRESENT', attendance: { class: { subject: { id: 'sub-db', code: 'CS302', name: 'DBMS' } } } },
          { status: 'ABSENT', attendance: { class: { subject: { id: 'sub-db', code: 'CS302', name: 'DBMS' } } } },
          { status: 'PRESENT', attendance: { class: { subject: { id: 'sub-os', code: 'CS301', name: 'Operating Systems' } } } },
        ]),
      },
      assignment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a-1', title: 'ER diagram', dueAt: new Date('2026-01-01'), maxMarks: '20', class: { subject: { code: 'CS302', name: 'DBMS' } }, submissions: [{ status: 'GRADED', submittedAt: new Date('2025-12-30'), marksAwarded: '18' }] },
          { id: 'a-2', title: 'Scheduler', dueAt: new Date('2026-01-02'), maxMarks: '20', class: { subject: { code: 'CS301', name: 'Operating Systems' } }, submissions: [] },
          { id: 'a-3', title: 'Paging', dueAt: new Date('2999-01-01'), maxMarks: '20', class: { subject: { code: 'CS301', name: 'Operating Systems' } }, submissions: [] },
        ]),
      },
      result: { findMany: jest.fn().mockResolvedValue([{ id: 'r-1', totalMarks: '75', percentage: '75', status: 'PASSED', publishedAt: new Date('2026-11-01'), exam: { id: 'e-1', name: 'Mid-Semester' } }]) },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i-1', invoiceNumber: 'INV-1', amountDue: '65000', dueOn: new Date('2026-11-30'), status: 'PARTIALLY_PAID', issuedAt: null, payments: [{ id: 'p-1', amount: '15000', method: 'ONLINE', status: 'COMPLETED', paidAt: new Date('2026-11-02'), transactionRef: 'pay_1' }, { id: 'p-2', amount: '5000', method: 'ONLINE', status: 'FAILED', paidAt: null, transactionRef: null }] },
        ]),
      },
    };
  }

  it('builds the full record for an admin, including fees', async () => {
    const database = createRecordDatabase();
    const service = new StudentRecordService(database as never, new StudentsService(database as never));
    const report = await service.record('student-a', admin);
    expect(report.student).toMatchObject({ id: 'student-a', account: { email: 'aarav@college.test' } });
    expect(report.attendance.overall).toMatchObject({ attended: 2, counted: 3, percentage: 66.7, belowThreshold: true });
    expect(report.attendance.subjects.map((row) => [row.subject.code, row.percentage])).toEqual([
      ['CS302', 50],
      ['CS301', 100],
    ]);
    expect(report.coursework).toMatchObject({ assigned: 3, submitted: 1, missing: 1 });
    expect(report.coursework.items.map((item) => item.status)).toEqual(['GRADED', 'MISSING', 'NOT_SUBMITTED']);
    expect(report.results[0]).toMatchObject({ percentage: 75, status: 'PASSED' });
    expect(report.fees).toMatchObject({ billed: 65000, paid: 15000, balance: 50000 });
    expect(database.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'college-a', studentId: 'student-a', status: { not: 'DRAFT' } } }));
  });

  it('gives an HOD the academic record without fees, inside their department', async () => {
    const database = createRecordDatabase();
    const service = new StudentRecordService(database as never, new StudentsService(database as never));
    const report = await service.record('student-a', hod);
    expect(report.fees).toBeNull();
    expect(database.invoice.findMany).not.toHaveBeenCalled();
    // The HOD's lookup is limited to students enrolled in their department...
    expect(database.student.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'student-a', collegeId: 'college-a', enrollments: { some: { section: { semester: { course: { departmentId: 'department-a' } } } } } } }));
    // ...and so is every record query, in case the student also has records in another department.
    const inDepartment = { semester: { course: { departmentId: 'department-a' } } };
    const whereOf = (fn: jest.Mock) => (fn.mock.calls[0]?.[0] as { where: unknown }).where;
    expect(whereOf(database.attendanceRecord.findMany)).toEqual({ collegeId: 'college-a', studentId: 'student-a', attendance: { class: { section: inDepartment } } });
    expect(whereOf(database.assignment.findMany)).toEqual({ collegeId: 'college-a', class: { section: { enrollments: { some: { collegeId: 'college-a', studentId: 'student-a', status: 'ACTIVE' } }, ...inDepartment } } });
    expect(whereOf(database.result.findMany)).toEqual({ collegeId: 'college-a', studentId: 'student-a', publishedAt: { not: null }, exam: { examSubjects: { some: inDepartment } } });
  });

  it('counts an overdue draft as missed coursework, and lists undated assignments last', async () => {
    const database = createRecordDatabase();
    database.assignment.findMany.mockResolvedValue([
      { id: 'a-4', title: 'Draft only', dueAt: new Date('2026-01-03'), maxMarks: '10', class: { subject: { code: 'CS302', name: 'DBMS' } }, submissions: [{ status: 'DRAFT', submittedAt: null, marksAwarded: null }] },
    ]);
    const service = new StudentRecordService(database as never, new StudentsService(database as never));
    const report = await service.record('student-a', admin);
    expect(report.coursework).toMatchObject({ assigned: 1, submitted: 0, missing: 1 });
    expect(report.coursework.items[0]?.status).toBe('MISSING');
    expect(database.assignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ dueAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }] }));
  });

  it('is not available to faculty', async () => {
    const database = createRecordDatabase();
    const service = new StudentRecordService(database as never, new StudentsService(database as never));
    await expect(service.record('student-a', faculty)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
