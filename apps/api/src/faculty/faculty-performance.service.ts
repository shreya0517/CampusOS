import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';

/** Activity is measured over this many recent days, so the numbers reflect current work rather than all-time totals. */
export const PERFORMANCE_WINDOW_DAYS = 30;

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};

type TaskCounts = { assigned: number; pending: number; inProgress: number; submitted: number; approved: number; rework: number; overdue: number };
const emptyTasks = (): TaskCounts => ({ assigned: 0, pending: 0, inProgress: 0, submitted: 0, approved: 0, rework: 0, overdue: 0 });

/**
 * Faculty workload and activity from system records only (the spec: "Performance should be measured through actual
 * system records rather than an arbitrary score"). Admins see every department, HODs only their own.
 */
@Injectable()
export class FacultyPerformanceService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async report(query: { departmentId?: string }, context: AuthorizationContext) {
    // Same roles as the route (ADMIN, HOD), like every other Admin endpoint in the API.
    const isAdmin = context.roles.includes('ADMIN');
    if (!isAdmin && !context.roles.includes('HOD')) denied();
    if (!isAdmin && (!context.departmentId || (query.departmentId && query.departmentId !== context.departmentId))) denied();
    const departmentId = isAdmin ? query.departmentId : context.departmentId ?? undefined;
    const since = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 86_400_000);
    const collegeId = context.collegeId;

    const faculty = await this.database.faculty.findMany({
      where: { collegeId, ...(departmentId ? { departmentId } : {}) },
      select: { id: true, userId: true, employeeCode: true, firstName: true, lastName: true, department: { select: { id: true, code: true, name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const facultyIds = faculty.map((member) => member.id);
    const userIds = faculty.map((member) => member.userId).filter((id): id is string => Boolean(id));

    const [classes, sessions, assignmentsCreated, toEvaluate, taskRows, overdueRows] = await Promise.all([
      this.database.class.findMany({ where: { collegeId, facultyId: { in: facultyIds } }, select: { id: true, facultyId: true } }),
      this.database.attendance.findMany({ where: { collegeId, heldOn: { gte: since }, class: { facultyId: { in: facultyIds } } }, select: { class: { select: { facultyId: true } } } }),
      this.database.assignment.groupBy({ by: ['createdById'], where: { collegeId, createdById: { in: facultyIds }, createdAt: { gte: since } }, _count: { _all: true } }),
      this.database.submission.findMany({
        where: { collegeId, status: { in: ['SUBMITTED', 'LATE'] }, assignment: { class: { facultyId: { in: facultyIds } } } },
        select: { assignment: { select: { class: { select: { facultyId: true } } } } },
      }),
      this.database.taskAssignment.groupBy({ by: ['assigneeUserId', 'status'], where: { collegeId, assigneeUserId: { in: userIds } }, _count: { _all: true } }),
      this.database.taskAssignment.groupBy({
        by: ['assigneeUserId'],
        where: { collegeId, assigneeUserId: { in: userIds }, status: { not: 'APPROVED' }, task: { deadline: { lt: new Date() } } },
        _count: { _all: true },
      }),
    ]);

    const tally = (ids: Array<string | null | undefined>): Map<string, number> => {
      const counts = new Map<string, number>();
      for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      return counts;
    };
    const classCount = tally(classes.map((cls) => cls.facultyId));
    const sessionCount = tally(sessions.map((session) => session.class.facultyId));
    const evaluateCount = tally(toEvaluate.map((submission) => submission.assignment.class.facultyId));
    const createdCount = new Map(assignmentsCreated.map((row) => [row.createdById ?? '', row._count._all]));
    const tasks = new Map<string, TaskCounts>();
    for (const row of taskRows) {
      const counts = tasks.get(row.assigneeUserId) ?? emptyTasks();
      counts.assigned += row._count._all;
      if (row.status === 'PENDING') counts.pending += row._count._all;
      else if (row.status === 'IN_PROGRESS') counts.inProgress += row._count._all;
      else if (row.status === 'SUBMITTED') counts.submitted += row._count._all;
      else if (row.status === 'APPROVED') counts.approved += row._count._all;
      else counts.rework += row._count._all;
      tasks.set(row.assigneeUserId, counts);
    }
    for (const row of overdueRows) {
      const counts = tasks.get(row.assigneeUserId) ?? emptyTasks();
      counts.overdue = row._count._all;
      tasks.set(row.assigneeUserId, counts);
    }

    return {
      windowDays: PERFORMANCE_WINDOW_DAYS,
      faculty: faculty.map(({ userId, ...member }) => ({
        faculty: member,
        classes: classCount.get(member.id) ?? 0,
        sessionsMarked: sessionCount.get(member.id) ?? 0,
        assignmentsCreated: createdCount.get(member.id) ?? 0,
        pendingEvaluations: evaluateCount.get(member.id) ?? 0,
        tasks: (userId && tasks.get(userId)) || emptyTasks(),
      })),
    };
  }
}
