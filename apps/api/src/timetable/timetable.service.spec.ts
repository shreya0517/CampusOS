import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TimetableService } from './timetable.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseCreateTimetableDto, parseTimetableListQuery } from './timetable.dto';

import type { DatabaseService } from '../database.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const facultyContext: AuthorizationContext = { userId: 'fac-user', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-a' };
const studentContext: AuthorizationContext = { userId: 'stu-user', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

describe('TimetableService', () => {
  const database = {
    class: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    room: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    timetable: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    faculty: {
      findFirst: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
  };

  let service: TimetableService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TimetableService(database as unknown as DatabaseService);
  });

  describe('createEntry', () => {
    it('throws ForbiddenException if user is a student', async () => {
      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '09:00',
        endsAt: '10:00',
      });
      await expect(service.createEntry(dto, studentContext)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if class is not found', async () => {
      database.class.findFirst.mockResolvedValue(null);

      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '09:00',
        endsAt: '10:00',
      });
      await expect(service.createEntry(dto, admin)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if room is not found', async () => {
      database.class.findFirst.mockResolvedValue({ id: 'cls-1', collegeId: 'col-a', subject: { name: 'Math' } });
      database.room.findFirst.mockResolvedValue(null);

      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '09:00',
        endsAt: '10:00',
      });
      await expect(service.createEntry(dto, admin)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if startsAt >= endsAt', async () => {
      database.class.findFirst.mockResolvedValue({ id: 'cls-1', collegeId: 'col-a', subject: { name: 'Math' } });
      database.room.findFirst.mockResolvedValue({ id: 'room-1', collegeId: 'col-a', code: 'R101', name: 'Room 101' });

      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '10:00',
        endsAt: '09:00',
      });
      await expect(service.createEntry(dto, admin)).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException on room conflict', async () => {
      database.class.findFirst.mockResolvedValue({ id: 'cls-1', collegeId: 'col-a', subject: { name: 'Math' } });
      database.room.findFirst.mockResolvedValue({ id: 'room-1', collegeId: 'col-a', code: 'R101', name: 'Room 101' });

      database.timetable.findMany.mockResolvedValue([
        {
          id: 'tt-existing',
          collegeId: 'col-a',
          classId: 'cls-2',
          roomId: 'room-1',
          dayOfWeek: 1,
          startsAt: new Date('1970-01-01T09:00:00.000Z'),
          endsAt: new Date('1970-01-01T10:30:00.000Z'),
          class: { facultyId: 'fac-2', subject: { name: 'Physics' } },
          room: { id: 'room-1', name: 'Room 101', code: 'R101' },
        },
      ]);

      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '10:00',
        endsAt: '11:00',
      });
      await expect(service.createEntry(dto, admin)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on faculty conflict', async () => {
      database.class.findFirst.mockResolvedValue({
        id: 'cls-1',
        collegeId: 'col-a',
        facultyId: 'fac-1',
        subject: { name: 'Math' },
        faculty: { firstName: 'John', lastName: 'Doe' },
      });
      database.room.findFirst.mockResolvedValue({ id: 'room-1', collegeId: 'col-a', code: 'R101', name: 'Room 101' });

      database.timetable.findMany.mockResolvedValue([
        {
          id: 'tt-existing',
          collegeId: 'col-a',
          classId: 'cls-2',
          roomId: 'room-2',
          dayOfWeek: 1,
          startsAt: new Date('1970-01-01T09:00:00.000Z'),
          endsAt: new Date('1970-01-01T10:30:00.000Z'),
          class: { facultyId: 'fac-1', subject: { name: 'Physics' } },
          room: { id: 'room-2', name: 'Room 102', code: 'R102' },
        },
      ]);

      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '10:00',
        endsAt: '11:00',
      });
      await expect(service.createEntry(dto, admin)).rejects.toThrow(ConflictException);
    });

    it('successfully creates timetable entry when no conflict', async () => {
      database.class.findFirst.mockResolvedValue({
        id: 'cls-1',
        collegeId: 'col-a',
        facultyId: 'fac-1',
        subject: { name: 'Math' },
      });
      database.room.findFirst.mockResolvedValue({ id: 'room-1', collegeId: 'col-a', code: 'R101', name: 'Room 101' });
      database.timetable.findMany.mockResolvedValue([]);
      database.timetable.create.mockResolvedValue({
        id: 'tt-new',
        collegeId: 'col-a',
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: new Date('1970-01-01T09:00:00.000Z'),
        endsAt: new Date('1970-01-01T10:00:00.000Z'),
      });

      const dto = parseCreateTimetableDto({
        classId: 'cls-1',
        roomId: 'room-1',
        dayOfWeek: 1,
        startsAt: '09:00',
        endsAt: '10:00',
      });
      const result = await service.createEntry(dto, admin);
      expect(result).toHaveProperty('id', 'tt-new');
      expect(database.timetable.create).toHaveBeenCalled();
    });
  });

  describe('listEntries', () => {
    it('lists timetable entries filtered by collegeId and pagination', async () => {
      database.timetable.count.mockResolvedValue(1);
      database.timetable.findMany.mockResolvedValue([{ id: 'tt-1', dayOfWeek: 1 }]);

      const query = parseTimetableListQuery({ page: 1, pageSize: 20, dayOfWeek: 1 });
      const result = await service.listEntries(query, admin);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getMyTimetable', () => {
    it('returns active enrolled section timetables for student', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-1' });
      database.enrollment.findMany.mockResolvedValue([{ sectionId: 'sec-1' }]);
      database.timetable.findMany.mockResolvedValue([{ id: 'tt-stu-1' }]);

      const result = await service.getMyTimetable(studentContext);
      expect(result).toEqual([{ id: 'tt-stu-1' }]);
    });

    it('returns taught class timetables for faculty', async () => {
      database.faculty.findFirst.mockResolvedValue({ id: 'fac-1' });
      database.timetable.findMany.mockResolvedValue([{ id: 'tt-fac-1' }]);

      const result = await service.getMyTimetable(facultyContext);
      expect(result).toEqual([{ id: 'tt-fac-1' }]);
    });
  });
});

