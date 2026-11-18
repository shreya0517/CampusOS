import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { SubmissionStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  AssignmentListQuery,
  CreateAssignmentDto,
  GradeSubmissionDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './assignments.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const missing = (): never => {
  throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment was not found.' });
};
/** Handed-in work a teacher can grade, or grade again. */
const GRADABLE: SubmissionStatus[] = [SubmissionStatus.SUBMITTED, SubmissionStatus.LATE, SubmissionStatus.GRADED, SubmissionStatus.RETURNED];
const submissionChanged = (): never => {
  throw new ConflictException({ code: 'SUBMISSION_CHANGED', message: 'This submission changed in the meantime. Reload and try again.' });
};
const isUniqueViolation = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
const submissionMissing = (): never => {
  throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND', message: 'Submission was not found.' });
};
const classMissing = (): never => {
  throw new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class was not found.' });
};

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  private scopedDepartment(context: AuthorizationContext, requested?: string): string | undefined {
    if (context.roles.includes('ADMIN')) return requested;
    if (!context.departmentId) denied();
    if (requested && requested !== context.departmentId) denied();
    return context.departmentId ?? undefined;
  }

  private async assignmentWhere(id: string | undefined, context: AuthorizationContext) {
    const base: Record<string, unknown> = { collegeId: context.collegeId };
    if (id) base.id = id;

    if (context.roles.includes('ADMIN')) return base;

    if (context.roles.includes('STUDENT')) {
      return {
        ...base,
        class: {
          section: {
            enrollments: {
              some: {
                student: { userId: context.userId },
                status: 'ACTIVE',
              },
            },
          },
        },
      };
    }

    const departmentId = this.scopedDepartment(context);
    const isFacultyOnly = context.roles.includes('FACULTY') && !context.roles.includes('HOD');
    return {
      ...base,
      class: {
        ...(departmentId ? { section: { semester: { course: { departmentId } } } } : {}),
        ...(isFacultyOnly ? { faculty: { userId: context.userId } } : {}),
      },
    };
  }

  private async assertCanManageClass(classId: string, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const departmentId = context.roles.includes('ADMIN') ? undefined : this.scopedDepartment(context);
    const isFacultyOnly = context.roles.includes('FACULTY') && !context.roles.includes('ADMIN') && !context.roles.includes('HOD');

    const cls = await this.database.class.findFirst({
      where: {
        id: classId,
        collegeId: context.collegeId,
        ...(departmentId ? { section: { semester: { course: { departmentId } } } } : {}),
        ...(isFacultyOnly ? { faculty: { userId: context.userId } } : {}),
      },
    });
    if (!cls) classMissing();
    return cls;
  }

  async createAssignment(input: CreateAssignmentDto, context: AuthorizationContext) {
    await this.assertCanManageClass(input.classId, context);

    const facultyProfile = await this.database.faculty.findFirst({
      where: { collegeId: context.collegeId, userId: context.userId },
    });

    const assignment = await this.database.assignment.create({
      data: {
        collegeId: context.collegeId,
        classId: input.classId,
        createdById: facultyProfile?.id ?? undefined,
        title: input.title,
        description: input.description,
        dueAt: input.dueAt,
        maxMarks: input.maxMarks,
      },
      include: assignmentInclude,
    });
    return assignment;
  }

  async listAssignments(query: AssignmentListQuery, context: AuthorizationContext) {
    const where = await this.assignmentWhere(undefined, context);
    if (query.classId) {
      (where as Record<string, unknown>).classId = query.classId;
    }
    if (query.search) {
      (where as Record<string, unknown>).OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (!context.roles.includes('ADMIN') && context.roles.includes('STUDENT')) {
      // Students get their own submission on each assignment, not a count of everyone's submissions.
      const student = await this.database.student.findFirst({ where: { collegeId: context.collegeId, userId: context.userId }, select: { id: true } });
      if (!student) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
      const [items, total] = await Promise.all([
        this.database.assignment.findMany({
          where,
          include: {
            ...assignmentInclude,
            submissions: { where: { collegeId: context.collegeId, studentId: student.id }, take: 1 },
          },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.database.assignment.count({ where }),
      ]);
      return { items: items.map(({ submissions, ...item }) => ({ ...item, mySubmission: submissions[0] ?? null })), total, page: query.page, pageSize: query.pageSize };
    }

    const [items, total] = await Promise.all([
      this.database.assignment.findMany({
        where,
        include: {
          ...assignmentInclude,
          _count: { select: { submissions: true } },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.assignment.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getAssignment(id: string, context: AuthorizationContext) {
    const where = await this.assignmentWhere(id, context);

    let studentSubmission = null;
    if (context.roles.includes('STUDENT')) {
      const studentProfile = await this.database.student.findFirst({
        where: { collegeId: context.collegeId, userId: context.userId },
      });
      if (studentProfile) {
        studentSubmission = await this.database.submission.findFirst({
          where: { collegeId: context.collegeId, assignmentId: id, studentId: studentProfile.id },
        });
      }
    }

    const item = await this.database.assignment.findFirst({
      where,
      include: {
        ...assignmentInclude,
        _count: { select: { submissions: true } },
      },
    });

    if (!item) throw missing();
    return { ...item, mySubmission: studentSubmission };
  }

  async updateAssignment(id: string, input: UpdateAssignmentDto, context: AuthorizationContext) {
    const assignment = await this.getAssignment(id, context);
    await this.assertCanManageClass(assignment.classId, context);

    return this.database.assignment.update({
      where: { collegeId_id: { collegeId: context.collegeId, id } },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.maxMarks !== undefined ? { maxMarks: input.maxMarks } : {}),
      },
      include: assignmentInclude,
    });
  }

  async deleteAssignment(id: string, context: AuthorizationContext) {
    const assignment = await this.getAssignment(id, context);
    await this.assertCanManageClass(assignment.classId, context);

    await this.database.assignment.delete({
      where: { collegeId_id: { collegeId: context.collegeId, id } },
    });
    return { success: true };
  }

  async submitAssignment(assignmentId: string, input: SubmitAssignmentDto, context: AuthorizationContext) {
    if (!context.roles.includes('STUDENT')) denied();

    const studentProfile = await this.database.student.findFirst({
      where: { collegeId: context.collegeId, userId: context.userId },
    });
    if (!studentProfile) denied();

    const assignment = await this.getAssignment(assignmentId, context);

    const now = new Date();
    const isLate = assignment.dueAt && now > assignment.dueAt;
    // The student only chooses between a draft and handing in; whether it is late comes from the due date.
    const computedStatus = input.status === 'DRAFT' ? SubmissionStatus.DRAFT : isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED;
    const submittedAt = computedStatus === SubmissionStatus.DRAFT ? null : now;
    const where = { collegeId: context.collegeId, assignmentId, studentId: studentProfile!.id };

    const existing = await this.database.submission.findFirst({ where, select: { id: true, status: true } });
    // Graded work is final: the teacher returns it if it needs changes.
    if (existing?.status === SubmissionStatus.GRADED) {
      throw new ConflictException({ code: 'SUBMISSION_GRADED', message: 'This work has been graded. Ask your teacher to return it if it needs changes.' });
    }
    // Work that was handed in isn't taken back to a draft.
    if (existing && computedStatus === SubmissionStatus.DRAFT && existing.status !== SubmissionStatus.DRAFT) {
      throw new ConflictException({ code: 'ALREADY_SUBMITTED', message: 'This work has already been handed in.' });
    }

    if (existing) {
      // Only if nothing changed it since it was read, so a resubmission can't overwrite a grade given in the meantime.
      // Handing in returned work clears the old marks, since the new work needs grading; the feedback stays.
      const written = await this.database.submission.updateMany({
        where: { id: existing.id, collegeId: context.collegeId, status: existing.status },
        data: {
          ...(input.fileKey !== undefined ? { fileKey: input.fileKey } : {}),
          status: computedStatus,
          submittedAt,
          ...(existing.status === SubmissionStatus.RETURNED ? { marksAwarded: null } : {}),
        },
      });
      if (written.count !== 1) submissionChanged();
    } else {
      try {
        await this.database.submission.create({ data: { ...where, fileKey: input.fileKey ?? null, status: computedStatus, submittedAt } });
      } catch (error) {
        if (isUniqueViolation(error)) submissionChanged();
        throw error;
      }
    }
    const submission = await this.database.submission.findUniqueOrThrow({ where: { collegeId_assignmentId_studentId: where }, include: submissionInclude });
    // A saved draft isn't handed in yet, so only a real submission reaches the faculty member.
    if (computedStatus !== SubmissionStatus.DRAFT) {
      await this.notifications?.safely(async (notifications) => {
        const owner = await this.database.class.findFirst({ where: { id: assignment.classId, collegeId: context.collegeId }, select: { faculty: { select: { userId: true } } } });
        await notifications.notify(context.collegeId, [owner?.faculty?.userId], {
          category: 'ASSIGNMENT',
          title: `New submission: ${assignment.title}`,
          body: `${studentProfile!.firstName} ${studentProfile!.lastName} (${studentProfile!.studentCode})${computedStatus === SubmissionStatus.LATE ? ' submitted late.' : ' submitted their work.'}`,
          link: `/dashboard/assignments/${assignmentId}`,
        });
      });
    }
    return submission;
  }

  async listSubmissions(assignmentId: string, context: AuthorizationContext) {
    const assignment = await this.getAssignment(assignmentId, context);
    await this.assertCanManageClass(assignment.classId, context);

    return this.database.submission.findMany({
      where: { collegeId: context.collegeId, assignmentId },
      include: submissionInclude,
      orderBy: [{ submittedAt: 'desc' }],
    });
  }

  async gradeSubmission(assignmentId: string, submissionId: string, input: GradeSubmissionDto, context: AuthorizationContext) {
    const assignment = await this.getAssignment(assignmentId, context);
    await this.assertCanManageClass(assignment.classId, context);

    if (Number(input.marksAwarded) > Number(assignment.maxMarks)) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: `Marks awarded (${input.marksAwarded}) cannot exceed max marks (${assignment.maxMarks}).`,
      });
    }

    const existing = await this.database.submission.findFirst({
      where: { id: submissionId, collegeId: context.collegeId, assignmentId },
    });
    if (!existing) submissionMissing();
    // Only handed-in work is graded (or graded again); a draft hasn't been handed in.
    if (!GRADABLE.includes(existing!.status)) {
      throw new ConflictException({ code: 'NOT_SUBMITTED', message: 'Only work that has been handed in can be graded.' });
    }

    // The grade applies only to the version of the work the teacher saw: a student can update work that isn't graded
    // yet without changing its status, so the status alone doesn't show it changed. Without a version from the
    // client, the one read here is used.
    if (input.version && input.version.getTime() !== existing!.updatedAt.getTime()) submissionChanged();
    const written = await this.database.submission.updateMany({
      where: { id: submissionId, collegeId: context.collegeId, status: existing!.status, updatedAt: existing!.updatedAt },
      data: {
        marksAwarded: input.marksAwarded,
        feedback: input.feedback,
        status: input.status ?? SubmissionStatus.GRADED,
      },
    });
    if (written.count !== 1) submissionChanged();
    const graded = await this.database.submission.findUniqueOrThrow({ where: { collegeId_id: { collegeId: context.collegeId, id: submissionId } }, include: submissionInclude });
    await this.notifications?.safely(async (notifications) => {
      const returned = (input.status ?? SubmissionStatus.GRADED) === SubmissionStatus.RETURNED;
      const students = await notifications.studentUsers(context.collegeId, [existing!.studentId]);
      await notifications.notify(context.collegeId, students, {
        category: 'ASSIGNMENT',
        title: returned ? `Assignment returned: ${assignment.title}` : `Assignment graded: ${assignment.title}`,
        body: `${input.marksAwarded}/${assignment.maxMarks}${input.feedback ? ` · ${input.feedback}` : ''}`,
        link: `/dashboard/assignments/${assignmentId}`,
      });
    });
    return graded;
  }
}

const classInclude = {
  section: { include: { semester: { include: { course: { include: { department: true } } } } } },
  subject: true,
  faculty: true,
};

const assignmentInclude = {
  class: { include: classInclude },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

const submissionInclude = {
  student: { select: { id: true, firstName: true, lastName: true, studentCode: true } },
};
