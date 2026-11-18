import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { SubmissionStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { ATTENDANCE_THRESHOLD_PERCENT, count, emptyTally, summarize } from '../attendance/attendance.service';
import type { Tally } from '../attendance/attendance.service';
import { todayAsStoredDate } from './institution-overview.service';

export type AnalyticsQuery = { departmentId?: string; semester?: number; from?: string; to?: string };

/** Without dates, analytics cover the current month and the five before it. */
export const ANALYTICS_DEFAULT_MONTHS = 6;
/** Longest range one request may cover. */
export const ANALYTICS_MAX_DAYS = 366;

const DAY_MS = 86_400_000;
const OPEN_INVOICE_STATUSES = new Set(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']);
/** A submission in any of these states has been handed in (drafts haven't). */
const SUBMITTED: SubmissionStatus[] = ['SUBMITTED', 'LATE', 'GRADED', 'RETURNED'];
const GRADED = new Set(['GRADED', 'RETURNED']);

type SectionInfo = { semesterNumber: number; courseId: string; departmentId: string };
type Course = { id: string; code: string; name: string; departmentId: string };
type EnrollmentRow = { studentId: string; sectionId: string; status: string; enrolledAt: Date };

/** What every section needs: the filters, the dates and where each section and semester sits. */
type Scope = {
  collegeId: string;
  departmentId?: string;
  semester?: number;
  from: Date;
  to: Date;
  /** The day after `to`, as the exclusive end for timestamp columns. */
  end: Date;
  today: Date;
  now: Date;
  months: string[];
  sectionInfo: Map<string, SectionInfo>;
  semesterInfo: Map<string, { number: number; courseId: string; departmentId: string }>;
  courses: Map<string, Course>;
  enrollments: EnrollmentRow[];
  /** Each student's current (active) placement, used to attribute records that don't carry their own department. */
  currentSection: Map<string, SectionInfo>;
};

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const dateKey = (date: Date): string => date.toISOString().slice(0, 10);
const monthKey = (date: Date): string => date.toISOString().slice(0, 7);
const money = (value: unknown): number => Number(value ?? 0);
const round2 = (value: number): number => Math.round(value * 100) / 100;
const round1 = (value: number): number => Math.round(value * 10) / 10;
export const percent = (part: number, whole: number): number | null => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10);
const bump = <K>(map: Map<K, number>, key: K, amount = 1): void => {
  map.set(key, (map.get(key) ?? 0) + amount);
};
const tallyFor = <K>(map: Map<K, Tally>, key: K): Tally => {
  let tally = map.get(key);
  if (!tally) {
    tally = emptyTally();
    map.set(key, tally);
  }
  return tally;
};
const addTo = <K>(map: Map<K, Set<string>>, key: K, value: string): void => {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
};

/** Every month from `from` to `to` as YYYY-MM, so months without activity still show as zero. */
export const monthsBetween = (from: Date, to: Date): string[] => {
  const keys: string[] = [];
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  while (year < to.getUTCFullYear() || (year === to.getUTCFullYear() && month <= to.getUTCMonth())) {
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return keys;
};

const matches = (scope: Scope, info: { semesterNumber?: number; departmentId?: string } | undefined): boolean => {
  if (!scope.departmentId && !scope.semester) return true;
  if (!info) return false;
  return (!scope.departmentId || info.departmentId === scope.departmentId) && (!scope.semester || info.semesterNumber === scope.semester);
};

/**
 * Institutional Overview analytics for Admin, computed from stored records: students, faculty, attendance, assignments
 * and exams, and fees, plus a department comparison. Filters: department, semester number and a date range (default:
 * this month and the five before it, at most a year).
 *
 * Dated figures use the range: attendance by session date, enrollments by enrollment date, assignments by due date,
 * exams by start date, payments by payment date. Head counts, outstanding fees and invoice status are as of today.
 */
@Injectable()
export class InstitutionAnalyticsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async analytics(query: AnalyticsQuery, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const collegeId = context.collegeId;

    const [college, departments, courses, semesters, sections, enrollments] = await Promise.all([
      this.database.college.findUnique({ where: { id: collegeId }, select: { timezone: true } }),
      this.database.department.findMany({ where: { collegeId }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.database.course.findMany({ where: { collegeId }, select: { id: true, code: true, name: true, departmentId: true }, orderBy: { code: 'asc' } }),
      this.database.semester.findMany({ where: { collegeId }, select: { id: true, number: true, courseId: true } }),
      this.database.section.findMany({ where: { collegeId }, select: { id: true, semesterId: true } }),
      this.database.enrollment.findMany({ where: { collegeId }, select: { studentId: true, sectionId: true, status: true, enrolledAt: true } }),
    ]);
    if (query.departmentId && !departments.some((department) => department.id === query.departmentId)) {
      throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' });
    }

    const today = todayAsStoredDate(college?.timezone);
    const to = query.to ? new Date(query.to) : today;
    const from = query.from ? new Date(query.from) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (ANALYTICS_DEFAULT_MONTHS - 1), 1));
    if (from > to) throw new BadRequestException({ code: 'INVALID_RANGE', message: 'The start date must be on or before the end date.' });
    if ((to.getTime() - from.getTime()) / DAY_MS >= ANALYTICS_MAX_DAYS) {
      throw new BadRequestException({ code: 'RANGE_TOO_LONG', message: `Analytics can cover at most ${ANALYTICS_MAX_DAYS} days.` });
    }

    const courseById = new Map(courses.map((course) => [course.id, course]));
    const semesterInfo = new Map<string, { number: number; courseId: string; departmentId: string }>();
    for (const semester of semesters) {
      const course = courseById.get(semester.courseId);
      if (course) semesterInfo.set(semester.id, { number: semester.number, courseId: course.id, departmentId: course.departmentId });
    }
    const sectionInfo = new Map<string, SectionInfo>();
    for (const section of sections) {
      const semester = semesterInfo.get(section.semesterId);
      if (semester) sectionInfo.set(section.id, { semesterNumber: semester.number, courseId: semester.courseId, departmentId: semester.departmentId });
    }
    // A student with more than one active enrollment is placed by the most recent one.
    const currentSection = new Map<string, SectionInfo>();
    const placedAt = new Map<string, number>();
    for (const enrollment of enrollments) {
      const info = sectionInfo.get(enrollment.sectionId);
      if (enrollment.status !== 'ACTIVE' || !info) continue;
      if ((placedAt.get(enrollment.studentId) ?? -Infinity) <= enrollment.enrolledAt.getTime()) {
        currentSection.set(enrollment.studentId, info);
        placedAt.set(enrollment.studentId, enrollment.enrolledAt.getTime());
      }
    }

    const scope: Scope = {
      collegeId,
      departmentId: query.departmentId,
      semester: query.semester,
      from,
      to,
      end: new Date(to.getTime() + DAY_MS),
      today,
      now: new Date(),
      months: monthsBetween(from, to),
      sectionInfo,
      semesterInfo,
      courses: courseById,
      enrollments,
      currentSection,
    };

    const students = await this.students(scope);
    const [faculty, attendance, academics, finance] = await Promise.all([
      this.faculty(scope, students.activeByDepartmentAllSemesters),
      this.attendance(scope),
      this.academics(scope, students.studentIds),
      this.finance(scope),
    ]);

    const shown = scope.departmentId ? departments.filter((department) => department.id === scope.departmentId) : departments;
    return {
      generatedAt: scope.now.toISOString(),
      range: { from: dateKey(from), to: dateKey(to) },
      filters: { departmentId: scope.departmentId ?? null, semester: scope.semester ?? null },
      options: {
        departments,
        semesters: [...new Set(semesters.map((semester) => semester.number))].sort((a, b) => a - b),
      },
      threshold: ATTENDANCE_THRESHOLD_PERCENT,
      students: students.summary,
      faculty: faculty.summary,
      attendance: attendance.summary,
      academics: academics.summary,
      finance: finance.summary,
      departments: shown.map((department) => {
        const facultyCount = faculty.byDepartment.get(department.id) ?? 0;
        const active = students.activeByDepartment.get(department.id)?.size ?? 0;
        const papers = academics.papersByDepartment.get(department.id);
        const work = academics.assignmentsByDepartment.get(department.id);
        const fees = finance.byDepartment.get(department.id);
        return {
          department,
          students: active,
          faculty: facultyCount,
          studentsPerFaculty: facultyCount ? round1((students.activeByDepartmentAllSemesters.get(department.id)?.size ?? 0) / facultyCount) : null,
          attendance: summarize(attendance.byDepartment.get(department.id) ?? emptyTally()).percentage,
          shortage: attendance.shortageByDepartment.get(department.id) ?? 0,
          assignmentCompletion: work ? percent(work.submitted, work.expected) : null,
          passPercentage: papers ? percent(papers.passed, papers.entries) : null,
          averageScore: papers && papers.entries ? round1(papers.score / papers.entries) : null,
          collected: round2(fees?.collected ?? 0),
          outstanding: round2(fees?.outstanding ?? 0),
        };
      }),
    };
  }

  /** Enrolled students: total, active and inactive, by department, course and semester, and new enrollments per month. */
  private async students(scope: Scope) {
    const inScope = scope.enrollments.filter((enrollment) => matches(scope, scope.sectionInfo.get(enrollment.sectionId)));
    const scoped = Boolean(scope.departmentId || scope.semester);
    const studentIds = new Set(inScope.map((enrollment) => enrollment.studentId));
    // Without filters, students with no enrollment at all count too (as inactive).
    const total = scoped ? studentIds.size : await this.database.student.count({ where: { collegeId: scope.collegeId } });

    const active = new Set<string>();
    const activeByDepartment = new Map<string, Set<string>>();
    const activeByCourse = new Map<string, Set<string>>();
    const activeBySemester = new Map<number, Set<string>>();
    const trend = new Map<string, number>();
    for (const enrollment of inScope) {
      const info = scope.sectionInfo.get(enrollment.sectionId);
      if (enrollment.enrolledAt >= scope.from && enrollment.enrolledAt < scope.end) bump(trend, monthKey(enrollment.enrolledAt));
      if (enrollment.status !== 'ACTIVE' || !info) continue;
      active.add(enrollment.studentId);
      addTo(activeByDepartment, info.departmentId, enrollment.studentId);
      addTo(activeByCourse, info.courseId, enrollment.studentId);
      addTo(activeBySemester, info.semesterNumber, enrollment.studentId);
    }
    // The faculty-to-student ratio compares a department's faculty with all its students, whatever the semester filter.
    const activeByDepartmentAllSemesters = new Map<string, Set<string>>();
    for (const enrollment of scope.enrollments) {
      const info = scope.sectionInfo.get(enrollment.sectionId);
      if (enrollment.status === 'ACTIVE' && info && (!scope.departmentId || info.departmentId === scope.departmentId)) {
        addTo(activeByDepartmentAllSemesters, info.departmentId, enrollment.studentId);
      }
    }

    return {
      studentIds: scoped ? studentIds : null,
      activeByDepartment,
      activeByDepartmentAllSemesters,
      summary: {
        total,
        active: active.size,
        inactive: Math.max(0, total - active.size),
        byCourse: [...activeByCourse.entries()]
          .map(([courseId, set]) => {
            const course = scope.courses.get(courseId);
            return { course: { id: courseId, code: course?.code ?? '', name: course?.name ?? '' }, departmentId: course?.departmentId ?? null, students: set.size };
          })
          .sort((a, b) => a.course.code.localeCompare(b.course.code)),
        bySemester: [...activeBySemester.entries()].map(([semester, set]) => ({ semester, students: set.size })).sort((a, b) => a.semester - b.semester),
        enrollmentTrend: scope.months.map((month) => ({ month, enrollments: trend.get(month) ?? 0 })),
      },
    };
  }

  /**
   * Faculty by department and designation, sign-in status, and active students per faculty member. Faculty don't belong
   * to a semester, so the semester filter doesn't apply here.
   */
  private async faculty(scope: Scope, activeByDepartment: Map<string, Set<string>>) {
    const rows = await this.database.faculty.findMany({
      where: { collegeId: scope.collegeId, ...(scope.departmentId ? { departmentId: scope.departmentId } : {}) },
      select: { id: true, departmentId: true, designation: true, user: { select: { status: true } } },
    });
    const byDepartment = new Map<string, number>();
    const byDesignation = new Map<string, number>();
    let active = 0;
    let withoutAccount = 0;
    for (const member of rows) {
      if (member.departmentId) bump(byDepartment, member.departmentId);
      bump(byDesignation, member.designation?.trim() || 'Not set');
      if (!member.user) withoutAccount += 1;
      else if (member.user.status === 'ACTIVE') active += 1;
    }
    const allActiveStudents = new Set<string>();
    if (scope.departmentId) for (const id of activeByDepartment.get(scope.departmentId) ?? []) allActiveStudents.add(id);
    else for (const set of activeByDepartment.values()) for (const id of set) allActiveStudents.add(id);

    return {
      byDepartment,
      summary: {
        total: rows.length,
        active,
        inactive: rows.length - active - withoutAccount,
        withoutAccount,
        studentsPerFaculty: rows.length ? round1(allActiveStudents.size / rows.length) : null,
        byDesignation: [...byDesignation.entries()].map(([designation, faculty]) => ({ designation, faculty })).sort((a, b) => b.faculty - a.faculty || a.designation.localeCompare(b.designation)),
      },
    };
  }

  /** Attendance in the range: overall, by department, semester and month, and students under the threshold. */
  private async attendance(scope: Scope) {
    const scoped = Boolean(scope.departmentId || scope.semester);
    const sessionWhere = {
      collegeId: scope.collegeId,
      heldOn: { gte: scope.from, lte: scope.to },
      ...(scoped
        ? { class: { section: { semester: { ...(scope.semester ? { number: scope.semester } : {}), ...(scope.departmentId ? { course: { departmentId: scope.departmentId } } : {}) } } } }
        : {}),
    };
    const [sessions, bySession, byStudent] = await Promise.all([
      this.database.attendance.findMany({ where: sessionWhere, select: { id: true, heldOn: true, class: { select: { sectionId: true } } } }),
      this.database.attendanceRecord.groupBy({ by: ['attendanceId', 'status'], where: { collegeId: scope.collegeId, attendance: sessionWhere }, _count: { _all: true } }),
      this.database.attendanceRecord.groupBy({ by: ['studentId', 'status'], where: { collegeId: scope.collegeId, attendance: sessionWhere }, _count: { _all: true } }),
    ]);

    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const overall = emptyTally();
    const byDepartment = new Map<string, Tally>();
    const bySemester = new Map<number, Tally>();
    const byMonth = new Map<string, Tally>();
    for (const row of bySession) {
      const session = sessionById.get(row.attendanceId);
      if (!session) continue;
      const amount = row._count._all;
      count(overall, row.status, amount);
      count(tallyFor(byMonth, monthKey(session.heldOn)), row.status, amount);
      const info = scope.sectionInfo.get(session.class.sectionId);
      if (!info) continue;
      count(tallyFor(byDepartment, info.departmentId), row.status, amount);
      count(tallyFor(bySemester, info.semesterNumber), row.status, amount);
    }

    const perStudent = new Map<string, Tally>();
    for (const row of byStudent) count(tallyFor(perStudent, row.studentId), row.status, row._count._all);
    let counted = 0;
    let short = 0;
    const shortageByDepartment = new Map<string, number>();
    for (const [studentId, tally] of perStudent) {
      const summary = summarize(tally);
      if (summary.percentage === null) continue;
      counted += 1;
      if (!summary.belowThreshold) continue;
      short += 1;
      const departmentId = scope.currentSection.get(studentId)?.departmentId;
      if (departmentId) bump(shortageByDepartment, departmentId);
    }

    return {
      byDepartment,
      shortageByDepartment,
      summary: {
        sessions: sessions.length,
        overall: summarize(overall),
        bySemester: [...bySemester.entries()].sort((a, b) => a[0] - b[0]).map(([semester, tally]) => ({ semester, ...summarize(tally) })),
        byMonth: scope.months.map((month) => ({ month, ...summarize(byMonth.get(month) ?? emptyTally()) })),
        shortage: { students: short, counted, percentage: percent(short, counted) },
      },
    };
  }

  /**
   * Assignment completion and exam performance.
   *
   * Completion covers assignments whose due date fell in the range and has passed: submissions (on time or late) from
   * the students now actively enrolled in the class's section, out of those students. Exam performance has two views: published results (a
   * student passes an exam by passing every paper), and approved marks paper by paper, which can be split by department
   * and semester and are available before results are published.
   */
  private async academics(scope: Scope, studentIds: Set<string> | null) {
    const scoped = Boolean(scope.departmentId || scope.semester);
    const semesterWhere = { ...(scope.semester ? { number: scope.semester } : {}), ...(scope.departmentId ? { course: { departmentId: scope.departmentId } } : {}) };
    const dueBefore = scope.now < scope.end ? scope.now : scope.end;

    const [assignments, exams] = await Promise.all([
      this.database.assignment.findMany({
        where: { collegeId: scope.collegeId, dueAt: { gte: scope.from, lt: dueBefore }, ...(scoped ? { class: { section: { semester: semesterWhere } } } : {}) },
        select: { id: true, class: { select: { sectionId: true } } },
      }),
      this.database.exam.findMany({
        where: { collegeId: scope.collegeId, startsOn: { gte: scope.from, lte: scope.to }, status: { not: 'CANCELLED' } },
        select: { id: true, name: true, startsOn: true, status: true },
        orderBy: { startsOn: 'desc' },
      }),
    ]);
    const examIds = exams.map((exam) => exam.id);
    const [submissions, papers, results] = await Promise.all([
      assignments.length
        ? this.database.submission.findMany({
            where: { collegeId: scope.collegeId, assignmentId: { in: assignments.map((assignment) => assignment.id) }, status: { in: SUBMITTED } },
            select: { assignmentId: true, studentId: true, status: true },
          })
        : Promise.resolve([]),
      examIds.length
        ? this.database.examSubject.findMany({
            where: { collegeId: scope.collegeId, examId: { in: examIds }, ...(scoped ? { semester: semesterWhere } : {}) },
            select: { id: true, examId: true, semesterId: true, maxMarks: true, passMarks: true, marksStatus: true },
          })
        : Promise.resolve([]),
      examIds.length
        ? this.database.result.findMany({ where: { collegeId: scope.collegeId, examId: { in: examIds }, publishedAt: { not: null } }, select: { examId: true, studentId: true, status: true, percentage: true } })
        : Promise.resolve([]),
    ]);
    const approved = papers.filter((paper) => paper.marksStatus === 'APPROVED');
    const marks = approved.length
      ? await this.database.mark.findMany({ where: { collegeId: scope.collegeId, examSubjectId: { in: approved.map((paper) => paper.id) } }, select: { examSubjectId: true, marksObtained: true, isAbsent: true } })
      : [];

    // Assignments: the students expected are each class section's active enrollment, and only their submissions count,
    // so a submission from a student who has since left never stands in for a current student who hasn't submitted.
    const activeBySection = new Map<string, Set<string>>();
    for (const enrollment of scope.enrollments) if (enrollment.status === 'ACTIVE') addTo(activeBySection, enrollment.sectionId, enrollment.studentId);
    const sectionOf = new Map(assignments.map((assignment) => [assignment.id, assignment.class.sectionId]));
    const perAssignment = new Map<string, { submitted: number; late: number; graded: number }>();
    for (const submission of submissions) {
      const sectionId = sectionOf.get(submission.assignmentId);
      if (!sectionId || !activeBySection.get(sectionId)?.has(submission.studentId)) continue;
      const entry = perAssignment.get(submission.assignmentId) ?? { submitted: 0, late: 0, graded: 0 };
      entry.submitted += 1;
      if (submission.status === 'LATE') entry.late += 1;
      if (GRADED.has(submission.status)) entry.graded += 1;
      perAssignment.set(submission.assignmentId, entry);
    }
    const work = { due: assignments.length, expected: 0, submitted: 0, late: 0, graded: 0 };
    const assignmentsByDepartment = new Map<string, { expected: number; submitted: number }>();
    for (const assignment of assignments) {
      const expected = activeBySection.get(assignment.class.sectionId)?.size ?? 0;
      const { submitted, late, graded } = perAssignment.get(assignment.id) ?? { submitted: 0, late: 0, graded: 0 };
      work.expected += expected;
      work.submitted += submitted;
      work.late += late;
      work.graded += graded;
      const departmentId = scope.sectionInfo.get(assignment.class.sectionId)?.departmentId;
      if (departmentId) {
        const department = assignmentsByDepartment.get(departmentId) ?? { expected: 0, submitted: 0 };
        department.expected += expected;
        department.submitted += submitted;
        assignmentsByDepartment.set(departmentId, department);
      }
    }

    // Approved marks, paper by paper. Absent, or no marks entered, counts as not passed with a score of 0.
    const paperById = new Map(approved.map((paper) => [paper.id, paper]));
    type PaperTotals = { entries: number; passed: number; score: number };
    const empty = (): PaperTotals => ({ entries: 0, passed: 0, score: 0 });
    const papersOverall = empty();
    const papersByExam = new Map<string, PaperTotals>();
    const papersByDepartment = new Map<string, PaperTotals>();
    for (const mark of marks) {
      const paper = paperById.get(mark.examSubjectId);
      if (!paper) continue;
      const max = money(paper.maxMarks);
      const obtained = mark.isAbsent || mark.marksObtained === null ? null : money(mark.marksObtained);
      const passed = obtained !== null && obtained >= money(paper.passMarks);
      const score = obtained !== null && max > 0 ? (obtained / max) * 100 : 0;
      const departmentId = scope.semesterInfo.get(paper.semesterId)?.departmentId;
      const exam = papersByExam.get(paper.examId) ?? empty();
      papersByExam.set(paper.examId, exam);
      const targets = [papersOverall, exam];
      if (departmentId) {
        const department = papersByDepartment.get(departmentId) ?? empty();
        papersByDepartment.set(departmentId, department);
        targets.push(department);
      }
      for (const totals of targets) {
        totals.entries += 1;
        totals.score += score;
        if (passed) totals.passed += 1;
      }
    }

    // Published results, limited to students in the filter's departments and semesters.
    type ResultTotals = { published: number; passed: number; failed: number; percentage: number };
    const resultTotals = (): ResultTotals => ({ published: 0, passed: 0, failed: 0, percentage: 0 });
    const resultsOverall = resultTotals();
    const resultsByExam = new Map<string, ResultTotals>();
    for (const result of results) {
      if (studentIds && !studentIds.has(result.studentId)) continue;
      const exam = resultsByExam.get(result.examId) ?? resultTotals();
      resultsByExam.set(result.examId, exam);
      for (const totals of [resultsOverall, exam]) {
        totals.published += 1;
        if (result.status === 'PASSED') totals.passed += 1;
        if (result.status === 'FAILED') totals.failed += 1;
        totals.percentage += money(result.percentage);
      }
    }
    const describeResults = (totals: ResultTotals) => ({
      published: totals.published,
      passed: totals.passed,
      failed: totals.failed,
      passPercentage: percent(totals.passed, totals.published),
      averagePercentage: totals.published ? round1(totals.percentage / totals.published) : null,
    });
    const describePapers = (totals: PaperTotals) => ({
      entries: totals.entries,
      passed: totals.passed,
      passPercentage: percent(totals.passed, totals.entries),
      averageScore: totals.entries ? round1(totals.score / totals.entries) : null,
    });

    const papersPerExam = new Map<string, { total: number; approved: number }>();
    for (const paper of papers) {
      const entry = papersPerExam.get(paper.examId) ?? { total: 0, approved: 0 };
      entry.total += 1;
      if (paper.marksStatus === 'APPROVED') entry.approved += 1;
      papersPerExam.set(paper.examId, entry);
    }

    return {
      assignmentsByDepartment,
      papersByDepartment,
      summary: {
        assignments: { ...work, completion: percent(work.submitted, work.expected) },
        results: describeResults(resultsOverall),
        papers: { approved: approved.length, total: papers.length, ...describePapers(papersOverall) },
        // With a filter, only exams with a paper in its departments and semesters are listed.
        exams: exams
          .filter((exam) => !scoped || papersPerExam.has(exam.id))
          .map((exam) => ({
            id: exam.id,
            name: exam.name,
            startsOn: dateKey(exam.startsOn),
            status: exam.status,
            papers: papersPerExam.get(exam.id)?.total ?? 0,
            approvedPapers: papersPerExam.get(exam.id)?.approved ?? 0,
            marks: describePapers(papersByExam.get(exam.id) ?? empty()),
            results: describeResults(resultsByExam.get(exam.id) ?? resultTotals()),
          })),
      },
    };
  }

  /**
   * Fees. An invoice belongs to its fee structure's course and semester; when the structure doesn't say, to the student's
   * current enrollment. Outstanding amounts and invoice status are as of today; collections use the payment date.
   */
  private async finance(scope: Scope) {
    const invoices = await this.database.invoice.findMany({
      where: { collegeId: scope.collegeId, status: { not: 'DRAFT' } },
      select: {
        studentId: true,
        amountDue: true,
        dueOn: true,
        status: true,
        feeStructure: { select: { courseId: true, semesterId: true } },
        payments: { select: { amount: true, status: true, paidAt: true, createdAt: true } },
      },
    });

    const byDepartment = new Map<string, { billed: number; collected: number; outstanding: number }>();
    const byCourse = new Map<string, { billed: number; collected: number; outstanding: number }>();
    const invoiceStatus = new Map<string, { invoices: number; amount: number }>();
    const paymentStatus = new Map<string, { payments: number; amount: number }>();
    const trend = new Map<string, { amount: number; payments: number }>();
    let billed = 0;
    let paid = 0;
    let outstanding = 0;
    let collected = 0;
    const overdue = { invoices: 0, amount: 0 };

    for (const invoice of invoices) {
      const semester = invoice.feeStructure?.semesterId ? scope.semesterInfo.get(invoice.feeStructure.semesterId) : undefined;
      const current = scope.currentSection.get(invoice.studentId);
      const courseId = invoice.feeStructure?.courseId ?? semester?.courseId ?? current?.courseId;
      const departmentId = courseId ? scope.courses.get(courseId)?.departmentId : undefined;
      const semesterNumber = semester?.number ?? current?.semesterNumber;
      if (!matches(scope, { departmentId, semesterNumber })) continue;

      const amountDue = money(invoice.amountDue);
      const completed = invoice.payments.filter((payment) => payment.status === 'COMPLETED').reduce((sum, payment) => sum + money(payment.amount), 0);
      const isOpen = OPEN_INVOICE_STATUSES.has(invoice.status);
      const balance = isOpen ? Math.max(0, amountDue - completed) : 0;
      const isOverdue = isOpen && balance > 0 && invoice.dueOn !== null && invoice.dueOn < scope.today;
      // The stored status can lag (nothing marks invoices overdue yet), so the shown status is worked out from the balance.
      const status = invoice.status === 'VOID' ? 'VOID' : !isOpen || balance === 0 ? 'PAID' : isOverdue ? 'OVERDUE' : completed > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
      const statusEntry = invoiceStatus.get(status) ?? { invoices: 0, amount: 0 };
      statusEntry.invoices += 1;
      statusEntry.amount += status === 'PAID' || status === 'VOID' ? amountDue : balance;
      invoiceStatus.set(status, statusEntry);

      let collectedHere = 0;
      for (const payment of invoice.payments) {
        const at = payment.paidAt ?? payment.createdAt;
        if (at < scope.from || at >= scope.end) continue;
        const entry = paymentStatus.get(payment.status) ?? { payments: 0, amount: 0 };
        entry.payments += 1;
        entry.amount += money(payment.amount);
        paymentStatus.set(payment.status, entry);
        if (payment.status !== 'COMPLETED') continue;
        collectedHere += money(payment.amount);
        const month = trend.get(monthKey(at)) ?? { amount: 0, payments: 0 };
        month.amount += money(payment.amount);
        month.payments += 1;
        trend.set(monthKey(at), month);
      }
      collected += collectedHere;
      if (invoice.status === 'VOID') continue;
      billed += amountDue;
      paid += isOpen ? Math.min(amountDue, completed) : amountDue;
      outstanding += balance;
      if (isOverdue) {
        overdue.invoices += 1;
        overdue.amount += balance;
      }
      for (const [map, key] of [
        [byDepartment, departmentId],
        [byCourse, courseId],
      ] as const) {
        if (!key) continue;
        const entry = map.get(key) ?? { billed: 0, collected: 0, outstanding: 0 };
        entry.billed += amountDue;
        entry.collected += collectedHere;
        entry.outstanding += balance;
        map.set(key, entry);
      }
    }

    const rounded = <T extends Record<string, number>>(values: T): T => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round2(value)])) as T;
    return {
      byDepartment,
      summary: {
        billed: round2(billed),
        paid: round2(paid),
        outstanding: round2(outstanding),
        collectionRate: percent(paid, billed),
        overdue: { invoices: overdue.invoices, amount: round2(overdue.amount) },
        collected: round2(collected),
        trend: scope.months.map((month) => ({ month, ...rounded(trend.get(month) ?? { amount: 0, payments: 0 }) })),
        invoiceStatus: ['PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERDUE', 'VOID']
          .filter((status) => invoiceStatus.has(status))
          .map((status) => ({ status, ...rounded(invoiceStatus.get(status) as { invoices: number; amount: number }) })),
        paymentStatus: ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED']
          .filter((status) => paymentStatus.has(status))
          .map((status) => ({ status, ...rounded(paymentStatus.get(status) as { payments: number; amount: number }) })),
        byCourse: [...byCourse.entries()]
          .map(([courseId, totals]) => {
            const course = scope.courses.get(courseId);
            return { course: { id: courseId, code: course?.code ?? '', name: course?.name ?? '' }, departmentId: course?.departmentId ?? null, ...rounded(totals) };
          })
          .sort((a, b) => a.course.code.localeCompare(b.course.code)),
      },
    };
  }
}