describe('TimetableService student scoping', () => {
  const database = {
    class: { findMany: jest.fn().mockResolvedValue([]) },
    timetable: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    student: { findFirst: jest.fn() },
    enrollment: { findMany: jest.fn() },
  };
  const service = new TimetableService(database as unknown as DatabaseService);
  const listWhere = (): Record<string, unknown> => (database.timetable.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> }).where;

  beforeEach(() => {
    jest.clearAllMocks();
    database.student.findFirst.mockResolvedValue({ id: 'stu-1' });
    database.enrollment.findMany.mockResolvedValue([{ sectionId: 'sec-a' }]);
  });

  it('limits the timetable list to the sections a student is enrolled in', async () => {
    await service.listEntries(parseTimetableListQuery({}), studentContext);
    expect(listWhere()).toEqual({ collegeId: 'col-a', class: { sectionId: { in: ['sec-a'] } } });
    expect(database.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', studentId: 'stu-1', status: 'ACTIVE' } }));
  });

  it('returns nothing when a student asks for another section', async () => {
    await service.listEntries(parseTimetableListQuery({ sectionId: 'sec-b' }), studentContext);
    expect(listWhere()).toEqual({ collegeId: 'col-a', class: { sectionId: { in: [] } } });
  });

  it('returns nothing for a student user without a student profile', async () => {
    database.student.findFirst.mockResolvedValue(null);
    await service.listEntries(parseTimetableListQuery({}), studentContext);
    expect(listWhere()).toEqual({ collegeId: 'col-a', class: { sectionId: { in: [] } } });
  });

  it('limits the class list to the student sections', async () => {
    await service.getClasses(studentContext);
    expect(database.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', sectionId: { in: ['sec-a'] } } }));
  });

  it('leaves staff lists unscoped by section', async () => {
    await service.listEntries(parseTimetableListQuery({}), admin);
    expect(listWhere()).toEqual({ collegeId: 'col-a' });
    await service.getClasses(facultyContext);
    expect(database.class.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { collegeId: 'col-a' } }));
    expect(database.student.findFirst).not.toHaveBeenCalled();
  });
});

describe('TimetableService staff scope', () => {
  const database = { timetable: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
  const service = new TimetableService(database as unknown as DatabaseService);
  const listWhere = (): Record<string, unknown> => (database.timetable.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> }).where;
  beforeEach(() => jest.clearAllMocks());

  it('shows an HOD only their department\'s timetable', async () => {
    await service.listEntries(parseTimetableListQuery({}), { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' });
    expect(listWhere()).toEqual({ collegeId: 'col-a', class: { section: { semester: { course: { departmentId: 'dept-a' } } } } });
  });

  it('shows faculty only the classes they teach', async () => {
    await service.listEntries(parseTimetableListQuery({ sectionId: 'sec-1' }), facultyContext);
    expect(listWhere()).toEqual({ collegeId: 'col-a', class: { sectionId: 'sec-1', faculty: { userId: 'fac-user' } } });
  });
});

describe('TimetableService HOD and write rules', () => {
  const hod: AuthorizationContext = { userId: 'hod-user', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
  const database = {
    class: { findFirst: jest.fn() },
    timetable: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), delete: jest.fn() },
    faculty: { findFirst: jest.fn().mockResolvedValue({ id: 'fac-hod' }) },
  };
  const service = new TimetableService(database as unknown as DatabaseService);
  beforeEach(() => jest.clearAllMocks());

  it('gives an HOD the classes they teach as My Timetable, not the whole college', async () => {
    await service.getMyTimetable(hod);
    expect(database.timetable.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', class: { facultyId: 'fac-hod' } } }));
  });

  it('lets only admins create or delete timetable entries', async () => {
    const dto = parseCreateTimetableDto({ classId: 'cls-1', roomId: 'room-1', dayOfWeek: 1, startsAt: '09:00', endsAt: '10:00' });
    await expect(service.createEntry(dto, hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createEntry(dto, facultyContext)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deleteEntry('tt-1', hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.class.findFirst).not.toHaveBeenCalled();
    expect(database.timetable.delete).not.toHaveBeenCalled();
  });
});
