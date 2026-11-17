import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AttendanceStatus } from '@prisma/client';
import type { AttendanceListQuery, ClassListQuery, CreateAttendanceDto, MyAttendanceQuery, UpdateAttendanceDto } from './attendance.dto';

/** Minimum attendance a student needs per subject; the dashboard already shows this as the college policy. */
export const ATTENDANCE_THRESHOLD_PERCENT = 75;

/** Faculty may correct a session for this long after first marking it; later corrections go through the HOD. */
export const ATTENDANCE_CORRECTION_WINDOW_HOURS = 48;

const denied = (): never => { throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' }); };
const missing = (): never => { throw new NotFoundException({ code: 'ATTENDANCE_NOT_FOUND', message: 'Attendance session was not found.' }); };
const classMissing = (): never => { throw new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class was not found.' }); };

@Injectable()
export class AttendanceService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Resolve the department scope for HOD/FACULTY or return undefined for ADMIN. */
  private scopedDepartment(context: AuthorizationContext, requested?: string): string | undefined {
    if (context.roles.includes('ADMIN')) return requested;
    if (!context.departmentId) denied();
    if (requested && requested !== context.departmentId) denied();
    return context.departmentId ?? undefined;
  }

  /** Build the Class.where clause scoped by college + optional department + optional faculty. */
  private classWhere(context: AuthorizationContext, extra: { departmentId?: string; sectionId?: string; classId?: string } = {}) {
    const departmentId = this.scopedDepartment(context, extra.departmentId);
    const isFacultyOnly = context.roles.includes('FACULTY') && !context.roles.includes('ADMIN') && !context.roles.includes('HOD');
    return {
      collegeId: context.collegeId,
      ...(extra.classId ? { id: extra.classId } : {}),
      ...(extra.sectionId ? { sectionId: extra.sectionId } : {}),
      ...(departmentId ? { section: { semester: { course: { departmentId } } } } : {}),
      ...(isFacultyOnly ? { faculty: { userId: context.userId } } : {}),
    };
  }


  /** Resolve and assert the caller can access the given classId within their scope. */
  private async resolveClass(classId: string, context: AuthorizationContext) {
    const cls = await this.database.class.findFirst({ where: this.classWhere(context, { classId }), include: classInclude });
    if (!cls) classMissing();
    return cls!;
  }

  /** Attendance can only be recorded once per student, and only for students actively enrolled in the class's section. */
  private async assertStudentsInSection(sectionId: string, studentIds: string[], context: AuthorizationContext): Promise<void> {
    const unique = [...new Set(studentIds)];
    if (unique.length !== studentIds.length) throw new BadRequestException({ code: 'DUPLICATE_STUDENT', message: 'Each student can appear only once in an attendance session.' });
    const enrolled = await this.database.enrollment.findMany({ where: { collegeId: context.collegeId, sectionId, status: 'ACTIVE', studentId: { in: unique } }, select: { studentId: true } });
    if (enrolled.length !== unique.length) throw new BadRequestException({ code: 'STUDENT_NOT_IN_CLASS', message: 'Attendance can only be recorded for students enrolled in this class.' });
  }

  async listClasses(query: ClassListQuery, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const where = this.classWhere(context, { departmentId: query.departmentId, sectionId: query.sectionId });
    const [items, total] = await Promise.all([
      this.database.class.findMany({ where, include: classInclude, orderBy: [{ section: { semester: { course: { name: 'asc' } } } }, { subject: { name: 'asc' } }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.class.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createAttendance(input: CreateAttendanceDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const cls = await this.resolveClass(input.classId, context);
    await this.assertStudentsInSection(cls.sectionId, input.records.map((r) => r.studentId), context);
    try {
      const attendance = await this.database.$transaction(async (tx) => {
        // Records are written with createMany, as in updates: a nested create can't set collegeId, which the
        // record's composite relations need, so Prisma rejected every new session.
        const session = await tx.attendance.create({ data: { collegeId: context.collegeId, classId: input.classId, heldOn: new Date(input.heldOn) } });
        await tx.attendanceRecord.createMany({
          data: input.records.map((r) => ({ collegeId: context.collegeId, attendanceId: session.id, studentId: r.studentId, status: r.status, note: r.note })),
        });
        const created = await tx.attendance.findFirstOrThrow({ where: { id: session.id, collegeId: context.collegeId }, include: attendanceInclude });
        await tx.auditLog.create({
          data: { collegeId: context.collegeId, actorId: context.userId, action: 'ATTENDANCE_MARKED', entityType: 'Attendance', entityId: created.id, metadata: { classId: created.classId, records: created.records.length } },
        });
        return created;
      });
      return withCorrectionWindow(attendance);
    } catch (error) {
      if (isUnique(error)) throw new ConflictException({ code: 'ATTENDANCE_EXISTS', message: 'Attendance for this class on this date already exists.' });
      throw error;
    }
  }

  async listAttendance(query: AttendanceListQuery, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const classWhere = query.classId ? this.classWhere(context, { classId: query.classId }) : this.classWhere(context);
    const where = {
      collegeId: context.collegeId,
      class: classWhere,
      ...(query.from ? { heldOn: { gte: new Date(query.from) } } : {}),
      ...(query.to ? { heldOn: { ...(query.from ? { gte: new Date(query.from) } : {}), lte: new Date(query.to) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.database.attendance.findMany({ where, include: attendanceInclude, orderBy: { heldOn: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.attendance.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getAttendance(id: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const item = await this.database.attendance.findFirst({ where: { id, collegeId: context.collegeId, class: this.classWhere(context) }, include: attendanceInclude });
    if (!item) missing();
    return withCorrectionWindow(item!);
  }

  /**
   * Attendance for the signed-in student only. The student is resolved from the authenticated user,
   * so no student id is ever taken from the request.
   */
  async getMyAttendance(query: MyAttendanceQuery, context: AuthorizationContext) {
    if (!context.roles.includes('STUDENT')) denied();
    const student = await this.database.student.findFirst({ where: { collegeId: context.collegeId, userId: context.userId }, select: { id: true } });
    if (!student) throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student profile was not found.' });

    const records = await this.database.attendanceRecord.findMany({
      where: { collegeId: context.collegeId, studentId: student.id },
      select: myRecordSelect,
      orderBy: [{ attendance: { heldOn: 'desc' } }, { createdAt: 'desc' }],
    });

    const overall = emptyTally();
    const subjects = new Map<string, { subject: MyRecord['attendance']['class']['subject']; faculty: MyRecord['attendance']['class']['faculty']; tally: Tally }>();
    for (const record of records) {
      const { subject, faculty } = record.attendance.class;
      const entry = subjects.get(subject.id) ?? { subject, faculty, tally: emptyTally() };
      count(entry.tally, record.status);
      count(overall, record.status);
      subjects.set(subject.id, entry);
    }

    const filtered = records.filter((record) => {
      const day = dateKey(record.attendance.heldOn);
      return (!query.subjectId || record.attendance.class.subject.id === query.subjectId) && (!query.from || day >= query.from) && (!query.to || day <= query.to);
    });
    const days = new Map<string, Tally>();
    for (const record of filtered) {
      const day = dateKey(record.attendance.heldOn);
      const tally = days.get(day) ?? emptyTally();
      count(tally, record.status);
      days.set(day, tally);
    }

    const start = (query.page - 1) * query.pageSize;
    return {
      threshold: ATTENDANCE_THRESHOLD_PERCENT,
      overall: summarize(overall),
      subjects: [...subjects.values()]
        .map(({ subject, faculty, tally }) => ({ subject, faculty, ...summarize(tally) }))
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name)),
      days: [...days.entries()].map(([date, tally]) => ({ date, ...summarize(tally) })).sort((a, b) => a.date.localeCompare(b.date)),
      records: {
        items: filtered.slice(start, start + query.pageSize).map((record) => ({ id: record.id, status: record.status, note: record.note, heldOn: dateKey(record.attendance.heldOn), subject: record.attendance.class.subject })),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  async updateAttendance(id: string, input: UpdateAttendanceDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const attendance = await this.getAttendance(id, context);
    const facultyOnly = context.roles.includes('FACULTY') && !context.roles.includes('HOD') && !context.roles.includes('ADMIN');
    if (facultyOnly && new Date() > new Date(attendance.correctionWindowEndsAt)) {
      throw new ForbiddenException({ code: 'CORRECTION_WINDOW_CLOSED', message: `Attendance can only be corrected within ${ATTENDANCE_CORRECTION_WINDOW_HOURS} hours of being marked. Ask your HOD to correct it.` });
    }
    await this.assertStudentsInSection(attendance.class.sectionId, input.records.map((r) => r.studentId), context);
    const before = new Map(attendance.records.map((r) => [r.studentId, { status: r.status, note: r.note ?? null }]));
    const incoming = new Set(input.records.map((r) => r.studentId));
    // A correction replaces the whole record set, so students left out are removed and must be logged too.
    const changes = [
      ...input.records
        .map((r) => ({ studentId: r.studentId, from: before.get(r.studentId) ?? null, to: { status: r.status, note: r.note ?? null } as { status: AttendanceStatus; note: string | null } | null }))
        .filter((change) => change.from?.status !== change.to?.status || change.from?.note !== change.to?.note),
      ...[...before.entries()].filter(([studentId]) => !incoming.has(studentId)).map(([studentId, from]) => ({ studentId, from, to: null })),
    ];
    await this.database.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({ where: { collegeId: context.collegeId, attendanceId: attendance.id } });
      await tx.attendanceRecord.createMany({
        data: input.records.map((r) => ({ collegeId: context.collegeId, attendanceId: attendance.id, studentId: r.studentId, status: r.status, note: r.note })),
      });
      if (changes.length > 0) {
        await tx.auditLog.create({
          data: { collegeId: context.collegeId, actorId: context.userId, action: 'ATTENDANCE_CORRECTED', entityType: 'Attendance', entityId: attendance.id, metadata: { changes } },
        });
      }
    });
    return this.getAttendance(id, context);
  }

  /** Who marked and corrected a session, oldest first, for anyone allowed to open the session. */
  async getAttendanceHistory(id: string, context: AuthorizationContext) {
    const attendance = await this.getAttendance(id, context);
    const students = new Map(attendance.records.map((r) => [r.studentId, r.student]));
    const entries = await this.database.auditLog.findMany({
      where: { collegeId: context.collegeId, entityType: 'Attendance', entityId: attendance.id },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return entries.map((entry) => {
      const metadata = (entry.metadata ?? {}) as { changes?: Array<{ studentId: string; from: { status: string; note: string | null } | null; to: { status: string; note: string | null } | null }> };
      return {
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
        actor: entry.actor,
        changes: (metadata.changes ?? []).map((change) => ({ ...change, student: students.get(change.studentId) ?? null })),
      };
    });
  }
}

const classInclude = {
  section: { include: { semester: { include: { course: { include: { department: true } } } } } },
  subject: true,
  faculty: true,
};

const attendanceInclude = {
  class: { include: classInclude },
  records: { include: { student: { select: { id: true, firstName: true, lastName: true, studentCode: true } } }, orderBy: [{ student: { lastName: 'asc' as const } }, { student: { firstName: 'asc' as const } }] },
};

const myRecordSelect = {
  id: true,
  status: true,
  note: true,
  attendance: {
    select: {
      heldOn: true,
      class: {
        select: {
          subject: { select: { id: true, code: true, name: true } },
          faculty: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
};

type MyRecord = {
  id: string;
  status: AttendanceStatus;
  note: string | null;
  attendance: { heldOn: Date; class: { subject: { id: string; code: string; name: string }; faculty: { firstName: string; lastName: string } | null } };
};
type Tally = { present: number; absent: number; late: number; excused: number };

const emptyTally = (): Tally => ({ present: 0, absent: 0, late: 0, excused: 0 });
const count = (tally: Tally, status: AttendanceStatus): void => {
  if (status === 'PRESENT') tally.present += 1;
  else if (status === 'ABSENT') tally.absent += 1;
  else if (status === 'LATE') tally.late += 1;
  else tally.excused += 1;
};

/** Late counts as attended. Excused sessions are left out of the percentage instead of counting against the student. */
export const summarize = (tally: Tally) => {
  const attended = tally.present + tally.late;
  const counted = attended + tally.absent;
  const percentage = counted === 0 ? null : Math.round((attended / counted) * 1000) / 10;
  return { ...tally, attended, counted, percentage, belowThreshold: percentage !== null && percentage < ATTENDANCE_THRESHOLD_PERCENT };
};

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Adds when the faculty correction window closes, counted from when the session was first saved. */
const withCorrectionWindow = <T extends { createdAt: Date }>(attendance: T): T & { correctionWindowEndsAt: string } => ({
  ...attendance,
  correctionWindowEndsAt: new Date(attendance.createdAt.getTime() + ATTENDANCE_CORRECTION_WINDOW_HOURS * 3_600_000).toISOString(),
});

const isUnique = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
