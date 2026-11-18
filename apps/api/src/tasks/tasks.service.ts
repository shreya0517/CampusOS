import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { TaskEventPayload } from '../events/events.types';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  AssignTaskDto,
  CreateTaskDto,
  ReviewTaskDto,
  SubmitTaskDto,
  TaskListQuery,
  UpdateAssignmentStatusDto,
  UpdateTaskDto,
} from './tasks.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const taskMissing = (): never => {
  throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task was not found.' });
};
/** Work can be submitted while in progress, or again after it was returned for rework. */
const SUBMITTABLE: TaskStatus[] = [TaskStatus.IN_PROGRESS, TaskStatus.REWORK];
const statusChanged = (): never => {
  throw new ConflictException({ code: 'TASK_STATUS_CHANGED', message: 'This assignment changed in the meantime. Reload and try again.' });
};
const assignmentMissing = (): never => {
  throw new NotFoundException({ code: 'TASK_ASSIGNMENT_NOT_FOUND', message: 'Task assignment was not found.' });
};

const taskInclude = {
  department: true,
  createdBy: {
    select: { id: true, displayName: true },
  },
};

const assignmentInclude = {
  task: { include: taskInclude },
  assignee: { select: { id: true, displayName: true, email: true } },
  reviewedBy: { select: { id: true, displayName: true, email: true } },
};

