import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AttendanceStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { summarize } from '../attendance/attendance.service';

/** Department attendance and the attendance trend cover this many recent days. */
export const OVERVIEW_WINDOW_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 12;
/** Each source contributes at most this many events, so busy modules like attendance don't crowd out the rest. */
const ACTIVITY_PER_SOURCE = 4;
const OPEN_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'REWORK'] as const;
const OPEN_INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};

type Tally = { present: number; absent: number; late: number; excused: number };
const emptyTally = (): Tally => ({ present: 0, absent: 0, late: 0, excused: 0 });
const add = (tally: Tally, status: AttendanceStatus, amount: number): void => {
  if (status === 'PRESENT') tally.present += amount;
  else if (status === 'ABSENT') tally.absent += amount;
  else if (status === 'LATE') tally.late += amount;
  else tally.excused += amount;
};

export type ActivityItem = { type: string; title: string; detail: string; at: string; href: string | null };

/**
 * Today's calendar date in the college's timezone, as stored in @db.Date columns (midnight UTC of that date). An unknown
 * timezone falls back to the server's own date rather than failing the dashboard.
 */
export const todayAsStoredDate = (timeZone?: string | null, now = new Date()): Date => {
  try {
    return new Date(now.toLocaleDateString('en-CA', timeZone ? { timeZone } : undefined));
  } catch {
    return new Date(now.toLocaleDateString('en-CA'));
  }
};

const fullName = (person: { firstName: string; lastName: string }): string => `${person.firstName} ${person.lastName}`.trim();
const money = (value: unknown): number => Number(value ?? 0);

/**
 * The Admin dashboard in one request, computed from stored records: institution totals, today's attendance, task,
 * visitor, exam and fee figures, a row per department and the latest activity across modules. Admin only.
 */
