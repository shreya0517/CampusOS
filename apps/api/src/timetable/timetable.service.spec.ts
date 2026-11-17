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
