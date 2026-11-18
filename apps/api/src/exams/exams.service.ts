import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { ExamStatus, ResultStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  CreateExamDto,
  CreateExamSubjectDto,
  ExamListQuery,
  ReviewMarksDto,
  UpdateExamDto,
  UpdateMarksDto,
} from './exams.dto';

/** Students in exam and fee responses carry only identity fields, never contact details. */
const STUDENT_SUMMARY = { select: { id: true, studentCode: true, firstName: true, lastName: true } };

/**
 * Staff, including a platform SUPER_ADMIN, see every exam; everyone else (students) only exams that are scheduled or
 * done, never drafts or cancelled ones.
 */
const STAFF_ROLES: AuthorizationContext['roles'] = ['SUPER_ADMIN', 'ADMIN', 'HOD', 'FACULTY'];
const isStaff = (context: AuthorizationContext): boolean => STAFF_ROLES.some((role) => context.roles.includes(role));
const VISIBLE_TO_STUDENTS: ExamStatus[] = [ExamStatus.SCHEDULED, ExamStatus.COMPLETED];

const isAdmin = (context: AuthorizationContext): boolean => context.roles.includes('ADMIN') || context.roles.includes('SUPER_ADMIN');
const isUniqueViolation = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const examMissing = (): never => {
  throw new NotFoundException({ code: 'EXAM_NOT_FOUND', message: 'Exam was not found.' });
};
const examSubjectMissing = (): never => {
  throw new NotFoundException({ code: 'EXAM_SUBJECT_NOT_FOUND', message: 'Exam subject schedule was not found.' });
};