@Injectable()
export class TasksService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EventsService) private readonly events: EventsService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  private isAdmin(context: AuthorizationContext): boolean {
    return context.roles.includes('ADMIN');
  }

  private isHod(context: AuthorizationContext): boolean {
    return context.roles.includes('HOD');
  }

  private requireAdminOrHod(context: AuthorizationContext): void {
    if (!this.isAdmin(context) && !this.isHod(context)) denied();
  }

  private requireAdmin(context: AuthorizationContext): void {
    if (!this.isAdmin(context)) denied();
  }

  private hodDepartmentId(context: AuthorizationContext): string {
    if (!context.departmentId) denied();
    return context.departmentId!;
  }

  async createTask(input: CreateTaskDto, context: AuthorizationContext): Promise<unknown> {
    this.requireAdminOrHod(context);

    let departmentId = input.departmentId;
    if (this.isHod(context) && !this.isAdmin(context)) {
      const hodDept = this.hodDepartmentId(context);
      if (departmentId && departmentId !== hodDept) denied();
      departmentId = hodDept;
    }

    const task = await this.database.task.create({
      data: {
        collegeId: context.collegeId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        deadline: input.deadline,
        createdByUserId: context.userId,
        departmentId,
      },
      include: taskInclude,
    });

    this.events.emitTaskCreated(
      this.buildPayload(task, context, `New task created: ${input.title}`),
      context.collegeId,
      departmentId ?? null,
    );

    return task;
  }

  async listTasks(query: TaskListQuery, context: AuthorizationContext): Promise<unknown> {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (query.status) where.status = query.status;
    if (query.departmentId) where.departmentId = query.departmentId;

    if (this.isAdmin(context)) {
      // Admin sees all; optionally filter by assigneeUserId via assignments
      if (query.assigneeUserId) {
        where.assignments = { some: { assigneeUserId: query.assigneeUserId, collegeId: context.collegeId } };
      }
    } else if (this.isHod(context)) {
      where.departmentId = this.hodDepartmentId(context);
      if (query.assigneeUserId) {
        where.assignments = { some: { assigneeUserId: query.assigneeUserId, collegeId: context.collegeId } };
      }
    } else {
      // Faculty / other roles — see tasks assigned to them
      where.assignments = { some: { assigneeUserId: context.userId, collegeId: context.collegeId } };
    }

    const [items, total] = await Promise.all([
      this.database.task.findMany({
        where,
        include: {
          ...taskInclude,
          assignments: {
            // Admin and HOD see every assignee's status; faculty only see their own assignment.
            where: this.isAdmin(context) || this.isHod(context) ? { collegeId: context.collegeId } : { collegeId: context.collegeId, assigneeUserId: context.userId },
            select: {
              id: true,
              status: true,
              assigneeUserId: true,
            },
          },
          _count: { select: { assignments: true } },
        },
        orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.task.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getTask(id: string, context: AuthorizationContext): Promise<unknown> {
    const where: Record<string, unknown> = { id, collegeId: context.collegeId };

    if (!this.isAdmin(context) && !this.isHod(context)) {
      where.assignments = { some: { assigneeUserId: context.userId, collegeId: context.collegeId } };
    } else if (this.isHod(context) && !this.isAdmin(context)) {
      where.departmentId = this.hodDepartmentId(context);
    }

    const manager = this.isAdmin(context) || this.isHod(context);
    const task = await this.database.task.findFirst({
      where,
      include: {
        ...taskInclude,
        // Someone working on a shared task sees only their own assignment, never the others' emails or submissions.
        assignments: { ...(manager ? {} : { where: { assigneeUserId: context.userId } }), include: assignmentInclude },
        _count: { select: { assignments: true } },
      },
    });
    if (!task) taskMissing();
    return task;
  }

  async updateTask(id: string, input: UpdateTaskDto, context: AuthorizationContext): Promise<unknown> {
    this.requireAdminOrHod(context);
    const before = (await this.getTask(id, context)) as { departmentId: string | null; assignments: { assigneeUserId: string }[] };

    if (this.isHod(context) && !this.isAdmin(context) && input.departmentId) {
      if (input.departmentId !== this.hodDepartmentId(context)) denied();
    }

    const updated = await this.database.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      },
      include: taskInclude,
    });
    // Open task pages refresh, including the assignees' and, if the task moved, the old department's HODs'.
    const assignees = before.assignments.map((assignment) => assignment.assigneeUserId);
    const payload = this.buildPayload(updated, context, `Task updated: ${updated.title}`);
    this.events.emitTaskUpdated(payload, context.collegeId, updated.departmentId, assignees);
    if (before.departmentId && before.departmentId !== updated.departmentId) this.events.emitTaskUpdated(payload, context.collegeId, before.departmentId);
    return updated;
  }

  async deleteTask(id: string, context: AuthorizationContext): Promise<{ success: boolean }> {
    this.requireAdmin(context);
    const task = await this.database.task.findFirst({ where: { id, collegeId: context.collegeId } });
    if (!task) taskMissing();

    await this.database.task.delete({ where: { id } });
    return { success: true };
  }

  /** Tasks go to active HOD and faculty accounts in the college; an HOD may only assign within their own department. */
  private async assertAssignable(assigneeUserId: string, context: AuthorizationContext): Promise<void> {
    const assignee = await this.database.user.findFirst({
      where: { id: assigneeUserId, collegeId: context.collegeId, status: 'ACTIVE', userRoles: { some: { role: { name: { in: ['HOD', 'FACULTY'] } } } } },
      select: { facultyProfiles: { select: { departmentId: true } } },
    });
    if (!assignee) {
      throw new BadRequestException({ code: 'INVALID_ASSIGNEE', message: 'Tasks can only be assigned to active HOD or faculty accounts.' });
    }
    if (this.isHod(context) && !this.isAdmin(context) && assignee.facultyProfiles[0]?.departmentId !== this.hodDepartmentId(context)) denied();
  }

  async assignTask(taskId: string, input: AssignTaskDto, context: AuthorizationContext): Promise<unknown> {
    this.requireAdminOrHod(context);
    const task = await this.getTask(taskId, context) as Record<string, unknown>;
    await this.assertAssignable(input.assigneeUserId, context);

    let assignment;
    try {
      assignment = await this.database.taskAssignment.create({
        data: {
          collegeId: context.collegeId,
          taskId,
          assigneeUserId: input.assigneeUserId,
          notes: input.notes,
          status: TaskStatus.PENDING,
        },
        include: assignmentInclude,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'ALREADY_ASSIGNED', message: 'This task is already assigned to that person.' });
      }
      throw error;
    }

    this.events.emitTaskAssigned(
      this.buildPayload(task, context, `Task assigned: ${(task as { title?: string }).title ?? taskId}`, {
        assignmentId: assignment.id,
        assigneeUserId: input.assigneeUserId,
      }),
      context.collegeId,
      input.assigneeUserId,
    );
    const assigned = task as { title?: string; deadline?: string | Date };
    await this.notifications?.notify(context.collegeId, [input.assigneeUserId], {
      category: 'TASK',
      title: `New task: ${assigned.title ?? 'Untitled task'}`,
      body: assigned.deadline ? `Due ${new Date(assigned.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'A new task has been assigned to you.',
      link: `/dashboard/tasks/${taskId}`,
    });

    return assignment;
  }

  async updateMyAssignment(assignmentId: string, input: UpdateAssignmentStatusDto, context: AuthorizationContext): Promise<unknown> {
    const existing = await this.database.taskAssignment.findFirst({
      where: { id: assignmentId, collegeId: context.collegeId, assigneeUserId: context.userId },
      include: { task: true },
    });
    if (!existing) assignmentMissing();

    // The assignee can only start, or resume after rework. Submitting goes through submitTask, which records the work.
    const allowedFrom: Partial<Record<TaskStatus, TaskStatus[]>> = {
      [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS],
      [TaskStatus.REWORK]: [TaskStatus.IN_PROGRESS],
    };
    const allowed = allowedFrom[existing!.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: input.status === TaskStatus.SUBMITTED ? 'Submit your work with the submission form.' : `Cannot transition from ${existing!.status} to ${input.status}.`,
      });
    }

    // Only if nothing changed it since it was read. The assignee can't edit notes: they hold the assigner's instructions.
    const written = await this.database.taskAssignment.updateMany({
      where: { id: assignmentId, collegeId: context.collegeId, assigneeUserId: context.userId, status: existing!.status },
      data: { status: input.status },
    });
    if (written.count !== 1) statusChanged();
    const updated = await this.database.taskAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: assignmentInclude });

    if (input.status === TaskStatus.IN_PROGRESS) {
      this.events.emitTaskStarted(
        this.buildPayload(existing!.task, context, `Task started: ${existing!.task.title}`, {
          assignmentId,
          assigneeUserId: context.userId,
        }),
        context.collegeId,
      );
    }

    return updated;
  }

  async submitTask(assignmentId: string, input: SubmitTaskDto, context: AuthorizationContext): Promise<unknown> {
    const existing = await this.database.taskAssignment.findFirst({
      where: { id: assignmentId, collegeId: context.collegeId, assigneeUserId: context.userId },
      include: { task: true },
    });
    if (!existing) assignmentMissing();
    if (!SUBMITTABLE.includes(existing!.status)) {
      throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION', message: 'Only work in progress, or work returned for rework, can be submitted.' });
    }

    const now = new Date();
    await this.database.$transaction(async (tx) => {
      // Only from the state that was read (in progress or rework), so approved work can't be reopened by submitting,
      // and a submission that was reviewed in the meantime (for example sent back for rework) isn't resubmitted unseen.
      const written = await tx.taskAssignment.updateMany({
        where: { id: assignmentId, collegeId: context.collegeId, assigneeUserId: context.userId, status: existing!.status },
        data: { status: TaskStatus.SUBMITTED, submissionContent: input.content, submittedAt: now },
      });
      if (written.count !== 1) statusChanged();
      // Each attempt is kept in the audit log, since a resubmission replaces the stored content.
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: 'TASK_SUBMITTED', entityType: 'TaskAssignment', entityId: assignmentId, metadata: { taskId: existing!.taskId, content: input.content } },
      });
    });
    const updated = await this.database.taskAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: assignmentInclude });

    this.events.emitTaskSubmitted(
      this.buildPayload(existing!.task, context, `Task submitted: ${existing!.task.title}`, {
        assignmentId,
        assigneeUserId: context.userId,
      }),
      context.collegeId,
      existing!.task.departmentId,
    );
    // The person who created the task reviews it.
    const submitter = (updated as { assignee?: { displayName?: string } }).assignee?.displayName ?? 'The assignee';
    await this.notifications?.notify(context.collegeId, [existing!.task.createdByUserId].filter((id) => id !== context.userId), {
      category: 'TASK',
      title: `Task submitted for review: ${existing!.task.title}`,
      body: `${submitter} submitted their work.`,
      link: `/dashboard/tasks/${existing!.task.id}`,
    });

    return updated;
  }

  async reviewSubmission(assignmentId: string, input: ReviewTaskDto, context: AuthorizationContext): Promise<unknown> {
    this.requireAdminOrHod(context);

    const existing = await this.database.taskAssignment.findFirst({
      where: { id: assignmentId, collegeId: context.collegeId },
      include: { task: true },
    });
    if (!existing) assignmentMissing();

    if (this.isHod(context) && !this.isAdmin(context)) {
      const hodDept = this.hodDepartmentId(context);
      if (existing!.task.departmentId !== hodDept) denied();
    }

    if (existing!.status !== TaskStatus.SUBMITTED) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'Only SUBMITTED assignments can be reviewed.',
      });
    }

    const newStatus = input.decision === 'APPROVED' ? TaskStatus.APPROVED : TaskStatus.REWORK;

    const now = new Date();
    await this.database.$transaction(async (tx) => {
      // Only while still submitted, so two reviewers can't both decide it.
      const written = await tx.taskAssignment.updateMany({
        where: { id: assignmentId, collegeId: context.collegeId, status: TaskStatus.SUBMITTED },
        // Feedback goes in reviewNotes, so the assigner's instructions in notes are kept.
        data: { status: newStatus, reviewedAt: now, reviewedByUserId: context.userId, reviewNotes: input.notes ?? null },
      });
      if (written.count !== 1) statusChanged();
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: 'TASK_REVIEWED', entityType: 'TaskAssignment', entityId: assignmentId, metadata: { taskId: existing!.taskId, decision: input.decision, notes: input.notes ?? null } },
      });
    });
    const updated = await this.database.taskAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: assignmentInclude });

    this.events.emitTaskReviewed(
      this.buildPayload(existing!.task, context, `Task ${input.decision.toLowerCase()}: ${existing!.task.title}`, {
        assignmentId,
        assigneeUserId: existing!.assigneeUserId,
      }),
      context.collegeId,
      existing!.assigneeUserId,
    );
    await this.notifications?.notify(context.collegeId, [existing!.assigneeUserId], {
      category: 'TASK',
      title: input.decision === 'APPROVED' ? `Task approved: ${existing!.task.title}` : `Task returned for rework: ${existing!.task.title}`,
      body: input.notes ? input.notes : input.decision === 'APPROVED' ? 'Your submission was approved.' : 'Please update your work and submit it again.',
      link: `/dashboard/tasks/${existing!.task.id}`,
    });

    return updated;
  }

  async listMyAssignments(context: AuthorizationContext): Promise<unknown> {
    const [items, total] = await Promise.all([
      this.database.taskAssignment.findMany({
        where: { collegeId: context.collegeId, assigneeUserId: context.userId },
        include: assignmentInclude,
        orderBy: [{ task: { deadline: 'asc' } }, { createdAt: 'desc' }],
      }),
      this.database.taskAssignment.count({
        where: { collegeId: context.collegeId, assigneeUserId: context.userId },
      }),
    ]);
    return { items, total, page: 1, pageSize: total || 50 };
  }

  /** Counts of the caller's own task assignments, in the shape the dashboards read (camelCase keys plus a total). */
  async getMyAssignmentStats(context: AuthorizationContext): Promise<{ pending: number; inProgress: number; submitted: number; approved: number; rework: number; total: number }> {
    const count = (status: TaskStatus): Promise<number> =>
      this.database.taskAssignment.count({ where: { collegeId: context.collegeId, assigneeUserId: context.userId, status } });
    const [pending, inProgress, submitted, approved, rework] = await Promise.all([
      count(TaskStatus.PENDING),
      count(TaskStatus.IN_PROGRESS),
      count(TaskStatus.SUBMITTED),
      count(TaskStatus.APPROVED),
      count(TaskStatus.REWORK),
    ]);
    return { pending, inProgress, submitted, approved, rework, total: pending + inProgress + submitted + approved + rework };
  }

  /* ─── Event payload builder ──────────────────────────────────────────── */

  private buildPayload(
    task: Record<string, unknown>,
    context: AuthorizationContext,
    summary: string,
    extra?: { assignmentId?: string; assigneeUserId?: string },
  ): TaskEventPayload {
    return {
      taskId: task.id as string,
      title: (task.title as string) ?? '',
      status: (task.status as string) ?? '',
      priority: (task.priority as string) ?? '',
      departmentId: (task.departmentId as string | null) ?? null,
      actorUserId: context.userId,
      actorName: context.userId, // Best-effort; the gateway resolves user names from JWT context
      summary,
      timestamp: new Date().toISOString(),
      ...extra,
    };
  }
}
