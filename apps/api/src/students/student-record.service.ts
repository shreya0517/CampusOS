import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { ATTENDANCE_THRESHOLD_PERCENT, count, emptyTally, summarize } from '../attendance/attendance.service';
import type { Tally } from '../attendance/attendance.service';
import { StudentsService } from './students.service';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const money = (value: unknown): number => Number(value ?? 0);
const decimal = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/** At most this many recent assignments are listed in a record. */
export const RECORD_COURSEWORK_LIMIT = 50;

/**
 * One student's full record for Admin and HOD: profile and enrollment, attendance by subject, coursework, published
 * results and, for Admin only, invoices and payments. HODs reach students of their own department only, and the spec
 * gives them no unrestricted financial access, so `fees` is null for them.
 */
@Injectable()
export class StudentRecordService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StudentsService) private readonly students: StudentsService,
  ) {}

  async record(id: string, context: AuthorizationContext) {
    const isAdmin = context.roles.includes('ADMIN');
    if (!isAdmin && !context.roles.includes('HOD')) denied();
    // Reuses the directory's scoping: Admin reaches every student in the college, an HOD only their department's.
    const student = await this.students.get(id, context);
    const collegeId = context.collegeId;
    // A student can have records in more than one department; an HOD sees only those from their own.
    const hodDepartment = isAdmin ? null : context.departmentId;
    if (!isAdmin && !hodDepartment) denied();
    const inDepartment = hodDepartment ? { semester: { course: { departmentId: hodDepartment } } } : {};

    const [attendanceRecords, assignments, results, invoices] = await Promise.all([
      this.database.attendanceRecord.findMany({
        where: { collegeId, studentId: id, ...(hodDepartment ? { attendance: { class: { section: inDepartment } } } : {}) },
        select: { status: true, attendance: { select: { class: { select: { subject: { select: { id: true, code: true, name: true } } } } } } },
      }),
      this.database.assignment.findMany({
        where: { collegeId, class: { section: { enrollments: { some: { collegeId, studentId: id, status: 'ACTIVE' } }, ...inDepartment } } },
        select: {
          id: true,
          title: true,
          dueAt: true,
          maxMarks: true,
          class: { select: { subject: { select: { code: true, name: true } } } },
          submissions: { where: { collegeId, studentId: id }, select: { status: true, submittedAt: true, marksAwarded: true } },
        },
        // Undated assignments go last, so they can't push every dated one out of the limit.
        orderBy: [{ dueAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: RECORD_COURSEWORK_LIMIT,
      }),
      this.database.result.findMany({
        where: { collegeId, studentId: id, publishedAt: { not: null }, ...(hodDepartment ? { exam: { examSubjects: { some: inDepartment } } } : {}) },
        select: { id: true, totalMarks: true, percentage: true, status: true, publishedAt: true, exam: { select: { id: true, name: true } } },
        orderBy: { publishedAt: 'desc' },
      }),
      isAdmin
        ? this.database.invoice.findMany({
            where: { collegeId, studentId: id, status: { not: 'DRAFT' } },
            select: {
              id: true,
              invoiceNumber: true,
              amountDue: true,
              dueOn: true,
              status: true,
              issuedAt: true,
              payments: { select: { id: true, amount: true, method: true, status: true, paidAt: true, transactionRef: true }, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    // Attendance overall and by subject, with the same rules as the student's own attendance page.
    const overall = emptyTally();
    const bySubject = new Map<string, { subject: { id: string; code: string; name: string }; tally: Tally }>();
    for (const record of attendanceRecords) {
      const { subject } = record.attendance.class;
      const entry = bySubject.get(subject.id) ?? { subject, tally: emptyTally() };
      count(entry.tally, record.status);
      count(overall, record.status);
      bySubject.set(subject.id, entry);
    }

    const now = new Date();
    const coursework = assignments.map((assignment) => {
      // A saved draft hasn't been handed in, so it counts like no submission.
      const submission = assignment.submissions[0]?.status === 'DRAFT' ? undefined : assignment.submissions[0];
      const missing = !submission && assignment.dueAt !== null && assignment.dueAt < now;
      return {
        id: assignment.id,
        title: assignment.title,
        subject: assignment.class.subject,
        dueAt: assignment.dueAt?.toISOString() ?? null,
        maxMarks: money(assignment.maxMarks),
        status: submission?.status ?? (missing ? 'MISSING' : 'NOT_SUBMITTED'),
        submittedAt: submission?.submittedAt?.toISOString() ?? null,
        marksAwarded: decimal(submission?.marksAwarded),
      };
    });

    const fees = invoices
      ? (() => {
          const rows = invoices.map((invoice) => {
            const paid = invoice.payments.filter((payment) => payment.status === 'COMPLETED').reduce((sum, payment) => sum + money(payment.amount), 0);
            const amountDue = money(invoice.amountDue);
            return {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              amountDue,
              paid,
              balance: invoice.status === 'VOID' ? 0 : Math.max(0, amountDue - paid),
              dueOn: invoice.dueOn?.toISOString().slice(0, 10) ?? null,
              status: invoice.status,
              issuedAt: invoice.issuedAt?.toISOString() ?? null,
              payments: invoice.payments.map((payment) => ({ ...payment, amount: money(payment.amount), paidAt: payment.paidAt?.toISOString() ?? null })),
            };
          });
          const billed = rows.filter((row) => row.status !== 'VOID').reduce((sum, row) => sum + row.amountDue, 0);
          const paid = rows.reduce((sum, row) => sum + row.paid, 0);
          const balance = rows.reduce((sum, row) => sum + row.balance, 0);
          return { billed, paid, balance, invoices: rows };
        })()
      : null;

    return {
      student,
      attendance: {
        threshold: ATTENDANCE_THRESHOLD_PERCENT,
        overall: summarize(overall),
        subjects: [...bySubject.values()].map(({ subject, tally }) => ({ subject, ...summarize(tally) })).sort((a, b) => a.subject.name.localeCompare(b.subject.name)),
      },
      coursework: {
        assigned: coursework.length,
        submitted: coursework.filter((item) => !['NOT_SUBMITTED', 'MISSING', 'DRAFT'].includes(item.status)).length,
        missing: coursework.filter((item) => item.status === 'MISSING').length,
        items: coursework,
      },
      results: results.map((result) => ({
        id: result.id,
        exam: result.exam,
        totalMarks: decimal(result.totalMarks),
        percentage: decimal(result.percentage),
        status: result.status,
        publishedAt: result.publishedAt?.toISOString() ?? null,
      })),
      fees,
    };
  }
}