@Injectable()
export class InstitutionOverviewService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async overview(context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const collegeId = context.collegeId;
    const college = await this.database.college.findUnique({ where: { id: collegeId }, select: { timezone: true } });
    const today = todayAsStoredDate(college?.timezone);
    const since = new Date(today.getTime() - (OVERVIEW_WINDOW_DAYS - 1) * 86_400_000);

    const [
      students,
      faculty,
      departments,
      todayRecords,
      taskRows,
      overdueTasks,
      pendingVisitors,
      upcomingExams,
      collected,
      openInvoices,
      sessionRecords,
      sessions,
      activeEnrollments,
      hodRoles,
    ] = await Promise.all([
      this.database.student.count({ where: { collegeId } }),
      this.database.faculty.findMany({ where: { collegeId }, select: { id: true, userId: true, departmentId: true, firstName: true, lastName: true, employeeCode: true } }),
      this.database.department.findMany({ where: { collegeId }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.database.attendanceRecord.groupBy({ by: ['status'], where: { collegeId, attendance: { heldOn: today } }, _count: { _all: true } }),
      this.database.taskAssignment.groupBy({ by: ['assigneeUserId', 'status'], where: { collegeId }, _count: { _all: true } }),
      this.database.taskAssignment.count({ where: { collegeId, status: { not: 'APPROVED' }, task: { deadline: { lt: new Date() } } } }),
      this.database.visitor.count({ where: { collegeId, status: 'PENDING' } }),
      this.database.exam.count({ where: { collegeId, status: { in: ['DRAFT', 'SCHEDULED'] }, startsOn: { gte: today } } }),
      this.database.payment.aggregate({ where: { collegeId, status: 'COMPLETED' }, _sum: { amount: true } }),
      this.database.invoice.findMany({
        where: { collegeId, status: { in: [...OPEN_INVOICE_STATUSES] } },
        select: { amountDue: true, dueOn: true, payments: { where: { status: 'COMPLETED' }, select: { amount: true } } },
      }),
      // The window ends today: sessions recorded with a future date don't count yet.
      this.database.attendanceRecord.groupBy({ by: ['attendanceId', 'status'], where: { collegeId, attendance: { heldOn: { gte: since, lte: today } } }, _count: { _all: true } }),
      this.database.attendance.findMany({
        where: { collegeId, heldOn: { gte: since, lte: today } },
        select: { id: true, class: { select: { section: { select: { semester: { select: { course: { select: { departmentId: true } } } } } } } } },
      }),
      this.database.enrollment.findMany({
        where: { collegeId, status: 'ACTIVE' },
        select: { studentId: true, section: { select: { semester: { select: { course: { select: { departmentId: true } } } } } } },
      }),
      this.database.userRole.findMany({ where: { collegeId, role: { name: 'HOD' } }, select: { userId: true } }),
    ]);

    // Today's attendance across the college.
    const todayTally = emptyTally();
    for (const row of todayRecords) add(todayTally, row.status, row._count._all);

    // Tasks by status, college-wide and per assignee.
    const tasks = { pending: 0, inProgress: 0, submitted: 0, approved: 0, rework: 0, overdue: overdueTasks };
    const openTasksByUser = new Map<string, number>();
    for (const row of taskRows) {
      const amount = row._count._all;
      if (row.status === 'PENDING') tasks.pending += amount;
      else if (row.status === 'IN_PROGRESS') tasks.inProgress += amount;
      else if (row.status === 'SUBMITTED') tasks.submitted += amount;
      else if (row.status === 'APPROVED') tasks.approved += amount;
      else tasks.rework += amount;
      if ((OPEN_TASK_STATUSES as readonly string[]).includes(row.status)) {
        openTasksByUser.set(row.assigneeUserId, (openTasksByUser.get(row.assigneeUserId) ?? 0) + amount);
      }
    }

    // Fees: completed payments, and what is still owed on issued invoices.
    let outstanding = 0;
    let overdueInvoices = 0;
    for (const invoice of openInvoices) {
      const paid = invoice.payments.reduce((sum, payment) => sum + money(payment.amount), 0);
      const balance = Math.max(0, money(invoice.amountDue) - paid);
      outstanding += balance;
      if (balance > 0 && invoice.dueOn && invoice.dueOn < today) overdueInvoices += 1;
    }

    // Per department: HOD, faculty, active students, attendance over the window and open tasks.
    const facultyByUser = new Map(faculty.filter((member) => member.userId).map((member) => [member.userId as string, member]));
    const hodByDepartment = new Map<string, (typeof faculty)[number]>();
    for (const { userId } of hodRoles) {
      const member = facultyByUser.get(userId);
      if (member?.departmentId && !hodByDepartment.has(member.departmentId)) hodByDepartment.set(member.departmentId, member);
    }
    const facultyCount = new Map<string, number>();
    for (const member of faculty) if (member.departmentId) facultyCount.set(member.departmentId, (facultyCount.get(member.departmentId) ?? 0) + 1);
    const studentsByDepartment = new Map<string, Set<string>>();
    for (const enrollment of activeEnrollments) {
      const departmentId = enrollment.section.semester.course.departmentId;
      const set = studentsByDepartment.get(departmentId) ?? new Set<string>();
      set.add(enrollment.studentId);
      studentsByDepartment.set(departmentId, set);
    }
    const sessionDepartment = new Map(sessions.map((session) => [session.id, session.class.section.semester.course.departmentId]));
    const attendanceByDepartment = new Map<string, Tally>();
    const windowTally = emptyTally();
    for (const row of sessionRecords) {
      add(windowTally, row.status, row._count._all);
      const departmentId = sessionDepartment.get(row.attendanceId);
      if (!departmentId) continue;
      const tally = attendanceByDepartment.get(departmentId) ?? emptyTally();
      add(tally, row.status, row._count._all);
      attendanceByDepartment.set(departmentId, tally);
    }
    const openTasksByDepartment = new Map<string, number>();
    for (const [userId, amount] of openTasksByUser) {
      const departmentId = facultyByUser.get(userId)?.departmentId;
      if (departmentId) openTasksByDepartment.set(departmentId, (openTasksByDepartment.get(departmentId) ?? 0) + amount);
    }

    return {
      generatedAt: new Date().toISOString(),
      windowDays: OVERVIEW_WINDOW_DAYS,
      totals: { students, faculty: faculty.length, departments: departments.length },
      attendance: { today: summarize(todayTally), window: summarize(windowTally) },
      tasks,
      pendingVisitors,
      upcomingExams,
      fees: { collected: money(collected._sum.amount), outstanding, openInvoices: openInvoices.length, overdueInvoices },
      departments: departments.map((department) => {
        const hod = hodByDepartment.get(department.id);
        return {
          ...department,
          hod: hod ? { id: hod.id, name: fullName(hod), employeeCode: hod.employeeCode } : null,
          faculty: facultyCount.get(department.id) ?? 0,
          students: studentsByDepartment.get(department.id)?.size ?? 0,
          attendance: summarize(attendanceByDepartment.get(department.id) ?? emptyTally()),
          openTasks: openTasksByDepartment.get(department.id) ?? 0,
        };
      }),
      recentActivity: await this.recentActivity(collegeId),
    };
  }

  /** The latest events across modules, newest first: registrations, attendance, task submissions, visitors and marks. */
  private async recentActivity(collegeId: string): Promise<ActivityItem[]> {
    const take = ACTIVITY_PER_SOURCE;
    const [students, faculty, sessions, submissions, visitors, marks] = await Promise.all([
      this.database.student.findMany({ where: { collegeId }, select: { id: true, firstName: true, lastName: true, studentCode: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take }),
      this.database.faculty.findMany({
        where: { collegeId },
        select: { id: true, firstName: true, lastName: true, employeeCode: true, createdAt: true, department: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.database.attendance.findMany({
        where: { collegeId },
        select: {
          id: true,
          heldOn: true,
          createdAt: true,
          class: { select: { subject: { select: { code: true, name: true } }, section: { select: { code: true } }, faculty: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.database.taskAssignment.findMany({
        where: { collegeId, submittedAt: { not: null } },
        select: { submittedAt: true, task: { select: { id: true, title: true } }, assignee: { select: { displayName: true } } },
        orderBy: { submittedAt: 'desc' },
        take,
      }),
      this.database.visitor.findMany({ where: { collegeId }, select: { id: true, name: true, purpose: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take }),
      this.database.auditLog.findMany({
        where: { collegeId, action: { in: ['MARKS_SUBMITTED', 'MARKS_APPROVED', 'MARKS_RETURNED', 'ATTENDANCE_CORRECTED'] } },
        select: { action: true, entityId: true, createdAt: true, actor: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const paperIds = marks.filter((entry) => entry.action.startsWith('MARKS_')).map((entry) => entry.entityId);
    const papers = paperIds.length
      ? await this.database.examSubject.findMany({ where: { collegeId, id: { in: paperIds } }, select: { id: true, examId: true, subject: { select: { name: true } } } })
      : [];
    const paperById = new Map(papers.map((paper) => [paper.id, paper]));

    const AUDIT_TITLES: Record<string, string> = {
      MARKS_SUBMITTED: 'Marks submitted for review',
      MARKS_APPROVED: 'Marks approved',
      MARKS_RETURNED: 'Marks returned for changes',
      ATTENDANCE_CORRECTED: 'Attendance corrected',
    };
    const items: ActivityItem[] = [
      ...students.map((student) => ({
        type: 'STUDENT_ADDED',
        title: 'New student registered',
        detail: `${fullName(student)} (${student.studentCode})`,
        at: student.createdAt.toISOString(),
        href: `/dashboard/students/${student.id}`,
      })),
      ...faculty.map((member) => ({
        type: 'FACULTY_ADDED',
        title: 'Faculty member added',
        detail: `${fullName(member)} (${member.employeeCode})${member.department ? ` · ${member.department.code}` : ''}`,
        at: member.createdAt.toISOString(),
        href: `/dashboard/faculty/${member.id}`,
      })),
      ...sessions.map((session) => ({
        type: 'ATTENDANCE_MARKED',
        title: 'Attendance marked',
        detail: `${session.class.subject.name} · Section ${session.class.section.code} · ${session.heldOn.toISOString().slice(0, 10)}${
          session.class.faculty ? ` · ${fullName(session.class.faculty)}` : ''
        }`,
        at: session.createdAt.toISOString(),
        href: `/dashboard/attendance/${session.id}`,
      })),
      ...submissions.map((submission) => ({
        type: 'TASK_SUBMITTED',
        title: 'Task submitted for review',
        detail: `${submission.task.title} · ${submission.assignee.displayName}`,
        at: (submission.submittedAt as Date).toISOString(),
        href: `/dashboard/tasks/${submission.task.id}`,
      })),
      ...visitors.map((visitor) => ({
        type: 'VISITOR_REGISTERED',
        title: 'Visitor registered',
        detail: `${visitor.name} · ${visitor.purpose}`,
        at: visitor.createdAt.toISOString(),
        href: '/dashboard/visitors',
      })),
      ...marks.map((entry) => {
        const paper = paperById.get(entry.entityId);
        const by = entry.actor ? `by ${entry.actor.displayName}` : '';
        return {
          type: entry.action,
          title: AUDIT_TITLES[entry.action] ?? entry.action,
          detail: paper ? `${paper.subject.name}${by ? ` · ${by}` : ''}` : by,
          at: entry.createdAt.toISOString(),
          href:
            entry.action === 'ATTENDANCE_CORRECTED'
              ? `/dashboard/attendance/${entry.entityId}`
              : paper
                ? `/dashboard/exams/${paper.examId}/subjects/${paper.id}/marks`
                : null,
        };
      }),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, RECENT_ACTIVITY_LIMIT);
  }
}