@Injectable()
export class ExamsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  /** Exam, subject and department of a paper, for notifications. */
  private async paperInfo(examSubjectId: string, collegeId: string) {
    return this.database.examSubject.findFirst({
      where: { id: examSubjectId, collegeId },
      select: { id: true, examId: true, exam: { select: { name: true } }, subject: { select: { name: true } }, semester: { select: { course: { select: { departmentId: true } } } } },
    });
  }

  private async getStudentId(context: AuthorizationContext): Promise<string> {
    const student = await this.database.student.findFirst({
      where: { collegeId: context.collegeId, userId: context.userId },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student profile was not found.' });
    }
    return student.id;
  }

  /** An exam spans the whole college, so only an Admin creates, edits or deletes one; HODs add their department's papers. */
  async createExam(input: CreateExamDto, context: AuthorizationContext) {
    if (!isAdmin(context)) denied();

    try {
      return await this.database.exam.create({
        data: {
          collegeId: context.collegeId,
          name: input.name,
          status: input.status ?? ExamStatus.DRAFT,
          startsOn: new Date(input.startsOn),
          endsOn: new Date(input.endsOn),
        },
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException({ code: 'EXAM_ALREADY_EXISTS', message: 'An exam with this name already exists in the college.' });
      }
      throw e;
    }
  }

  async listExams(query: ExamListQuery, context: AuthorizationContext) {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    if (!isStaff(context)) {
      where.status = { in: VISIBLE_TO_STUDENTS };
    }

    const [items, total] = await Promise.all([
      this.database.exam.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { startsOn: 'desc' },
        include: {
          _count: { select: { examSubjects: true, results: true } },
        },
      }),
      this.database.exam.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getExam(id: string, context: AuthorizationContext) {
    const exam = await this.database.exam.findFirst({
      where: { id, collegeId: context.collegeId },
      include: {
        examSubjects: {
          include: {
            subject: true,
            semester: true,
            section: true,
          },
        },
      },
    });

    // A draft or cancelled exam reads as missing to students, as in the list, so its existence isn't revealed.
    if (!exam || (!isStaff(context) && !VISIBLE_TO_STUDENTS.includes(exam.status))) throw examMissing();

    if (context.roles.includes('STUDENT') && !isStaff(context)) {
      const studentId = await this.getStudentId(context);
      // Marks reach the student only with their published result: before that they are still being entered and reviewed.
      const result = await this.database.result.findFirst({
        where: { collegeId: context.collegeId, examId: id, studentId, publishedAt: { not: null } },
      });
      const marks = result
        ? await this.database.mark.findMany({
            where: {
              collegeId: context.collegeId,
              studentId,
              examSubject: { examId: id },
            },
            include: {
              examSubject: {
                include: { subject: true },
              },
            },
          })
        : [];

      return {
        ...exam,
        studentResult: result,
        studentMarks: marks,
      };
    }

    return exam;
  }

  async updateExam(id: string, input: UpdateExamDto, context: AuthorizationContext) {
    if (!isAdmin(context)) denied();

    const existing = await this.database.exam.findFirst({
      where: { id, collegeId: context.collegeId },
    });
    if (!existing) examMissing();

    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.status) data.status = input.status;
    if (input.startsOn) data.startsOn = new Date(input.startsOn);
    if (input.endsOn) data.endsOn = new Date(input.endsOn);

    try {
      return await this.database.exam.update({
        where: { id },
        data,
      });
    } catch (e) {
      // Exam names are unique in the college: a rename onto another exam's name is a conflict, not a 500.
      if (isUniqueViolation(e)) throw new ConflictException({ code: 'EXAM_ALREADY_EXISTS', message: 'An exam with this name already exists in the college.' });
      throw e;
    }
  }

  /**
   * Deleting an exam removes its papers, marks and results with it, so it is refused once any marks are under review
   * or approved, or results exist: cancel the exam instead. Every delete is audited.
   */
  async deleteExam(id: string, context: AuthorizationContext) {
    if (!isAdmin(context)) denied();

    const existing = await this.database.exam.findFirst({
      where: { id, collegeId: context.collegeId },
    });
    if (!existing) examMissing();

    await this.database.$transaction(async (tx) => {
      const [reviewedPapers, results] = await Promise.all([
        tx.examSubject.count({ where: { collegeId: context.collegeId, examId: id, marksStatus: { not: 'DRAFT' } } }),
        tx.result.count({ where: { collegeId: context.collegeId, examId: id } }),
      ]);
      if (reviewedPapers > 0 || results > 0) {
        throw new ConflictException({ code: 'EXAM_HAS_MARKS', message: 'This exam has marks under review, approved marks or results. Cancel it instead of deleting it.' });
      }
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: 'EXAM_DELETED', entityType: 'Exam', entityId: id, metadata: { name: existing!.name, status: existing!.status } },
      });
      await tx.exam.delete({ where: { id } });
    });
    return { success: true };
  }

  /**
   * Papers are added and removed by an Admin, or by the HOD of the paper's department; faculty enter marks. Once an
   * exam's results are published its papers are fixed.
   */
  private async assertManagesPaper(paper: { semesterId: string; sectionId: string | null }, context: AuthorizationContext): Promise<void> {
    if (isAdmin(context)) return;
    if (!context.roles.includes('HOD') || !context.departmentId) denied();
    await this.assertHodDepartment(paper, context);
  }

  /** The paper's semester and, for a section paper, its section are both in the HOD's department. */
  private async assertHodDepartment(paper: { semesterId: string; sectionId: string | null }, context: AuthorizationContext): Promise<void> {
    const departmentId = context.departmentId ?? '';
    const [semesterInDepartment, sectionInDepartment] = await Promise.all([
      this.database.semester.findFirst({ where: { id: paper.semesterId, collegeId: context.collegeId, course: { departmentId } }, select: { id: true } }),
      paper.sectionId
        ? this.database.section.findFirst({ where: { id: paper.sectionId, collegeId: context.collegeId, semester: { course: { departmentId } } }, select: { id: true } })
        : Promise.resolve({ id: null }),
    ]);
    if (!semesterInDepartment || !sectionInDepartment) denied();
  }

  private async assertNoResults(examId: string, context: AuthorizationContext): Promise<void> {
    const results = await this.database.result.count({ where: { collegeId: context.collegeId, examId } });
    if (results > 0) throw new ConflictException({ code: 'RESULTS_PUBLISHED', message: 'Results for this exam are already published, so its papers are fixed.' });
  }

  async addExamSubject(examId: string, input: CreateExamSubjectDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const exam = await this.database.exam.findFirst({
      where: { id: examId, collegeId: context.collegeId },
    });
    if (!exam) throw examMissing();
    await this.assertManagesPaper({ semesterId: input.semesterId, sectionId: input.sectionId ?? null }, context);
    await this.assertNoResults(examId, context);

    // The subject and the optional section must both belong to the paper's semester; otherwise a paper could pair one
    // department's semester with another department's section and slip past department checks.
    const [subject, section] = await Promise.all([
      this.database.subject.findFirst({ where: { id: input.subjectId, collegeId: context.collegeId, semesterId: input.semesterId }, select: { id: true } }),
      input.sectionId ? this.database.section.findFirst({ where: { id: input.sectionId, collegeId: context.collegeId, semesterId: input.semesterId }, select: { id: true } }) : Promise.resolve({ id: null }),
    ]);
    if (!subject || !section) {
      throw new BadRequestException({ code: 'INVALID_EXAM_SUBJECT', message: 'The subject and section must belong to the selected semester.' });
    }

    try {
      return await this.database.examSubject.create({
        data: {
          collegeId: context.collegeId,
          examId,
          subjectId: input.subjectId,
          semesterId: input.semesterId,
          sectionId: input.sectionId ?? null,
          examAt: new Date(input.examAt),
          maxMarks: input.maxMarks,
          passMarks: input.passMarks,
        },
        include: {
          subject: true,
          semester: true,
          section: true,
        },
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException({ code: 'EXAM_SUBJECT_EXISTS', message: 'Subject is already scheduled for this exam section.' });
      }
      throw e;
    }
  }

  /** Removing a paper deletes its marks, so only a paper whose marks are still a draft can go, and it is audited. */
  async removeExamSubject(examId: string, examSubjectId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const item = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, examId, collegeId: context.collegeId },
    });
    if (!item) examSubjectMissing();
    await this.assertManagesPaper(item!, context);
    await this.assertNoResults(examId, context);

    await this.database.$transaction(async (tx) => {
      // Only while its marks are still a draft, checked in the delete itself so a submission at the same moment wins.
      const marks = await tx.mark.count({ where: { collegeId: context.collegeId, examSubjectId } });
      const removed = await tx.examSubject.deleteMany({ where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'DRAFT' } });
      if (removed.count !== 1) {
        throw new ConflictException({ code: 'MARKS_IN_REVIEW', message: 'Marks for this paper are under review or approved, so it cannot be removed.' });
      }
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: 'EXAM_PAPER_REMOVED', entityType: 'Exam', entityId: examId, metadata: { examSubjectId, subjectId: item!.subjectId, marks } },
      });
    });
    return { success: true };
  }

  /**
   * Admins reach every paper. HODs stay inside their department. Faculty only reach papers for a subject they
   * teach in that section (or in that semester, when the paper covers every section).
   */
  private async assertCanEnterMarks(examSubject: { subjectId: string; sectionId: string | null; semesterId: string }, context: AuthorizationContext): Promise<void> {
    if (context.roles.includes('ADMIN') || context.roles.includes('SUPER_ADMIN')) return;
    if (context.roles.includes('HOD')) {
      if (!context.departmentId) denied();
      await this.assertHodDepartment(examSubject, context);
      return;
    }
    const teaches = await this.database.class.findFirst({
      where: {
        collegeId: context.collegeId,
        subjectId: examSubject.subjectId,
        faculty: { userId: context.userId },
        ...(examSubject.sectionId ? { sectionId: examSubject.sectionId } : { section: { semesterId: examSubject.semesterId } }),
      },
      select: { id: true },
    });
    if (!teaches) denied();
  }

  async getSubjectMarks(examSubjectId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const examSubject = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, collegeId: context.collegeId },
      include: {
        subject: true,
        section: true,
        semester: true,
      },
    });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);

    // Fetch all active enrolled students in this section/semester
    const enrollmentWhere: Record<string, unknown> = {
      collegeId: context.collegeId,
      status: 'ACTIVE',
    };
    if (examSubject.sectionId) {
      enrollmentWhere.sectionId = examSubject.sectionId;
    } else {
      enrollmentWhere.section = { semesterId: examSubject.semesterId };
    }

    const [enrollments, existingMarks] = await Promise.all([
      this.database.enrollment.findMany({
        where: enrollmentWhere,
        include: { student: STUDENT_SUMMARY },
        orderBy: { student: { lastName: 'asc' } },
      }),
      this.database.mark.findMany({
        where: { collegeId: context.collegeId, examSubjectId },
      }),
    ]);

    const markMap = new Map(existingMarks.map((m) => [m.studentId, m]));

    const items = enrollments.map((e) => {
      const mark = markMap.get(e.studentId);
      return {
        student: e.student,
        mark: mark ?? null,
      };
    });

    const history = await this.marksHistory(examSubjectId, context);
    return { examSubject, items, history };
  }

  /**
   * Papers whose marks are waiting for review: every submitted paper for an Admin, only the HOD's department for an
   * HOD (both the paper's semester and, for section papers, its section must be in the department). Oldest first.
   */
  async listMarksReviewQueue(context: AuthorizationContext) {
    const isAdmin = context.roles.includes('ADMIN') || context.roles.includes('SUPER_ADMIN');
    if (!isAdmin && !context.roles.includes('HOD')) denied();
    if (!isAdmin && !context.departmentId) denied();
    const inDepartment = { course: { departmentId: context.departmentId ?? '' } };
    return this.database.examSubject.findMany({
      where: {
        collegeId: context.collegeId,
        marksStatus: 'SUBMITTED',
        ...(isAdmin ? {} : { semester: inDepartment, OR: [{ sectionId: null }, { section: { semester: inDepartment } }] }),
      },
      select: {
        id: true,
        marksSubmittedAt: true,
        exam: { select: { id: true, name: true } },
        subject: { select: { id: true, code: true, name: true } },
        semester: { select: { id: true, name: true } },
        section: { select: { id: true, code: true } },
      },
      orderBy: { marksSubmittedAt: 'asc' },
    });
  }

  /** Submissions, approvals and returns for one paper, oldest first. */
  private async marksHistory(examSubjectId: string, context: AuthorizationContext) {
    const entries = await this.database.auditLog.findMany({
      where: { collegeId: context.collegeId, entityType: 'ExamSubject', entityId: examSubjectId },
      include: { actor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      actor: entry.actor,
      comment: ((entry.metadata ?? {}) as { comment?: string }).comment ?? null,
    }));
  }

  /**
   * The person entering marks submits a complete sheet for review. Only drafts can be submitted, and the update is
   * conditional so two clicks can't both succeed.
   */
  async submitSubjectMarks(examSubjectId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();
    const examSubject = await this.database.examSubject.findFirst({ where: { id: examSubjectId, collegeId: context.collegeId } });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);
    if (examSubject!.marksStatus !== 'DRAFT') {
      throw new ConflictException({ code: 'MARKS_NOT_DRAFT', message: 'These marks have already been submitted.' });
    }
    const [sitting, entered] = await Promise.all([
      this.database.enrollment.findMany({
        where: {
          collegeId: context.collegeId,
          status: 'ACTIVE',
          ...(examSubject!.sectionId ? { sectionId: examSubject!.sectionId } : { section: { semesterId: examSubject!.semesterId } }),
        },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      this.database.mark.findMany({
        where: { collegeId: context.collegeId, examSubjectId, OR: [{ isAbsent: true }, { marksObtained: { not: null } }] },
        select: { studentId: true },
      }),
    ]);
    const done = new Set(entered.map((mark) => mark.studentId));
    const missing = sitting.filter((row) => !done.has(row.studentId)).length;
    if (missing > 0) {
      throw new BadRequestException({ code: 'MARKS_INCOMPLETE', message: `Enter marks or mark absent for every student before submitting (${missing} still missing).` });
    }
    await this.database.$transaction(async (tx) => {
      const moved = await tx.examSubject.updateMany({
        where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'DRAFT' },
        data: { marksStatus: 'SUBMITTED', marksSubmittedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException({ code: 'MARKS_NOT_DRAFT', message: 'These marks have already been submitted.' });
      await tx.auditLog.create({ data: { collegeId: context.collegeId, actorId: context.userId, action: 'MARKS_SUBMITTED', entityType: 'ExamSubject', entityId: examSubjectId } });
    });
    // Reviewers: the HOD of the paper's department, or every Admin when the department has no HOD.
    await this.notifications?.safely(async (notifications) => {
      const paper = await this.paperInfo(examSubjectId, context.collegeId);
      if (!paper) return;
      const hods = await notifications.hodsOf(context.collegeId, paper.semester.course.departmentId);
      const reviewers = hods.length ? hods : await notifications.usersWithRoles(context.collegeId, ['ADMIN']);
      await notifications.notify(context.collegeId, reviewers.filter((id) => id !== context.userId), {
        category: 'EXAM',
        title: `Marks submitted for review: ${paper.subject.name}`,
        body: `${paper.exam.name} · approve them or return them for changes.`,
        link: `/dashboard/exams/${paper.examId}/subjects/${paper.id}/marks`,
      });
    });
    return this.getSubjectMarks(examSubjectId, context);
  }

  /**
   * HOD decision 4 (the spec's results workflow): the HOD of the paper's department, or an Admin, approves submitted
   * marks or returns them to draft with an optional comment.
   */
  async reviewSubjectMarks(examSubjectId: string, input: ReviewMarksDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN') && !context.roles.includes('HOD')) denied();
    const examSubject = await this.database.examSubject.findFirst({ where: { id: examSubjectId, collegeId: context.collegeId } });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);
    const approved = input.decision === 'APPROVED';
    await this.database.$transaction(async (tx) => {
      const moved = await tx.examSubject.updateMany({
        where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'SUBMITTED' },
        data: approved ? { marksStatus: 'APPROVED', marksApprovedAt: new Date() } : { marksStatus: 'DRAFT', marksSubmittedAt: null },
      });
      if (moved.count !== 1) throw new ConflictException({ code: 'MARKS_NOT_SUBMITTED', message: 'Only submitted marks can be reviewed.' });
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: approved ? 'MARKS_APPROVED' : 'MARKS_RETURNED', entityType: 'ExamSubject', entityId: examSubjectId, metadata: input.comment ? { comment: input.comment } : undefined },
      });
    });
    // The person who submitted the marks hears the outcome.
    await this.notifications?.safely(async (notifications) => {
      const [submission, paper] = await Promise.all([
        this.database.auditLog.findFirst({ where: { collegeId: context.collegeId, entityType: 'ExamSubject', entityId: examSubjectId, action: 'MARKS_SUBMITTED' }, orderBy: { createdAt: 'desc' }, select: { actorId: true } }),
        this.paperInfo(examSubjectId, context.collegeId),
      ]);
      if (!paper) return;
      await notifications.notify(context.collegeId, [submission?.actorId].filter((id) => id && id !== context.userId), {
        category: 'EXAM',
        title: approved ? `Marks approved: ${paper.subject.name}` : `Marks returned for changes: ${paper.subject.name}`,
        body: input.comment ? `${paper.exam.name} · ${input.comment}` : paper.exam.name,
        link: `/dashboard/exams/${paper.examId}/subjects/${paper.id}/marks`,
      });
    });
    return this.getSubjectMarks(examSubjectId, context);
  }

  async updateSubjectMarks(examSubjectId: string, input: UpdateMarksDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const examSubject = await this.database.examSubject.findFirst({
      where: { id: examSubjectId, collegeId: context.collegeId },
    });
    if (!examSubject) throw examSubjectMissing();
    await this.assertCanEnterMarks(examSubject, context);
    if (examSubject!.marksStatus !== 'DRAFT') {
      throw new ConflictException({ code: 'MARKS_LOCKED', message: 'These marks have been submitted for review and can no longer be edited. Ask your HOD to return them if a change is needed.' });
    }

    const maxMarks = Number(examSubject.maxMarks);

    // Validate marks obtained <= maxMarks
    for (const m of input.marks) {
      if (m.marksObtained !== undefined && m.marksObtained !== null && m.marksObtained > maxMarks) {
        throw new BadRequestException({
          code: 'INVALID_MARKS',
          message: `Marks obtained (${m.marksObtained}) cannot exceed maximum marks (${maxMarks}).`,
        });
      }
    }

    // Marks can only be recorded once per student, and only for students sitting this paper.
    const studentIds = [...new Set(input.marks.map((m) => m.studentId))];
    if (studentIds.length !== input.marks.length) {
      throw new BadRequestException({ code: 'DUPLICATE_STUDENT', message: 'Each student can appear only once in a marks update.' });
    }
    const eligible = await this.database.enrollment.findMany({
      where: {
        collegeId: context.collegeId,
        status: 'ACTIVE',
        studentId: { in: studentIds },
        ...(examSubject.sectionId ? { sectionId: examSubject.sectionId } : { section: { semesterId: examSubject.semesterId } }),
      },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    if (eligible.length !== studentIds.length) {
      throw new BadRequestException({ code: 'STUDENT_NOT_IN_EXAM', message: 'Marks can only be entered for students enrolled for this paper.' });
    }

    await this.database.$transaction(async (tx) => {
      // Re-check DRAFT inside the write: this conditional update locks the paper row, so a submit or approval running
      // at the same time either waits for these marks or makes this save fail, instead of marks changing after approval.
      const stillDraft = await tx.examSubject.updateMany({ where: { id: examSubjectId, collegeId: context.collegeId, marksStatus: 'DRAFT' }, data: { marksStatus: 'DRAFT' } });
      if (stillDraft.count !== 1) {
        throw new ConflictException({ code: 'MARKS_LOCKED', message: 'These marks have been submitted for review and can no longer be edited. Ask your HOD to return them if a change is needed.' });
      }
      for (const m of input.marks) {
        await tx.mark.upsert({
          where: {
            collegeId_examSubjectId_studentId: {
              collegeId: context.collegeId,
              examSubjectId,
              studentId: m.studentId,
            },
          },
          update: {
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent ?? false,
          },
          create: {
            collegeId: context.collegeId,
            examSubjectId,
            studentId: m.studentId,
            marksObtained: m.marksObtained,
            isAbsent: m.isAbsent ?? false,
          },
        });
      }
    });

    return { success: true, count: input.marks.length };
  }

  async calculateAndPublishResults(examId: string, context: AuthorizationContext) {
    // HOD decision 4: faculty enter marks, the HOD approves them, and Admin publishes results.
    if (!context.roles.includes('ADMIN')) denied();

    const exam = await this.database.exam.findFirst({
      where: { id: examId, collegeId: context.collegeId },
      include: {
        examSubjects: {
          include: {
            marks: true,
          },
        },
      },
    });
    if (!exam) throw examMissing();

    if (exam.examSubjects.length === 0) {
      throw new BadRequestException({ code: 'NO_EXAM_SUBJECTS', message: 'Exam has no scheduled subjects.' });
    }
    const notApproved = exam.examSubjects.filter((paper) => paper.marksStatus !== 'APPROVED').length;
    if (notApproved > 0) {
      throw new ConflictException({ code: 'MARKS_NOT_APPROVED', message: `Results can be published once every paper's marks are approved (${notApproved} not approved yet).` });
    }

    // Group marks by studentId
    const studentMarksMap = new Map<
      string,
      Array<{ maxMarks: number; passMarks: number; marksObtained: number | null; isAbsent: boolean }>
    >();

    for (const sub of exam.examSubjects) {
      const maxMarks = Number(sub.maxMarks);
      const passMarks = Number(sub.passMarks);
      for (const m of sub.marks) {
        const list = studentMarksMap.get(m.studentId) ?? [];
        list.push({
          maxMarks,
          passMarks,
          marksObtained: m.marksObtained !== null ? Number(m.marksObtained) : null,
          isAbsent: m.isAbsent,
        });
        studentMarksMap.set(m.studentId, list);
      }
    }

    const now = new Date();

    await this.database.$transaction(async (tx) => {
      for (const [studentId, marksList] of studentMarksMap.entries()) {
        let totalMax = 0;
        let totalObtained = 0;
        let isFailed = false;

        for (const item of marksList) {
          totalMax += item.maxMarks;
          if (item.isAbsent || item.marksObtained === null || item.marksObtained < item.passMarks) {
            isFailed = true;
          }
          if (item.marksObtained !== null && !item.isAbsent) {
            totalObtained += item.marksObtained;
          }
        }

        const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
        const status = isFailed ? ResultStatus.FAILED : ResultStatus.PASSED;

        await tx.result.upsert({
          where: {
            collegeId_examId_studentId: {
              collegeId: context.collegeId,
              examId,
              studentId,
            },
          },
          update: {
            totalMarks: totalObtained,
            percentage,
            status,
            publishedAt: now,
          },
          create: {
            collegeId: context.collegeId,
            examId,
            studentId,
            totalMarks: totalObtained,
            percentage,
            status,
            publishedAt: now,
          },
        });
      }

      // Update exam status to COMPLETED
      await tx.exam.update({
        where: { id: examId },
        data: { status: ExamStatus.COMPLETED },
      });
    });

    await this.notifications?.safely(async (notifications) => {
      const students = await notifications.studentUsers(context.collegeId, [...studentMarksMap.keys()]);
      await notifications.notify(context.collegeId, students, { category: 'EXAM', title: `Results published: ${exam.name}`, body: 'Your result is now available.', link: '/dashboard/exams/me' });
    });
    return { success: true, processedStudents: studentMarksMap.size };
  }

  async listExamResults(examId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const exam = await this.database.exam.findFirst({
      where: { id: examId, collegeId: context.collegeId },
    });
    if (!exam) throw examMissing();

    // Admins see every result. An HOD sees their department's students; faculty the students in sections they teach.
    let studentScope: Record<string, unknown> = {};
    if (!isAdmin(context)) {
      if (context.roles.includes('HOD')) {
        if (!context.departmentId) denied();
        studentScope = { student: { enrollments: { some: { collegeId: context.collegeId, section: { semester: { course: { departmentId: context.departmentId } } } } } } };
      } else {
        studentScope = { student: { enrollments: { some: { collegeId: context.collegeId, status: 'ACTIVE', section: { classes: { some: { faculty: { userId: context.userId } } } } } } } };
      }
    }
    const results = await this.database.result.findMany({
      where: { collegeId: context.collegeId, examId, ...studentScope },
      include: {
        student: STUDENT_SUMMARY,
      },
      orderBy: { percentage: 'desc' },
    });

    return { exam, results };
  }

  async getMyResults(context: AuthorizationContext) {
    const studentId = await this.getStudentId(context);

    const results = await this.database.result.findMany({
      where: {
        collegeId: context.collegeId,
        studentId,
        publishedAt: { not: null },
        exam: { status: { in: VISIBLE_TO_STUDENTS } },
      },
      include: {
        exam: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Only marks of exams whose result has been published to this student. Marks being entered, submitted or
    // reviewed stay with staff, so the approval step isn't bypassed.
    const marks = await this.database.mark.findMany({
      where: {
        collegeId: context.collegeId,
        studentId,
        examSubject: { exam: { status: { in: VISIBLE_TO_STUDENTS }, results: { some: { collegeId: context.collegeId, studentId, publishedAt: { not: null } } } } },
      },
      include: {
        examSubject: {
          include: {
            exam: true,
            subject: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { results, marks };
  }
}
