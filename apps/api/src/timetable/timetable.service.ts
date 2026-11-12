import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { CreateTimetableDto, TimetableListQuery } from './timetable.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};

function parseTimeToDate(timeStr: string): Date {
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) {
      throw new BadRequestException({ code: 'INVALID_TIME', message: `Invalid time string format: ${timeStr}` });
    }
    return d;
  }
  const parts = timeStr.split(':');
  const part0 = parts[0];
  const part1 = parts[1];
  if (!part0 || !part1) {
    throw new BadRequestException({ code: 'INVALID_TIME', message: `Invalid time format: ${timeStr}. Expected HH:mm.` });
  }
  const hh = part0.padStart(2, '0');
  const mm = part1.padStart(2, '0');
  const ss = (parts[2] || '00').padStart(2, '0');
  const iso = `1970-01-01T${hh}:${mm}:${ss}.000Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new BadRequestException({ code: 'INVALID_TIME', message: `Invalid time values: ${timeStr}` });
  }
  return d;
}

function timeToMinutes(dateOrStr: Date | string): number {
  if (dateOrStr instanceof Date) {
    return dateOrStr.getUTCHours() * 60 + dateOrStr.getUTCMinutes();
  }
  const d = parseTimeToDate(String(dateOrStr));
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

@Injectable()
export class TimetableService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createEntry(input: CreateTimetableDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const targetClass = await this.database.class.findFirst({
      where: { id: input.classId, collegeId: context.collegeId },
      include: {
        subject: true,
        faculty: true,
      },
    });

    if (!targetClass) {
      throw new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class was not found in this college.' });
    }

    const room = await this.database.room.findFirst({
      where: { id: input.roomId, collegeId: context.collegeId },
    });

    if (!room) {
      throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room was not found in this college.' });
    }

    const startMinutes = timeToMinutes(input.startsAt);
    const endMinutes = timeToMinutes(input.endsAt);

    if (startMinutes >= endMinutes) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: 'Start time must be strictly before end time.',
      });
    }

    const startDate = parseTimeToDate(input.startsAt);
    const endDate = parseTimeToDate(input.endsAt);

    // Fetch all existing entries for the same college and day to check conflicts in memory or via query
    const dayEntries = await this.database.timetable.findMany({
      where: {
        collegeId: context.collegeId,
        dayOfWeek: input.dayOfWeek,
      },
      include: {
        class: {
          include: {
            faculty: true,
            subject: true,
          },
        },
        room: true,
      },
    });

    for (const entry of dayEntries) {
      const entryStart = timeToMinutes(entry.startsAt);
      const entryEnd = timeToMinutes(entry.endsAt);

      const overlaps = startMinutes < entryEnd && endMinutes > entryStart;
      if (!overlaps) continue;

      if (entry.roomId === input.roomId) {
        throw new ConflictException({
          code: 'TIMETABLE_ROOM_CONFLICT',
          message: `Room "${room.name} (${room.code})" is already occupied during this time on this day.`,
        });
      }

      if (entry.classId === input.classId) {
        throw new ConflictException({
          code: 'TIMETABLE_CLASS_CONFLICT',
          message: `Class "${targetClass.subject.name}" is already scheduled for another session during this time on this day.`,
        });
      }

      if (
        targetClass.facultyId &&
        entry.class.facultyId &&
        targetClass.facultyId === entry.class.facultyId
      ) {
        const facultyName = targetClass.faculty
          ? `${targetClass.faculty.firstName} ${targetClass.faculty.lastName}`
          : 'The assigned faculty';
        throw new ConflictException({
          code: 'TIMETABLE_FACULTY_CONFLICT',
          message: `${facultyName} is already teaching another class during this time on this day.`,
        });
      }
    }

    return this.database.timetable.create({
      data: {
        collegeId: context.collegeId,
        classId: input.classId,
        roomId: input.roomId,
        dayOfWeek: input.dayOfWeek,
        startsAt: startDate,
        endsAt: endDate,
      },
      include: {
        class: {
          include: {
            subject: true,
            section: true,
            faculty: true,
          },
        },
        room: true,
      },
    });
  }

  async listEntries(query: TimetableListQuery, context: AuthorizationContext) {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (query.classId) {
      where.classId = query.classId;
    }
    if (query.roomId) {
      where.roomId = query.roomId;
    }
    if (query.dayOfWeek !== undefined) {
      where.dayOfWeek = query.dayOfWeek;
    }
    if (query.sectionId || query.facultyId) {
      const classWhere: Record<string, unknown> = {};
      if (query.sectionId) classWhere.sectionId = query.sectionId;
      if (query.facultyId) classWhere.facultyId = query.facultyId;
      where.class = classWhere;
    }

    const total = await this.database.timetable.count({ where });
    const items = await this.database.timetable.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [
        { dayOfWeek: 'asc' },
        { startsAt: 'asc' },
      ],
      include: {
        class: {
          include: {
            subject: true,
            section: {
              include: {
                semester: {
                  include: {
                    course: true,
                  },
                },
              },
            },
            faculty: true,
          },
        },
        room: true,
      },
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 1,
    };
  }

  async getMyTimetable(context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) {
      const student = await this.database.student.findFirst({
        where: { collegeId: context.collegeId, userId: context.userId },
      });

      if (!student) {
        return [];
      }

      const activeEnrollments = await this.database.enrollment.findMany({
        where: {
          collegeId: context.collegeId,
          studentId: student.id,
          status: 'ACTIVE',
        },
        select: { sectionId: true },
      });

      const sectionIds = activeEnrollments.map((e) => e.sectionId);
      if (sectionIds.length === 0) return [];

      return this.database.timetable.findMany({
        where: {
          collegeId: context.collegeId,
          class: {
            sectionId: { in: sectionIds },
          },
        },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startsAt: 'asc' },
        ],
        include: {
          class: {
            include: {
              subject: true,
              section: true,
              faculty: true,
            },
          },
          room: true,
        },
      });
    }

    if (context.roles.includes('FACULTY')) {
      const faculty = await this.database.faculty.findFirst({
        where: { collegeId: context.collegeId, userId: context.userId },
      });

      if (!faculty) {
        return [];
      }

      return this.database.timetable.findMany({
        where: {
          collegeId: context.collegeId,
          class: {
            facultyId: faculty.id,
          },
        },
        orderBy: [
          { dayOfWeek: 'asc' },
          { startsAt: 'asc' },
        ],
        include: {
          class: {
            include: {
              subject: true,
              section: true,
              faculty: true,
            },
          },
          room: true,
        },
      });
    }

    // Default for Admin / HOD
    return this.database.timetable.findMany({
      where: { collegeId: context.collegeId },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startsAt: 'asc' },
      ],
      take: 100,
      include: {
        class: {
          include: {
            subject: true,
            section: true,
            faculty: true,
          },
        },
        room: true,
      },
    });
  }

  async deleteEntry(id: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const existing = await this.database.timetable.findFirst({
      where: { id, collegeId: context.collegeId },
    });

    if (!existing) {
      throw new NotFoundException({ code: 'TIMETABLE_NOT_FOUND', message: 'Timetable entry was not found.' });
    }

    await this.database.timetable.delete({
      where: { id },
    });

    return { success: true, id };
  }

  async getRooms(context: AuthorizationContext) {
    return this.database.room.findMany({
      where: { collegeId: context.collegeId },
      orderBy: { code: 'asc' },
    });
  }

  async getClasses(context: AuthorizationContext) {
    return this.database.class.findMany({
      where: { collegeId: context.collegeId },
      include: {
        subject: true,
        section: true,
        faculty: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
