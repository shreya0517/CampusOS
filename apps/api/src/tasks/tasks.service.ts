import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { EventsService } from '../events/events.service';
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

    const task = await this.database.task.findFirst({
      where,
      include: {
        ...taskInclude,
        assignments: { include: assignmentInclude },
        _count: { select: { assignments: true } },
      },
    });
    if (!task) taskMissing();
    return task;
  }

  async updateTask(id: string, input: UpdateTaskDto, context: AuthorizationContext): Promise<unknown> {
    this.requireAdminOrHod(context);
    await this.getTask(id, context);

    if (this.isHod(context) && !this.isAdmin(context) && input.departmentId) {
      if (input.departmentId !== this.hodDepartmentId(context)) denied();
    }

    return this.database.task.update({
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
  }

  async deleteTask(id: string, context: AuthorizationContext): Promise<{ success: boolean }> {
    this.requireAdmin(context);
    const task = await this.database.task.findFirst({ where: { id, collegeId: context.collegeId } });
    if (!task) taskMissing();

    await this.database.task.delete({ where: { id } });
    return { success: true };
  }

  async assignTask(taskId: string, input: AssignTaskDto, context: AuthorizationContext): Promise<unknown> {
    this.requireAdminOrHod(context);
    const task = await this.getTask(taskId, context) as Record<string, unknown>;

    const assignment = await this.database.taskAssignment.create({
      data: {
        collegeId: context.collegeId,
        taskId,
        assigneeUserId: input.assigneeUserId,
        notes: input.notes,
        status: TaskStatus.PENDING,
      },
      include: assignmentInclude,
    });

    this.events.emitTaskAssigned(
      this.buildPayload(task, context, `Task assigned: ${(task as { title?: string }).title ?? taskId}`, {
        assignmentId: assignment.id,
        assigneeUserId: input.assigneeUserId,
      }),
      context.collegeId,
      input.assigneeUserId,
    );

    return assignment;
  }

  async updateMyAssignment(assignmentId: string, input: UpdateAssignmentStatusDto, context: AuthorizationContext): Promise<unknown> {
    const existing = await this.database.taskAssignment.findFirst({
      where: { id: assignmentId, collegeId: context.collegeId, assigneeUserId: context.userId },
      include: { task: true },
    });
    if (!existing) assignmentMissing();

    // Status flow guard: only allow forward transitions
    const allowedFrom: Partial<Record<TaskStatus, TaskStatus[]>> = {
      [TaskStatus.PENDING]: [TaskStatus.IN_PROGRESS],
      [TaskStatus.IN_PROGRESS]: [TaskStatus.SUBMITTED],
      [TaskStatus.REWORK]: [TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED],
    };
    const allowed = allowedFrom[existing!.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from ${existing!.status} to ${input.status}.`,
      });
    }

    const updated = await this.database.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: assignmentInclude,
    });

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

    const updated = await this.database.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        status: TaskStatus.SUBMITTED,
        submissionContent: input.content,
        submittedAt: new Date(),
      },
      include: assignmentInclude,
    });

    this.events.emitTaskSubmitted(
      this.buildPayload(existing!.task, context, `Task submitted: ${existing!.task.title}`, {
        assignmentId,
        assigneeUserId: context.userId,
      }),
      context.collegeId,
      existing!.task.departmentId,
    );

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

    const updated = await this.database.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        status: newStatus,
        reviewedAt: new Date(),
        reviewedByUserId: context.userId,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: assignmentInclude,
    });

    this.events.emitTaskReviewed(
      this.buildPayload(existing!.task, context, `Task ${input.decision.toLowerCase()}: ${existing!.task.title}`, {
        assignmentId,
        assigneeUserId: existing!.assigneeUserId,
      }),
      context.collegeId,
      existing!.assigneeUserId,
    );

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

  async getMyAssignmentStats(context: AuthorizationContext): Promise<unknown> {
    const statuses = Object.values(TaskStatus);
    const counts = await Promise.all(
      statuses.map((status) =>
        this.database.taskAssignment.count({
          where: { collegeId: context.collegeId, assigneeUserId: context.userId, status },
        }),
      ),
    );
    return Object.fromEntries(statuses.map((status, i) => [status, counts[i]]));
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
