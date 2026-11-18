import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseAttendanceReportQuery } from './attendance.dto';
import { AttendanceReportService } from './attendance-report.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-cse' };
const faculty: AuthorizationContext = { userId: 'fac', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-cse' };

const cse = { id: 'dept-cse', code: 'CSE', name: 'Computer Science' };
const ece = { id: 'dept-ece', code: 'ECE', name: 'Electronics' };
const cls = (id: string, subject: string, department: typeof cse, section = 'A') => ({
  id,
  subject: { id: `sub-${id}`, code: subject, name: subject },
  section: { id: `sec-${id}`, code: section, semester: { name: 'Semester 1', course: { code: 'BTECH', department } } },
  faculty: { id: 'fac-1', firstName: 'Priya', lastName: 'Sharma' },
});

function createDatabase() {
  return {
    college: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    class: { findMany: jest.fn().mockResolvedValue([cls('c-db', 'DBMS', cse), cls('c-os', 'OS', cse), cls('c-ec', 'Circuits', ece)]) },
    attendance: {
      findMany: jest.fn().mockResolvedValue([
        { id: 's1', classId: 'c-db', heldOn: new Date('2026-10-30') },
        { id: 's2', classId: 'c-db', heldOn: new Date('2026-11-02') },
        { id: 's3', classId: 'c-os', heldOn: new Date('2026-11-03') },
        { id: 's4', classId: 'c-ec', heldOn: new Date('2026-11-03') },
      ]),
    },
    attendanceRecord: {
      groupBy: jest.fn().mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by[0] === 'attendanceId'
            ? [
                { attendanceId: 's1', status: 'PRESENT', _count: { _all: 1 } },
                { attendanceId: 's1', status: 'ABSENT', _count: { _all: 1 } },
                { attendanceId: 's2', status: 'ABSENT', _count: { _all: 2 } },
                { attendanceId: 's3', status: 'PRESENT', _count: { _all: 2 } },
                { attendanceId: 's4', status: 'LATE', _count: { _all: 1 } },
              ]
            : [
                { studentId: 'stu-1', status: 'PRESENT', _count: { _all: 3 } },
                { studentId: 'stu-2', status: 'ABSENT', _count: { _all: 3 } },
                { studentId: 'stu-2', status: 'PRESENT', _count: { _all: 1 } },
              ],
        ),
      ),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'stu-2', studentCode: 'S-2', firstName: 'Nisha', lastName: 'Rao', enrollments: [{ section: { code: 'A', semester: { name: 'Semester 1', course: { code: 'BTECH', department: { code: 'CSE' } } } } }] },
      ]),
    },
  };
}

describe('AttendanceReportService', () => {
  it('validates the date range', () => {
    expect(() => parseAttendanceReportQuery({ from: '2026-11-10', to: '2026-11-01' })).toThrow();
    expect(() => parseAttendanceReportQuery({ from: '2026-02-31' })).toThrow();
    expect(parseAttendanceReportQuery({ from: '2026-10-01', to: '2026-10-31', departmentId: 'dept-cse' })).toEqual({ from: '2026-10-01', to: '2026-10-31', departmentId: 'dept-cse' });
  });

  it('adds attendance up by department, class and month, and lists shortages worst first', async () => {
    const database = createDatabase();
    const report = await new AttendanceReportService(database as never).report({ from: '2026-10-01', to: '2026-11-30' }, admin);

    expect(report.range).toEqual({ from: '2026-10-01', to: '2026-11-30' });
    expect(report.sessions).toBe(4);
    expect(report.overall).toMatchObject({ attended: 4, counted: 7, percentage: 57.1 });
    expect(report.byDepartment.map((row) => [row.department.code, row.percentage])).toEqual([
      ['CSE', 50],
      ['ECE', 100],
    ]);
    const dbms = report.byClass.find((row) => row.subject.code === 'DBMS');
    expect(dbms).toMatchObject({ sessions: 2, attended: 1, counted: 4, percentage: 25, belowThreshold: true, faculty: { name: 'Priya Sharma' } });
    expect(report.byMonth.map((row) => [row.month, row.percentage])).toEqual([
      ['2026-10', 50],
      ['2026-11', 60],
    ]);
    expect(report.shortageTotal).toBe(1);
    expect(report.shortagesTruncated).toBe(false);
    expect(report.shortages).toEqual([
      expect.objectContaining({ student: { id: 'stu-2', studentCode: 'S-2', name: 'Nisha Rao' }, section: 'CSE · BTECH · Semester 1 · A', percentage: 25 }),
    ]);
  });

  it("limits an HOD to their own department and refuses faculty", async () => {
    const database = createDatabase();
    const service = new AttendanceReportService(database as never);
    await service.report({}, hod);
    expect(database.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', section: { semester: { course: { departmentId: 'dept-cse' } } } } }));
    await expect(service.report({ departmentId: 'dept-ece' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.report({}, faculty)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('defaults to the last 30 days and rejects ranges over a year', async () => {
    const database = createDatabase();
    const service = new AttendanceReportService(database as never);
    const report = await service.report({}, admin);
    const days = (Date.parse(report.range.to) - Date.parse(report.range.from)) / 86_400_000;
    expect(days).toBe(29);
    await expect(service.report({ from: '2025-01-01', to: '2026-06-01' }, admin)).rejects.toMatchObject({ response: { code: 'RANGE_TOO_LONG' } });
  });
});
