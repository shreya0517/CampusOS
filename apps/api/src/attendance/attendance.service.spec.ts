import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseAttendanceListQuery, parseClassListQuery, parseCreateAttendanceDto, parseUpdateAttendanceDto } from './attendance.dto';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
const faculty: AuthorizationContext = { userId: 'faculty-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
const student: AuthorizationContext = { userId: 'stu', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

const mockClass = { id: 'class-a', collegeId: 'col-a', sectionId: 'sec-a', subjectId: 'subj-a', facultyId: 'faculty-user', section: { semester: { course: { departmentId: 'dept-a' } } }, subject: {}, faculty: {} };
const mockAttendance = { id: 'att-a', collegeId: 'col-a', classId: 'class-a', heldOn: new Date('2026-09-01'), class: mockClass, records: [] };

describe('AttendanceService', () => {
  const tx = { attendanceRecord: { deleteMany: jest.fn(), createMany: jest.fn() } };
  const database = {
    class: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    attendance: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    attendanceRecord: { deleteMany: jest.fn(), createMany: jest.fn() },
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
    database.attendance.create.mockResolvedValue(mockAttendance);
    const result = await service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, admin);
    expect(result).toEqual(mockAttendance);
    database.attendance.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.createAttendance({ classId: 'class-a', heldOn: '2026-09-01', records: [{ studentId: 'stu-a', status: AttendanceStatus.PRESENT }] }, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for missing attendance session', async () => {
    database.attendance.findFirst.mockResolvedValue(null);
    await expect(service.getAttendance('att-x', admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates attendance by replacing all records in a transaction', async () => {
    database.attendance.findFirst.mockResolvedValue(mockAttendance);
    database.attendance.findFirst.mockResolvedValue(mockAttendance);
    await service.updateAttendance('att-a', { records: [{ studentId: 'stu-a', status: AttendanceStatus.ABSENT }] }, admin);
    expect(tx.attendanceRecord.deleteMany).toHaveBeenCalledWith({ where: { collegeId: 'col-a', attendanceId: 'att-a' } });
    expect(tx.attendanceRecord.createMany).toHaveBeenCalled();
  });
});
