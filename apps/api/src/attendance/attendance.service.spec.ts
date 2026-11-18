import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseAttendanceListQuery, parseClassListQuery, parseCreateAttendanceDto, parseMyAttendanceQuery, parseUpdateAttendanceDto } from './attendance.dto';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
const faculty: AuthorizationContext = { userId: 'faculty-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
const student: AuthorizationContext = { userId: 'stu', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

const mockClass = { id: 'class-a', collegeId: 'col-a', sectionId: 'sec-a', subjectId: 'subj-a', facultyId: 'faculty-user', section: { semester: { course: { departmentId: 'dept-a' } } }, subject: {}, faculty: {} };
const mockAttendance = { id: 'att-a', collegeId: 'col-a', classId: 'class-a', heldOn: new Date('2026-09-01'), createdAt: new Date(), class: mockClass, records: [] as Array<{ studentId: string; status: AttendanceStatus; note: string | null; student: { id: string; firstName: string; lastName: string; studentCode: string } }> };

describe('AttendanceService', () => {
  const attendance = { create: jest.fn(), findFirst: jest.fn(), findFirstOrThrow: jest.fn(), findMany: jest.fn(), count: jest.fn() };
  const tx = { attendanceRecord: { deleteMany: jest.fn(), createMany: jest.fn() }, attendance, auditLog: { create: jest.fn() } };
  const database = {
    class: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    attendance,
    auditLog: { findMany: jest.fn() },
    attendanceRecord: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    student: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn().mockResolvedValue([{ studentId: 'stu-a' }]) },
    $transaction: jest.fn((fn: (txObj: typeof tx) => Promise<void>) => fn(tx)),
  };
  const service = new AttendanceService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('validates DTO parsing', () => {
    expect(() => parseCreateAttendanceDto({})).toThrow();
    expect(() => parseCreateAttendanceDto({ classId: 'c', heldOn: 'bad-date', records: [] })).toThrow();
    expect(() => parseCreateAttendanceDto({ classId: 'c', heldOn: '2026-01-01', records: [] })).toThrow();
    expect(() => parseCreateAttendanceDto({ classId: 'c', heldOn: '2026-01-01', records: [{ studentId: 's', status: 'INVALID' }] })).toThrow();
    expect(() => parseUpdateAttendanceDto({ records: [] })).toThrow();
    expect(() => parseAttendanceListQuery({ page: 0 })).toThrow();
    expect(parseClassListQuery({ page: '2', pageSize: '10' })).toMatchObject({ page: 2, pageSize: 10 });
    const valid = parseCreateAttendanceDto({ classId: 'c', heldOn: '2026-09-01', records: [{ studentId: 's', status: 'PRESENT' }] });
    expect(valid.records[0]!.status).toBe(AttendanceStatus.PRESENT);
  });

  it('blocks STUDENT from all write/list operations', async () => {
    await expect(service.listClasses({ page: 1, pageSize: 20 }, student)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createAttendance({ classId: 'c', heldOn: '2026-01-01', records: [] }, student)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listAttendance({ page: 1, pageSize: 20 }, student)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getAttendance('att-a', student)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateAttendance('att-a', { records: [] }, student)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows ADMIN to list classes scoped by college', async () => {
    database.class.findMany.mockResolvedValue([mockClass]);
    database.class.count.mockResolvedValue(1);
    const result = await service.listClasses({ page: 1, pageSize: 20 }, admin);
    expect(result.items).toHaveLength(1);
    expect(database.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ collegeId: 'col-a' }) }));
  });

  it('scopes FACULTY list to their own userId via nested faculty relation', async () => {
    database.class.findMany.mockResolvedValue([mockClass]);
    database.class.count.mockResolvedValue(1);
    await service.listClasses({ page: 1, pageSize: 20 }, faculty);
    expect(database.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ faculty: { userId: 'faculty-user' } }) }));
  });

  it('rejects HOD cross-department class query', async () => {
    await expect(service.listClasses({ departmentId: 'dept-b', page: 1, pageSize: 20 }, hod)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates attendance and surfaces conflict on duplicate date', async () => {
    database.class.findFirst.mockResolvedValue(mockClass);
    database.attendance.create.mockResolvedValue({ id: 'att-a' });
    attendance.findFirstOrThrow.mockResolvedValue(mockAttendance);
    const result = await service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, hod);
    expect(result).toEqual({ ...mockAttendance, correctionWindowEndsAt: expect.any(String) });
    database.attendance.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, hod)).rejects.toBeInstanceOf(ConflictException);
    // Admin decision 2: Admin monitors attendance but does not mark it.
    await expect(service.createAttendance({ classId: 'class-a', heldOn: '2026-09-02', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 for missing attendance session', async () => {
    database.attendance.findFirst.mockResolvedValue(null);
    await expect(service.getAttendance('att-x', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates attendance by replacing all records in a transaction', async () => {
    database.attendance.findFirst.mockResolvedValue(mockAttendance);
    database.attendance.findFirst.mockResolvedValue(mockAttendance);
    await service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.ABSENT }] }, hod);
    expect(tx.attendanceRecord.deleteMany).toHaveBeenCalledWith({ where: { collegeId: 'col-a', attendanceId: 'att-a' } });
    expect(tx.attendanceRecord.createMany).toHaveBeenCalled();
  });

  it('only records attendance for students enrolled in the class section, once each', async () => {
    database.class.findFirst.mockResolvedValue(mockClass);
    database.enrollment.findMany.mockResolvedValueOnce([]);
    await expect(service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'outsider', status: AttendanceStatus.PRESENT }] }, faculty)).rejects.toMatchObject({ response: { code: 'STUDENT_NOT_IN_CLASS' } });
    expect(database.enrollment.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', sectionId: 'sec-a', status: 'ACTIVE', studentId: { in: ['outsider'] } } }));
    await expect(service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }, { studentId: 'stu-a', status: AttendanceStatus.ABSENT }] }, faculty)).rejects.toMatchObject({ response: { code: 'DUPLICATE_STUDENT' } });
    expect(database.attendance.create).not.toHaveBeenCalled();
  });

  it('checks enrollment on updates too', async () => {
    database.attendance.findFirst.mockResolvedValue(mockAttendance);
    database.enrollment.findMany.mockResolvedValueOnce([]);
    await expect(service.updateAttendance('att-a', { records: [{ studentId: 'outsider', status: AttendanceStatus.PRESENT }] }, hod)).rejects.toMatchObject({ response: { code: 'STUDENT_NOT_IN_CLASS' } });
    expect(tx.attendanceRecord.deleteMany).not.toHaveBeenCalled();
  });

  describe('getMyAttendance', () => {
    const os = { id: 'subj-os', code: 'CS301', name: 'Operating Systems' };
    const dbms = { id: 'subj-db', code: 'CS302', name: 'DBMS' };
    const record = (id: string, status: AttendanceStatus, heldOn: string, subject = os) => ({
      id, status, note: null, attendance: { heldOn: new Date(heldOn), class: { subject, faculty: { firstName: 'Priya', lastName: 'Sharma' } } },
    });
    const query = { page: 1, pageSize: 20 };

    it('allows only students', async () => {
      await expect(service.getMyAttendance(query, faculty)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getMyAttendance(query, admin)).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.attendanceRecord.findMany).not.toHaveBeenCalled();
    });

    it('returns 404 when the user has no student profile', async () => {
      database.student.findFirst.mockResolvedValue(null);
      await expect(service.getMyAttendance(query, student)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reads only the signed-in student records in their college', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-a' });
      database.attendanceRecord.findMany.mockResolvedValue([]);
      await service.getMyAttendance(query, student);
      expect(database.student.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', userId: 'stu' } }));
      expect(database.attendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', studentId: 'stu-a' } }));
    });

    it('reports no percentage instead of a made-up one when nothing is recorded', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-a' });
      database.attendanceRecord.findMany.mockResolvedValue([]);
      const result = await service.getMyAttendance(query, student);
      expect(result.overall).toMatchObject({ counted: 0, percentage: null, belowThreshold: false });
      expect(result.subjects).toEqual([]);
    });

    it('counts late as attended, leaves excused out, and flags subjects under 75%', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-a' });
      database.attendanceRecord.findMany.mockResolvedValue([
        record('r1', AttendanceStatus.PRESENT, '2026-09-04'),
        record('r2', AttendanceStatus.LATE, '2026-09-03'),
        record('r3', AttendanceStatus.ABSENT, '2026-09-02'),
        record('r4', AttendanceStatus.EXCUSED, '2026-09-01'),
        record('r5', AttendanceStatus.PRESENT, '2026-09-04', dbms),
        record('r6', AttendanceStatus.ABSENT, '2026-09-03', dbms),
      ]);
      const result = await service.getMyAttendance(query, student);
      expect(result.threshold).toBe(75);
      expect(result.overall).toMatchObject({ present: 2, late: 1, absent: 2, excused: 1, attended: 3, counted: 5, percentage: 60, belowThreshold: true });
      expect(result.subjects.map((s) => [s.subject.code, s.percentage, s.belowThreshold])).toEqual([['CS302', 50, true], ['CS301', 66.7, true]]);
    });

    it('filters history and calendar days by subject and date range but keeps the full summary', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-a' });
      database.attendanceRecord.findMany.mockResolvedValue([
        record('r1', AttendanceStatus.PRESENT, '2026-10-02'),
        record('r2', AttendanceStatus.ABSENT, '2026-09-30'),
        record('r3', AttendanceStatus.PRESENT, '2026-10-01', dbms),
      ]);
      const result = await service.getMyAttendance({ ...query, subjectId: 'subj-os', from: '2026-10-01', to: '2026-10-31' }, student);
      expect(result.records.items.map((item) => item.id)).toEqual(['r1']);
      expect(result.records.total).toBe(1);
      expect(result.days).toEqual([expect.objectContaining({ date: '2026-10-02', present: 1 })]);
      expect(result.overall.counted).toBe(3);
    });

    it('paginates history', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-a' });
      database.attendanceRecord.findMany.mockResolvedValue([1, 2, 3].map((n) => record(`r${n}`, AttendanceStatus.PRESENT, `2026-09-0${n}`)));
      const result = await service.getMyAttendance({ page: 2, pageSize: 2 }, student);
      expect(result.records).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(result.records.items.map((item) => item.id)).toEqual(['r3']);
    });

    it('rejects bad query values', () => {
      expect(() => parseMyAttendanceQuery({ from: '2026-13-45' })).toThrow();
      expect(() => parseMyAttendanceQuery({ from: '01/10/2026' })).toThrow();
      expect(() => parseMyAttendanceQuery({ from: '2026-02-31' })).toThrow();
      expect(() => parseMyAttendanceQuery({ to: '2026-04-31' })).toThrow();
      expect(parseMyAttendanceQuery({ from: '2028-02-29' }).from).toBe('2028-02-29');
      expect(() => parseMyAttendanceQuery({ from: '2026-10-31', to: '2026-10-01' })).toThrow();
      expect(parseMyAttendanceQuery({ subjectId: 'subj-os', from: '2026-10-01', to: '2026-10-31' })).toEqual({ subjectId: 'subj-os', from: '2026-10-01', to: '2026-10-31', page: 1, pageSize: 20 });
    });
  });

  describe('corrections', () => {
    const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);
    const marked = (createdAt: Date) => ({
      ...mockAttendance,
      createdAt,
      records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT, note: null, student: { id: 'stu-a', firstName: 'Aarav', lastName: 'Mehta', studentCode: 'S1' } }],
    });

    it('records who marked a new session', async () => {
      database.class.findFirst.mockResolvedValue(mockClass);
      attendance.create.mockResolvedValue({ id: 'att-a' });
      attendance.findFirstOrThrow.mockResolvedValue({ ...mockAttendance, records: [{}] });
      const result = await service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, faculty);
      expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ collegeId: 'col-a', actorId: 'faculty-user', action: 'ATTENDANCE_MARKED', entityType: 'Attendance', entityId: 'att-a' }) });
      expect(attendance.create).toHaveBeenCalledWith({ data: { collegeId: 'col-a', classId: 'class-a', heldOn: new Date('2026-09-01') } });
      expect(tx.attendanceRecord.createMany).toHaveBeenCalledWith({ data: [{ collegeId: 'col-a', attendanceId: 'att-a', studentId: 'stu-a', status: AttendanceStatus.PRESENT, note: undefined }] });
      expect(result.correctionWindowEndsAt).toBe(new Date(mockAttendance.createdAt.getTime() + 48 * 3_600_000).toISOString());
    });

    it('lets faculty correct within 48 hours and records only what changed', async () => {
      attendance.findFirst.mockResolvedValue(marked(hoursAgo(47)));
      await service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.ABSENT, note: 'Left early' }] }, faculty);
      expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        action: 'ATTENDANCE_CORRECTED',
        actorId: 'faculty-user',
        metadata: { changes: [{ studentId: 'stu-a', from: { status: 'PRESENT', note: null }, to: { status: 'ABSENT', note: 'Left early' } }] },
      }) });
    });

    it('logs students left out of a correction as removed', async () => {
      attendance.findFirst.mockResolvedValue({ ...marked(hoursAgo(1)), records: [...marked(hoursAgo(1)).records, { studentId: 'stu-b', status: AttendanceStatus.ABSENT, note: null, student: { id: 'stu-b', firstName: 'Nisha', lastName: 'Rao', studentCode: 'S2' } }] });
      await service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, faculty);
      expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        action: 'ATTENDANCE_CORRECTED',
        metadata: { changes: [{ studentId: 'stu-b', from: { status: 'ABSENT', note: null }, to: null }] },
      }) });
    });

    it('does not log a correction when nothing changed', async () => {
      attendance.findFirst.mockResolvedValue(marked(hoursAgo(1)));
      await service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, faculty);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('blocks faculty after the window but not the HOD; Admin never corrects', async () => {
      attendance.findFirst.mockResolvedValue(marked(hoursAgo(49)));
      await expect(service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.ABSENT }] }, faculty)).rejects.toMatchObject({ response: { code: 'CORRECTION_WINDOW_CLOSED' } });
      expect(tx.attendanceRecord.deleteMany).not.toHaveBeenCalled();
      await expect(service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.ABSENT }] }, hod)).resolves.toBeDefined();
      await expect(service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.ABSENT }] }, admin)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the history of a session the caller can open, with student names', async () => {
      attendance.findFirst.mockResolvedValue(marked(hoursAgo(2)));
      database.auditLog.findMany.mockResolvedValue([
        { id: 'log-1', action: 'ATTENDANCE_MARKED', createdAt: hoursAgo(2), actor: { id: 'faculty-user', displayName: 'Dr. Priya Sharma' }, metadata: { records: 1 } },
        { id: 'log-2', action: 'ATTENDANCE_CORRECTED', createdAt: hoursAgo(1), actor: { id: 'faculty-user', displayName: 'Dr. Priya Sharma' }, metadata: { changes: [{ studentId: 'stu-a', from: { status: 'PRESENT', note: null }, to: { status: 'LATE', note: null } }] } },
      ]);
      const history = await service.getAttendanceHistory('att-a', faculty);
      expect(database.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', entityType: 'Attendance', entityId: 'att-a' } }));
      expect(history[1]!.changes[0]).toMatchObject({ student: { firstName: 'Aarav' }, to: { status: 'LATE' } });
      attendance.findFirst.mockResolvedValue(null);
      await expect(service.getAttendanceHistory('att-x', faculty)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('AttendanceService My Classes', () => {
  const facultyUser: AuthorizationContext = { userId: 'faculty-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
  const pupil: AuthorizationContext = { userId: 'stu', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };
  const taught = { id: 'class-a', collegeId: 'col-a', sectionId: 'sec-a', subjectId: 'subj-a', facultyId: 'fac-1', section: { semester: { course: { departmentId: 'dept-a' } } }, subject: { name: 'OS' }, faculty: {} };
  const database = {
    class: { findMany: jest.fn(), findFirst: jest.fn() },
    enrollment: { groupBy: jest.fn(), findMany: jest.fn() },
    attendanceRecord: { groupBy: jest.fn() },
    attendance: { count: jest.fn() },
    assignment: { findMany: jest.fn() },
    submission: { groupBy: jest.fn(), count: jest.fn().mockResolvedValue(3) },
  };
  const service = new AttendanceService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('lists only the classes the caller teaches, with counts and attendance', async () => {
    database.class.findMany.mockResolvedValue([{ ...taught, _count: { attendances: 4, assignments: 2 } }]);
    database.enrollment.groupBy.mockResolvedValue([{ sectionId: 'sec-a', _count: { _all: 30 } }]);
    database.attendanceRecord.groupBy.mockResolvedValue([{ status: AttendanceStatus.PRESENT, _count: { _all: 3 } }, { status: AttendanceStatus.ABSENT, _count: { _all: 1 } }]);
    const [first] = await service.listMyClasses(facultyUser);
    expect(database.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', section: { semester: { course: { departmentId: 'dept-a' } } }, faculty: { userId: 'faculty-user' } } }));
    expect(first).toMatchObject({ id: 'class-a', studentCount: 30, sessionsHeld: 4, assignmentCount: 2, pendingEvaluations: 3, attendance: { attended: 3, counted: 4, percentage: 75 } });
    expect(database.submission.count).toHaveBeenCalledWith({ where: { collegeId: 'col-a', assignment: { classId: 'class-a' }, status: { in: ['SUBMITTED', 'LATE'] } } });
    expect(first).not.toHaveProperty('_count');
  });

  it('builds a class roster with per-student attendance and submissions', async () => {
    database.class.findFirst.mockResolvedValue(taught);
    database.enrollment.findMany.mockResolvedValue([
      { student: { id: 's1', studentCode: 'S1', firstName: 'Aarav', lastName: 'Mehta' } },
      { student: { id: 's2', studentCode: 'S2', firstName: 'Nisha', lastName: 'Rao' } },
    ]);
    database.attendanceRecord.groupBy.mockResolvedValue([
      { studentId: 's1', status: AttendanceStatus.PRESENT, _count: { _all: 3 } },
      { studentId: 's1', status: AttendanceStatus.ABSENT, _count: { _all: 2 } },
      { studentId: 's2', status: AttendanceStatus.PRESENT, _count: { _all: 5 } },
    ]);
    database.attendance.count.mockResolvedValue(5);
    database.assignment.findMany.mockResolvedValue([{ id: 'as-1', title: 'Scheduler', dueAt: null, maxMarks: 20, _count: { submissions: 1 } }]);
    database.submission.groupBy.mockResolvedValue([{ studentId: 's2', _count: { _all: 1 } }]);
    const overview = await service.getClassOverview('class-a', facultyUser);
    expect(database.class.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'class-a', faculty: { userId: 'faculty-user' } }) }));
    expect(database.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', sectionId: 'sec-a', status: 'ACTIVE' } }));
    expect(overview.students).toEqual([
      { student: expect.objectContaining({ id: 's1' }), attendance: expect.objectContaining({ percentage: 60, belowThreshold: true }), submittedAssignments: 0 },
      { student: expect.objectContaining({ id: 's2' }), attendance: expect.objectContaining({ percentage: 100, belowThreshold: false }), submittedAssignments: 1 },
    ]);
    expect(overview).toMatchObject({ sessionsHeld: 5, attendance: { attended: 8, counted: 10 }, assignments: [{ id: 'as-1', submissions: 1 }] });
  });

  it('keeps an HOD who also teaches inside their department', async () => {
    const hodTeacher: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD', 'FACULTY'], permissions: [], departmentId: 'dept-a' };
    database.class.findMany.mockResolvedValue([]);
    database.enrollment.groupBy.mockResolvedValue([]);
    await service.listMyClasses(hodTeacher);
    expect(database.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', section: { semester: { course: { departmentId: 'dept-a' } } }, faculty: { userId: 'hod-user' } } }));
  });

  it('counts assignment submissions only from the active roster', async () => {
    database.class.findFirst.mockResolvedValue(taught);
    database.enrollment.findMany.mockResolvedValue([]);
    database.attendanceRecord.groupBy.mockResolvedValue([]);
    database.attendance.count.mockResolvedValue(0);
    database.assignment.findMany.mockResolvedValue([]);
    database.submission.groupBy.mockResolvedValue([]);
    await service.getClassOverview('class-a', facultyUser);
    expect(database.assignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ _count: { select: { submissions: { where: { status: { not: 'DRAFT' }, student: { enrollments: { some: { sectionId: 'sec-a', status: 'ACTIVE' } } } } } } } }),
    }));
  });

  it('returns 404 for a class outside the caller scope and blocks students', async () => {
    database.class.findFirst.mockResolvedValue(null);
    await expect(service.getClassOverview('class-x', facultyUser)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.enrollment.findMany).not.toHaveBeenCalled();
    await expect(service.listMyClasses(pupil)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getClassOverview('class-a', pupil)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
