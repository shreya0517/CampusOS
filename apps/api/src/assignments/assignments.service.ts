import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
const submissionMissing = (): never => {
  throw new NotFoundException({ code: 'SUBMISSION_NOT_FOUND', message: 'Submission was not found.' });
};
const classMissing = (): never => {
  throw new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class was not found.' });
};

@Injectable()
export class AssignmentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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
    const computedStatus = input.status ?? (isLate ? SubmissionStatus.LATE : SubmissionStatus.SUBMITTED);

    return this.database.submission.upsert({
      where: {
        collegeId_assignmentId_studentId: {
          collegeId: context.collegeId,
          assignmentId,
          studentId: studentProfile!.id,
        },
      },
      create: {
        collegeId: context.collegeId,
        assignmentId,
        studentId: studentProfile!.id,
        fileKey: input.fileKey ?? null,
        status: computedStatus,
        submittedAt: now,
      },
      update: {
        fileKey: input.fileKey ?? undefined,
        status: computedStatus,
        submittedAt: now,
      },
      include: submissionInclude,
    });
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

    return this.database.submission.update({
      where: { collegeId_id: { collegeId: context.collegeId, id: submissionId } },
      data: {
        marksAwarded: input.marksAwarded,
        feedback: input.feedback,
        status: input.status ?? SubmissionStatus.GRADED,
      },
      include: submissionInclude,
    });
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
