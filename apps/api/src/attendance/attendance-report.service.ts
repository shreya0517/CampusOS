import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { todayAsStoredDate } from '../overview/institution-overview.service';
import { ATTENDANCE_THRESHOLD_PERCENT, count, emptyTally, summarize } from './attendance.service';
import type { Tally } from './attendance.service';

/** Without dates the report covers this many days, ending today in the college's timezone. */
export const REPORT_DEFAULT_DAYS = 30;
/** Longest range one report may cover. */
export const REPORT_MAX_DAYS = 366;
/** At most this many students are listed as short of attendance. */
export const SHORTAGE_LIMIT = 500;

export type AttendanceReportQuery = { departmentId?: string; from?: string; to?: string };

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const dateKey = (date: Date): string => date.toISOString().slice(0, 10);
const add = (map: Map<string, Tally>, key: string, status: Parameters<typeof count>[1], amount: number): void => {
  const tally = map.get(key) ?? emptyTally();
  count(tally, status, amount);
  map.set(key, tally);
};

/**
 * Attendance monitoring for Admin (every department, or one) and HOD (their own): the overall figure for a date range,
 * then by department, by class and by month, and every student under the threshold. Same rules as the student view:
 * late counts as present and excused sessions are left out.
 */
@Injectable()
export class AttendanceReportService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async report(query: AttendanceReportQuery, context: AuthorizationContext) {
    const isAdmin = context.roles.includes('ADMIN');
    if (!isAdmin && !context.roles.includes('HOD')) denied();
    if (!isAdmin && (!context.departmentId || (query.departmentId && query.departmentId !== context.departmentId))) denied();
    const departmentId = isAdmin ? query.departmentId : (context.departmentId as string);
    const collegeId = context.collegeId;

    const college = await this.database.college.findUnique({ where: { id: collegeId }, select: { timezone: true } });
    const to = query.to ? new Date(query.to) : todayAsStoredDate(college?.timezone);
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - (REPORT_DEFAULT_DAYS - 1) * 86_400_000);
    if (from > to) throw new BadRequestException({ code: 'INVALID_RANGE', message: 'The start date must be on or before the end date.' });
    if ((to.getTime() - from.getTime()) / 86_400_000 >= REPORT_MAX_DAYS) throw new BadRequestException({ code: 'RANGE_TOO_LONG', message: `A report can cover at most ${REPORT_MAX_DAYS} days.` });

    const inDepartment = departmentId ? { section: { semester: { course: { departmentId } } } } : {};
    const classes = await this.database.class.findMany({
      where: { collegeId, ...inDepartment },
      select: {
        id: true,
        subject: { select: { id: true, code: true, name: true } },
        section: { select: { id: true, code: true, semester: { select: { name: true, course: { select: { code: true, department: { select: { id: true, code: true, name: true } } } } } } } },
        faculty: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const classIds = classes.map((cls) => cls.id);
    const sessions = classIds.length
      ? await this.database.attendance.findMany({ where: { collegeId, classId: { in: classIds }, heldOn: { gte: from, lte: to } }, select: { id: true, classId: true, heldOn: true } })
      : [];
    const sessionIds = sessions.map((session) => session.id);
    const [bySession, byStudent] = sessionIds.length
      ? await Promise.all([
          this.database.attendanceRecord.groupBy({ by: ['attendanceId', 'status'], where: { collegeId, attendanceId: { in: sessionIds } }, _count: { _all: true } }),
          this.database.attendanceRecord.groupBy({ by: ['studentId', 'status'], where: { collegeId, attendanceId: { in: sessionIds } }, _count: { _all: true } }),
        ])
      : [[], []];

    // Roll session totals up to class, department and month.
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const classById = new Map(classes.map((cls) => [cls.id, cls]));
    const overall = emptyTally();
    const perClass = new Map<string, Tally>();
    const perDepartment = new Map<string, Tally>();
    const perMonth = new Map<string, Tally>();
    for (const row of bySession) {
      const session = sessionById.get(row.attendanceId);
      const cls = session && classById.get(session.classId);
      if (!session || !cls) continue;
      const amount = row._count._all;
      count(overall, row.status, amount);
      add(perClass, cls.id, row.status, amount);
      add(perDepartment, cls.section.semester.course.department.id, row.status, amount);
      add(perMonth, dateKey(session.heldOn).slice(0, 7), row.status, amount);
    }
    const sessionsPerClass = new Map<string, number>();
    for (const session of sessions) sessionsPerClass.set(session.classId, (sessionsPerClass.get(session.classId) ?? 0) + 1);

    // Students under the threshold, worst first.
    const perStudent = new Map<string, Tally>();
    for (const row of byStudent) add(perStudent, row.studentId, row.status, row._count._all);
    const allShort = [...perStudent.entries()]
      .map(([studentId, tally]) => ({ studentId, summary: summarize(tally) }))
      .filter((entry) => entry.summary.belowThreshold)
      .sort((a, b) => (a.summary.percentage ?? 0) - (b.summary.percentage ?? 0));
    const short = allShort.slice(0, SHORTAGE_LIMIT);
    const students = short.length
      ? await this.database.student.findMany({
          where: { collegeId, id: { in: short.map((entry) => entry.studentId) } },
          select: {
            id: true,
            studentCode: true,
            firstName: true,
            lastName: true,
            enrollments: {
              where: { status: 'ACTIVE', ...(departmentId ? { section: { semester: { course: { departmentId } } } } : {}) },
              select: { section: { select: { code: true, semester: { select: { name: true, course: { select: { code: true, department: { select: { code: true } } } } } } } } },
              take: 1,
            },
          },
        })
      : [];
    const studentById = new Map(students.map((student) => [student.id, student]));

    const departments = [...new Map(classes.map((cls) => [cls.section.semester.course.department.id, cls.section.semester.course.department])).values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    return {
      range: { from: dateKey(from), to: dateKey(to) },
      threshold: ATTENDANCE_THRESHOLD_PERCENT,
      sessions: sessions.length,
      overall: summarize(overall),
      byDepartment: departments.map((department) => ({ department, ...summarize(perDepartment.get(department.id) ?? emptyTally()) })),
      byClass: classes
        .map((cls) => ({
          classId: cls.id,
          subject: cls.subject,
          section: { code: cls.section.code, semester: cls.section.semester.name, course: cls.section.semester.course.code, department: cls.section.semester.course.department.code },
          faculty: cls.faculty ? { id: cls.faculty.id, name: `${cls.faculty.firstName} ${cls.faculty.lastName}` } : null,
          sessions: sessionsPerClass.get(cls.id) ?? 0,
          ...summarize(perClass.get(cls.id) ?? emptyTally()),
        }))
        .sort((a, b) => a.subject.name.localeCompare(b.subject.name) || a.section.code.localeCompare(b.section.code)),
      // The list is capped; these say how many students are short in all, and whether the list is cut.
      shortageTotal: allShort.length,
      shortagesTruncated: allShort.length > short.length,
      byMonth: [...perMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, tally]) => ({ month, ...summarize(tally) })),
      shortages: short.map(({ studentId, summary }) => {
        const student = studentById.get(studentId);
        const section = student?.enrollments[0]?.section;
        return {
          student: student ? { id: student.id, studentCode: student.studentCode, name: `${student.firstName} ${student.lastName}` } : { id: studentId, studentCode: '', name: 'Unknown student' },
          section: section ? `${section.semester.course.department.code} · ${section.semester.course.code} · ${section.semester.name} · ${section.code}` : null,
          ...summary,
        };
      }),
    };
  }
}
