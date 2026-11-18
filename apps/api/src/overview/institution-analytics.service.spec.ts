import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { InstitutionAnalyticsService, monthsBetween } from './institution-analytics.service';
import { todayAsStoredDate } from './institution-overview.service';
import { parseAnalyticsQuery } from './overview.dto';

const admin: AuthorizationContext = { userId: 'admin-user', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-cse' };
const RANGE = { from: '2026-08-01', to: '2026-10-31' };

type Where = { departmentId?: string; semester?: { course?: { departmentId?: string } } };
const day = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * Two departments. CSE: semester 3, students s1 and s2, faculty f1 (active) and f2 (disabled). ECE: semester 5, s3
 * active and s4 withdrawn, f3 without an account. s5 has no enrollment.
 */
function createDatabase() {
  return {
    college: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    department: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'dept-cse', code: 'CSE', name: 'Computer Science' },
        { id: 'dept-ece', code: 'ECE', name: 'Electronics' },
      ]),
    },
    course: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c-cse', code: 'BTCSE', name: 'B.Tech CSE', departmentId: 'dept-cse' },
        { id: 'c-ece', code: 'BTECE', name: 'B.Tech ECE', departmentId: 'dept-ece' },
      ]),
    },
    semester: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'sem-cse-3', number: 3, courseId: 'c-cse' },
        { id: 'sem-ece-5', number: 5, courseId: 'c-ece' },
      ]),
    },
    section: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'sec-cse', semesterId: 'sem-cse-3' },
        { id: 'sec-ece', semesterId: 'sem-ece-5' },
      ]),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([
        { studentId: 's1', sectionId: 'sec-cse', status: 'ACTIVE', enrolledAt: day('2026-08-10') },
        { studentId: 's2', sectionId: 'sec-cse', status: 'ACTIVE', enrolledAt: day('2026-09-05') },
        { studentId: 's3', sectionId: 'sec-ece', status: 'ACTIVE', enrolledAt: day('2026-02-01') },
        { studentId: 's4', sectionId: 'sec-ece', status: 'WITHDRAWN', enrolledAt: day('2026-08-20') },
      ]),
    },
    student: { count: jest.fn().mockResolvedValue(5) },
    faculty: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Where }) =>
        Promise.resolve(
          [
            { id: 'f1', departmentId: 'dept-cse', designation: 'Professor', user: { status: 'ACTIVE' } },
            { id: 'f2', departmentId: 'dept-cse', designation: 'Assistant Professor', user: { status: 'INACTIVE' } },
            { id: 'f3', departmentId: 'dept-ece', designation: null, user: null },
          ].filter((member) => !where.departmentId || member.departmentId === where.departmentId),
        ),
      ),
    },
    attendance: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'a1', heldOn: day('2026-09-10'), class: { sectionId: 'sec-cse' } },
        { id: 'a2', heldOn: day('2026-10-02'), class: { sectionId: 'sec-ece' } },
      ]),
    },
    attendanceRecord: {
      groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by.includes('attendanceId')
            ? [
                { attendanceId: 'a1', status: 'PRESENT', _count: { _all: 1 } },
                { attendanceId: 'a1', status: 'ABSENT', _count: { _all: 1 } },
                { attendanceId: 'a2', status: 'PRESENT', _count: { _all: 1 } },
              ]
            : [
                { studentId: 's1', status: 'PRESENT', _count: { _all: 1 } },
                { studentId: 's2', status: 'ABSENT', _count: { _all: 1 } },
                { studentId: 's3', status: 'PRESENT', _count: { _all: 1 } },
              ],
        ),
      ),
    },
    assignment: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'as1', class: { sectionId: 'sec-cse' } },
        { id: 'as2', class: { sectionId: 'sec-ece' } },
      ]),
    },
    // as1 has three submissions but only two students are enrolled, so it counts as two.
    submission: {
      groupBy: jest.fn().mockResolvedValue([
        { assignmentId: 'as1', status: 'SUBMITTED', _count: { _all: 1 } },
        { assignmentId: 'as1', status: 'LATE', _count: { _all: 1 } },
        { assignmentId: 'as1', status: 'GRADED', _count: { _all: 1 } },
        { assignmentId: 'as2', status: 'DRAFT', _count: { _all: 1 } },
      ]),
    },
    exam: { findMany: jest.fn().mockResolvedValue([{ id: 'e1', name: 'Mid Term', startsOn: day('2026-09-20'), status: 'COMPLETED' }]) },
    examSubject: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Where }) =>
        Promise.resolve(
          [
            { id: 'p1', examId: 'e1', semesterId: 'sem-cse-3', maxMarks: 100, passMarks: 40, marksStatus: 'APPROVED', departmentId: 'dept-cse' },
            { id: 'p2', examId: 'e1', semesterId: 'sem-ece-5', maxMarks: 50, passMarks: 20, marksStatus: 'SUBMITTED', departmentId: 'dept-ece' },
          ]
            .filter((paper) => !where.semester?.course?.departmentId || paper.departmentId === where.semester.course.departmentId),
        ),
      ),
    },
    mark: {
      findMany: jest.fn().mockResolvedValue([
        { examSubjectId: 'p1', marksObtained: 80, isAbsent: false },
        { examSubjectId: 'p1', marksObtained: 30, isAbsent: false },
      ]),
    },
    result: {
      findMany: jest.fn().mockResolvedValue([
        { examId: 'e1', studentId: 's1', status: 'PASSED', percentage: 80 },
        { examId: 'e1', studentId: 's2', status: 'FAILED', percentage: 30 },
      ]),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([
        // CSE, past due with 30,000 still owed; a failed attempt doesn't count as collected.
        {
          studentId: 's1',
          amountDue: 50000,
          dueOn: day('2026-09-30'),
          status: 'ISSUED',
          feeStructure: { courseId: 'c-cse', semesterId: 'sem-cse-3' },
          payments: [
            { amount: 20000, status: 'COMPLETED', paidAt: new Date('2026-09-15T10:00:00Z'), createdAt: new Date('2026-09-15T09:00:00Z') },
            { amount: 5000, status: 'FAILED', paidAt: null, createdAt: new Date('2026-09-16T09:00:00Z') },
          ],
        },
        // No fee structure: attributed to the student's current enrollment (ECE).
        { studentId: 's3', amountDue: 40000, dueOn: null, status: 'PAID', feeStructure: null, payments: [{ amount: 40000, status: 'COMPLETED', paidAt: new Date('2026-10-05T10:00:00Z'), createdAt: new Date('2026-10-05T09:00:00Z') }] },
        { studentId: 's2', amountDue: 10000, dueOn: null, status: 'VOID', feeStructure: { courseId: 'c-cse', semesterId: null }, payments: [] },
      ]),
    },
  };
}

describe('InstitutionAnalyticsService', () => {
  it('is Admin only and checks the department and the range', async () => {
    const service = new InstitutionAnalyticsService(createDatabase() as never);
    await expect(service.analytics({}, hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.analytics({ departmentId: 'dept-other' }, admin)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.analytics({ from: '2026-10-02', to: '2026-10-01' }, admin)).rejects.toMatchObject({ response: { code: 'INVALID_RANGE' } });
    await expect(service.analytics({ from: '2025-01-01', to: '2026-10-01' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('defaults to this month and the five before it, ending today', async () => {
    const result = await new InstitutionAnalyticsService(createDatabase() as never).analytics({}, admin);
    const today = todayAsStoredDate('Asia/Kolkata').toISOString().slice(0, 10);
    expect(result.range.to).toBe(today);
    expect(result.range.from).toMatch(/-01$/);
    expect(result.students.enrollmentTrend).toHaveLength(6);
    expect(monthsBetween(day('2025-11-15'), day('2026-02-01'))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('reports students, faculty and attendance across the college', async () => {
    const result = await new InstitutionAnalyticsService(createDatabase() as never).analytics(RANGE, admin);
    expect(result.students).toMatchObject({
      total: 5,
      active: 3,
      inactive: 2,
      byCourse: [
        { course: { code: 'BTCSE' }, students: 2 },
        { course: { code: 'BTECE' }, students: 1 },
      ],
      bySemester: [
        { semester: 3, students: 2 },
        { semester: 5, students: 1 },
      ],
      enrollmentTrend: [
        { month: '2026-08', enrollments: 2 },
        { month: '2026-09', enrollments: 1 },
        { month: '2026-10', enrollments: 0 },
      ],
    });
    expect(result.faculty).toEqual({
      total: 3,
      active: 1,
      inactive: 1,
      withoutAccount: 1,
      studentsPerFaculty: 1,
      byDesignation: [
        { designation: 'Assistant Professor', faculty: 1 },
        { designation: 'Not set', faculty: 1 },
        { designation: 'Professor', faculty: 1 },
      ],
    });
    expect(result.attendance).toMatchObject({
      sessions: 2,
      overall: { attended: 2, counted: 3, percentage: 66.7 },
      bySemester: [
        { semester: 3, percentage: 50 },
        { semester: 5, percentage: 100 },
      ],
      byMonth: [
        { month: '2026-08', percentage: null },
        { month: '2026-09', percentage: 50 },
        { month: '2026-10', percentage: 100 },
      ],
      shortage: { students: 1, counted: 3, percentage: 33.3 },
    });
  });

  it('reports assignment completion and exam performance', async () => {
    const result = await new InstitutionAnalyticsService(createDatabase() as never).analytics(RANGE, admin);
    expect(result.academics.assignments).toEqual({ due: 2, expected: 3, submitted: 2, late: 1, graded: 1, completion: 66.7 });
    expect(result.academics.results).toEqual({ published: 2, passed: 1, failed: 1, passPercentage: 50, averagePercentage: 55 });
    expect(result.academics.papers).toEqual({ approved: 1, total: 2, entries: 2, passed: 1, passPercentage: 50, averageScore: 55 });
    expect(result.academics.exams).toEqual([
      expect.objectContaining({ id: 'e1', startsOn: '2026-09-20', papers: 2, approvedPapers: 1, marks: expect.objectContaining({ passPercentage: 50 }), results: expect.objectContaining({ published: 2 }) }),
    ]);
  });

  it('reports fees: outstanding and status as of today, collections in the range', async () => {
    const result = await new InstitutionAnalyticsService(createDatabase() as never).analytics(RANGE, admin);
    expect(result.finance).toEqual({
      billed: 90000,
      paid: 60000,
      outstanding: 30000,
      collectionRate: 66.7,
      overdue: { invoices: 1, amount: 30000 },
      collected: 60000,
      trend: [
        { month: '2026-08', amount: 0, payments: 0 },
        { month: '2026-09', amount: 20000, payments: 1 },
        { month: '2026-10', amount: 40000, payments: 1 },
      ],
      invoiceStatus: [
        { status: 'PAID', invoices: 1, amount: 40000 },
        { status: 'OVERDUE', invoices: 1, amount: 30000 },
        { status: 'VOID', invoices: 1, amount: 10000 },
      ],
      paymentStatus: [
        { status: 'COMPLETED', payments: 2, amount: 60000 },
        { status: 'FAILED', payments: 1, amount: 5000 },
      ],
      byCourse: [
        { course: { id: 'c-cse', code: 'BTCSE', name: 'B.Tech CSE' }, departmentId: 'dept-cse', billed: 50000, collected: 20000, outstanding: 30000 },
        { course: { id: 'c-ece', code: 'BTECE', name: 'B.Tech ECE' }, departmentId: 'dept-ece', billed: 40000, collected: 40000, outstanding: 0 },
      ],
    });
  });

  it('compares departments', async () => {
    const result = await new InstitutionAnalyticsService(createDatabase() as never).analytics(RANGE, admin);
    expect(result.departments).toEqual([
      {
        department: { id: 'dept-cse', code: 'CSE', name: 'Computer Science' },
        students: 2,
        faculty: 2,
        studentsPerFaculty: 1,
        attendance: 50,
        shortage: 1,
        assignmentCompletion: 100,
        passPercentage: 50,
        averageScore: 55,
        collected: 20000,
        outstanding: 30000,
      },
      {
        department: { id: 'dept-ece', code: 'ECE', name: 'Electronics' },
        students: 1,
        faculty: 1,
        studentsPerFaculty: 1,
        attendance: 100,
        shortage: 0,
        assignmentCompletion: 0,
        passPercentage: null,
        averageScore: null,
        collected: 40000,
        outstanding: 0,
      },
    ]);
  });

  it('limits every section to the chosen department', async () => {
    const database = createDatabase();
    const result = await new InstitutionAnalyticsService(database as never).analytics({ ...RANGE, departmentId: 'dept-ece' }, admin);
    expect(database.student.count).not.toHaveBeenCalled();
    expect(result.students).toMatchObject({ total: 2, active: 1, inactive: 1 });
    expect(result.faculty).toMatchObject({ total: 1, studentsPerFaculty: 1 });
    const inEce = { class: { section: { semester: { course: { departmentId: 'dept-ece' } } } } };
    expect(database.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(inEce) }));
    expect(database.attendanceRecord.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', attendance: expect.objectContaining(inEce) } }));
    expect(database.assignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(inEce) }));
    // Only the ECE paper is in scope, and its marks aren't approved; CSE students' results are left out.
    expect(database.mark.findMany).not.toHaveBeenCalled();
    expect(result.academics.results.published).toBe(0);
    expect(result.academics.exams).toEqual([expect.objectContaining({ id: 'e1', papers: 1, approvedPapers: 0 })]);
    expect(result.finance).toMatchObject({ billed: 40000, outstanding: 0, collected: 40000 });
    expect(result.departments.map((row) => row.department.code)).toEqual(['ECE']);
  });

  it('limits students and fees to the chosen semester', async () => {
    const result = await new InstitutionAnalyticsService(createDatabase() as never).analytics({ ...RANGE, semester: 3 }, admin);
    expect(result.students).toMatchObject({ total: 2, active: 2, bySemester: [{ semester: 3, students: 2 }] });
    expect(result.finance).toMatchObject({ billed: 50000, outstanding: 30000 });
    // Faculty don't belong to a semester, so the ratio still uses each department's students.
    expect(result.faculty.studentsPerFaculty).toBe(1);
  });
});

describe('parseAnalyticsQuery', () => {
  it('reads optional filters', () => {
    expect(parseAnalyticsQuery({})).toEqual({ departmentId: undefined, semester: undefined, from: undefined, to: undefined });
    expect(parseAnalyticsQuery({ departmentId: 'dept-cse', semester: '3', from: '2026-08-01', to: '2026-10-31' })).toEqual({
      departmentId: 'dept-cse',
      semester: 3,
      from: '2026-08-01',
      to: '2026-10-31',
    });
    expect(parseAnalyticsQuery({ departmentId: '', semester: '' })).toMatchObject({ departmentId: undefined, semester: undefined });
  });

  it('rejects a bad semester or date', () => {
    for (const query of [{ semester: '0' }, { semester: '13' }, { semester: '2.5' }, { semester: 'x' }, { from: '2026-02-31' }, { from: '2026-10-02', to: '2026-10-01' }]) {
      expect(() => parseAnalyticsQuery(query)).toThrow(BadRequestException);
    }
  });
});
