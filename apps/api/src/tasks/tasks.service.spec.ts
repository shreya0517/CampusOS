import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { TasksService, taskStatusFrom } from './tasks.service';
import { REQUIRED_ROLES } from '../authorization/authorization.decorator';
import { TasksController } from './tasks.controller';
import type { DatabaseService } from '../database.service';
import type { EventsService } from '../events/events.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { TaskPriority, TaskStatus } from '@prisma/client';

type MockDb = {
  task: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  $queryRaw: jest.Mock;
  taskAssignment: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
  faculty: {
    findFirst: jest.Mock;
  };
  user: {
    findFirst: jest.Mock;
  };
  department: {
    findFirst: jest.Mock;
  };
};

describe('TasksService WebSocket Event Emissions', () => {
  let service: TasksService;
  let mockDatabase: MockDb;
  let mockEventsService: jest.Mocked<Partial<EventsService>>;

  const adminContext: AuthorizationContext = {
    userId: 'admin-1',
    collegeId: 'college-1',
    roles: ['ADMIN'],
    permissions: [],
    departmentId: null,
  };

  const facultyContext: AuthorizationContext = {
    userId: 'faculty-1',
    collegeId: 'college-1',
    roles: ['FACULTY'],
    permissions: [],
    departmentId: 'dept-1',
  };

  beforeEach(() => {
    mockDatabase = {
      task: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        delete: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      taskAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'assign-1', assignee: { displayName: 'Dr. Priya Sharma' } }),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
      faculty: {
        findFirst: jest.fn(),
      },
      // Assignees are active faculty in department dept-1 unless a test says otherwise.
      user: {
        findFirst: jest.fn().mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-1' }] }),
      },
      // Departments belong to the college unless a test says otherwise.
      department: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dept-1' }),
      },
    };

    mockDatabase.$transaction.mockImplementation((work: (tx: MockDb) => Promise<unknown>) => work(mockDatabase));

    mockEventsService = {
      emitTaskCreated: jest.fn(),
      emitTaskAssigned: jest.fn(),
      emitTaskStarted: jest.fn(),
      emitTaskSubmitted: jest.fn(),
      emitTaskReviewed: jest.fn(),
      emitTaskUpdated: jest.fn(),
    };

    service = new TasksService(
      mockDatabase as unknown as DatabaseService,
      mockEventsService as unknown as EventsService,
    );
  });

  describe('getTask creator relation', () => {
    it('includes the creator id and displayName in the task response', async () => {
      const createdBy = { id: 'admin-1', displayName: 'Campus Admin' };
      mockDatabase.task.findFirst.mockResolvedValue({
        id: 'task-100',
        collegeId: adminContext.collegeId,
        createdBy,
        assignments: [],
      });

      const result = await service.getTask('task-100', adminContext);

      expect(mockDatabase.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            createdBy: {
              select: { id: true, displayName: true },
            },
          }),
        }),
      );
      expect(result).toEqual(expect.objectContaining({ createdBy }));
    });
  });

  describe('createTask', () => {
    const input = {
      title: 'Prepare Syllabus',
      description: 'Annual syllabus review',
      priority: TaskPriority.HIGH,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      departmentId: 'dept-1',
    };

    it('emits task:created event after successful database creation', async () => {
      const createdRecord = {
        id: 'task-100',
        title: input.title,
        status: TaskStatus.PENDING,
        priority: input.priority,
        departmentId: input.departmentId,
        collegeId: adminContext.collegeId,
      };
      mockDatabase.task.create.mockResolvedValue(createdRecord);

      const result = await service.createTask(input, adminContext);

      expect(result).toEqual(createdRecord);
      expect(mockEventsService.emitTaskCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-100',
          title: 'Prepare Syllabus',
          status: 'PENDING',
          priority: 'HIGH',
        }),
        'college-1',
        'dept-1',
      );
    });

    it('does NOT emit event if database operation fails', async () => {
      mockDatabase.task.create.mockRejectedValue(new Error('DB connection failure'));

      await expect(service.createTask(input, adminContext)).rejects.toThrow('DB connection failure');
      expect(mockEventsService.emitTaskCreated).not.toHaveBeenCalled();
    });
  });

  describe('assignTask', () => {
    it('emits task:assigned event after successful assignment in database', async () => {
      const taskRecord = {
        id: 'task-100',
        title: 'Exam Coordination',
        status: TaskStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        departmentId: null,
      };
      mockDatabase.task.findFirst.mockResolvedValue(taskRecord);
      mockDatabase.faculty.findFirst.mockResolvedValue({ id: 'fac-1', userId: 'faculty-1' });

      const assignmentRecord = {
        id: 'assignment-1',
        taskId: 'task-100',
        assigneeUserId: 'faculty-1',
        status: TaskStatus.PENDING,
      };
      mockDatabase.taskAssignment.create.mockResolvedValue(assignmentRecord);

      const result = await service.assignTask('task-100', { assigneeUserId: 'faculty-1' }, adminContext);

      expect(result).toEqual(assignmentRecord);
      expect(mockEventsService.emitTaskAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-100',
          assignmentId: 'assignment-1',
          assigneeUserId: 'faculty-1',
        }),
        'college-1',
        'faculty-1',
      );
    });

    it('does NOT emit task:assigned if DB assignment fails', async () => {
      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-100' });
      mockDatabase.faculty.findFirst.mockResolvedValue({ id: 'fac-1', userId: 'faculty-1' });
      mockDatabase.taskAssignment.create.mockRejectedValue(new Error('Unique constraint violated'));

      await expect(
        service.assignTask('task-100', { assigneeUserId: 'faculty-1' }, adminContext),
      ).rejects.toThrow('Unique constraint violated');

      expect(mockEventsService.emitTaskAssigned).not.toHaveBeenCalled();
    });
  });

  describe('updateMyAssignment', () => {
    it('emits task:started when status transitions to IN_PROGRESS', async () => {
      const existing = {
        id: 'assign-1',
        status: TaskStatus.PENDING,
        collegeId: 'college-1',
        assigneeUserId: facultyContext.userId,
        task: {
          id: 'task-100',
          title: 'Grade midterms',
          status: TaskStatus.PENDING,
          priority: TaskPriority.HIGH,
          departmentId: 'dept-1',
        },
      };
      mockDatabase.taskAssignment.findFirst.mockResolvedValue(existing);

      await service.updateMyAssignment('assign-1', { status: TaskStatus.IN_PROGRESS }, facultyContext);

      // Only if still pending, and the assignee's notes never replace the assigner's instructions.
      expect(mockDatabase.taskAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: 'assign-1', collegeId: 'college-1', assigneeUserId: 'faculty-1', status: TaskStatus.PENDING },
        data: { status: TaskStatus.IN_PROGRESS },
      });

      expect(mockEventsService.emitTaskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-100',
          assignmentId: 'assign-1',
          assigneeUserId: facultyContext.userId,
        }),
        'college-1',
      );
    });

    it('never marks work submitted through a status change', async () => {
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ id: 'assign-1', status: TaskStatus.IN_PROGRESS, task: { id: 'task-100', title: 'Grade midterms' } });
      await expect(service.updateMyAssignment('assign-1', { status: TaskStatus.SUBMITTED }, facultyContext)).rejects.toBeInstanceOf(BadRequestException);
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ id: 'assign-1', status: TaskStatus.REWORK, task: { id: 'task-100', title: 'Grade midterms' } });
      await expect(service.updateMyAssignment('assign-1', { status: TaskStatus.SUBMITTED }, facultyContext)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDatabase.taskAssignment.updateMany).not.toHaveBeenCalled();
    });

    it('reports a status that changed in the meantime', async () => {
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ id: 'assign-1', status: TaskStatus.PENDING, task: { id: 'task-100', title: 'Grade midterms' } });
      mockDatabase.taskAssignment.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.updateMyAssignment('assign-1', { status: TaskStatus.IN_PROGRESS }, facultyContext)).rejects.toMatchObject({ response: { code: 'TASK_STATUS_CHANGED' } });
      expect(mockEventsService.emitTaskStarted).not.toHaveBeenCalled();
    });
  });

  describe('submitTask', () => {
    it('emits task:submitted event when assignment is submitted', async () => {
      const existing = {
        id: 'assign-1',
        status: TaskStatus.IN_PROGRESS,
        collegeId: 'college-1',
        assigneeUserId: facultyContext.userId,
        task: {
          id: 'task-100',
          title: 'Grade midterms',
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          departmentId: 'dept-1',
        },
      };
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ ...existing, taskId: 'task-100' });
      mockDatabase.taskAssignment.findMany.mockResolvedValueOnce([{ status: TaskStatus.SUBMITTED }]);

      await service.submitTask('assign-1', { content: 'All graded' }, facultyContext);

      expect(mockDatabase.taskAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: 'assign-1', collegeId: 'college-1', assigneeUserId: 'faculty-1', status: TaskStatus.IN_PROGRESS },
        data: { status: TaskStatus.SUBMITTED, submissionContent: 'All graded', submittedAt: expect.any(Date) },
      });
      // The event carries the status just worked out, not the one read before the change.
      expect(mockEventsService.emitTaskSubmitted).toHaveBeenCalledWith(expect.objectContaining({ status: TaskStatus.SUBMITTED }), 'college-1', 'dept-1');
      // The task's status is worked out again from its assignments, with the task row locked.
      expect(mockDatabase.$queryRaw).toHaveBeenCalled();
      expect(mockDatabase.task.updateMany).toHaveBeenCalledWith({ where: { id: 'task-100', collegeId: 'college-1' }, data: { status: expect.any(String) } });
      // Every attempt is kept, since a resubmission replaces the stored content.
      expect(mockDatabase.auditLog.create).toHaveBeenCalledWith({
        data: { collegeId: 'college-1', actorId: 'faculty-1', action: 'TASK_SUBMITTED', entityType: 'TaskAssignment', entityId: 'assign-1', metadata: { taskId: 'task-100', content: 'All graded' } },
      });

      expect(mockEventsService.emitTaskSubmitted).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-100',
          assignmentId: 'assign-1',
          assigneeUserId: facultyContext.userId,
        }),
        'college-1',
        'dept-1',
      );
    });

    it.each([TaskStatus.PENDING, TaskStatus.SUBMITTED, TaskStatus.APPROVED])('refuses to submit work that is %s', async (status) => {
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ id: 'assign-1', status, task: { id: 'task-100', title: 'Grade midterms' } });
      await expect(service.submitTask('assign-1', { content: 'Again' }, facultyContext)).rejects.toMatchObject({ response: { code: 'INVALID_STATUS_TRANSITION' } });
      expect(mockDatabase.taskAssignment.updateMany).not.toHaveBeenCalled();
      expect(mockEventsService.emitTaskSubmitted).not.toHaveBeenCalled();
    });

    it('refuses a submission when the assignment was reviewed in the meantime', async () => {
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ id: 'assign-1', status: TaskStatus.REWORK, task: { id: 'task-100', title: 'Grade midterms' } });
      mockDatabase.taskAssignment.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.submitTask('assign-1', { content: 'Again' }, facultyContext)).rejects.toBeInstanceOf(ConflictException);
      expect(mockDatabase.auditLog.create).not.toHaveBeenCalled();
      expect(mockEventsService.emitTaskSubmitted).not.toHaveBeenCalled();
    });
  });

  describe('reviewSubmission', () => {
    it('emits task:reviewed event with decision details', async () => {
      const existing = {
        id: 'assign-1',
        status: TaskStatus.SUBMITTED,
        collegeId: 'college-1',
        assigneeUserId: 'faculty-1',
        task: {
          id: 'task-100',
          title: 'Grade midterms',
          status: TaskStatus.SUBMITTED,
          priority: TaskPriority.HIGH,
          departmentId: 'dept-1',
        },
      };
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ ...existing, taskId: 'task-100' });

      await service.reviewSubmission('assign-1', { decision: 'APPROVED', notes: 'Great job' }, adminContext);

      // Only while still submitted; the feedback goes in reviewNotes, leaving the instructions in notes alone.
      expect(mockDatabase.taskAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: 'assign-1', collegeId: 'college-1', status: TaskStatus.SUBMITTED },
        data: { status: TaskStatus.APPROVED, reviewedAt: expect.any(Date), reviewedByUserId: 'admin-1', reviewNotes: 'Great job' },
      });
      expect(mockDatabase.auditLog.create).toHaveBeenCalledWith({
        data: { collegeId: 'college-1', actorId: 'admin-1', action: 'TASK_REVIEWED', entityType: 'TaskAssignment', entityId: 'assign-1', metadata: { taskId: 'task-100', decision: 'APPROVED', notes: 'Great job' } },
      });

      expect(mockEventsService.emitTaskReviewed).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-100',
          assignmentId: 'assign-1',
          assigneeUserId: 'faculty-1',
        }),
        'college-1',
        'faculty-1',
      );
    });

    it('lets only one reviewer decide a submission', async () => {
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({ id: 'assign-1', status: TaskStatus.SUBMITTED, assigneeUserId: 'faculty-1', taskId: 'task-100', task: { id: 'task-100', title: 'Grade midterms', departmentId: 'dept-1' } });
      mockDatabase.taskAssignment.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.reviewSubmission('assign-1', { decision: 'REWORK' }, adminContext)).rejects.toMatchObject({ response: { code: 'TASK_STATUS_CHANGED' } });
      expect(mockEventsService.emitTaskReviewed).not.toHaveBeenCalled();
    });
  });

  describe('shared tasks', () => {
    it('gives faculty only their own assignment of a shared task, and managers every one', async () => {
      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-100' });
      await service.getTask('task-100', facultyContext);
      expect(mockDatabase.task.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ assignments: expect.objectContaining({ where: { assigneeUserId: 'faculty-1' } }) }) }),
      );
      await service.getTask('task-100', adminContext);
      const include = (mockDatabase.task.findFirst.mock.calls.at(-1)?.[0] as { include: { assignments: Record<string, unknown> } }).include;
      expect(include.assignments).not.toHaveProperty('where');
    });

    it('tells everyone on a task when it is edited', async () => {
      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-100', departmentId: 'dept-1', assignments: [{ assigneeUserId: 'faculty-1' }, { assigneeUserId: 'faculty-2' }] });
      mockDatabase.task.update.mockResolvedValue({ id: 'task-100', title: 'Grade finals', departmentId: 'dept-1' });
      await service.updateTask('task-100', { title: 'Grade finals' }, adminContext);
      expect(mockEventsService.emitTaskUpdated).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-100' }), 'college-1', 'dept-1', ['faculty-1', 'faculty-2']);
    });
  });

  describe('deadlines, departments and who hears about a submission', () => {
    const day = 86_400_000;
    const hodContext: AuthorizationContext = { userId: 'hod-1', collegeId: 'college-1', roles: ['HOD'], permissions: [], departmentId: 'dept-1' };
    let notifications: { safely: jest.Mock; hodsOf: jest.Mock; notify: jest.Mock };
    let notifyingService: TasksService;

    beforeEach(() => {
      notifications = { safely: jest.fn(), hodsOf: jest.fn().mockResolvedValue(['hod-1']), notify: jest.fn() };
      notifications.safely.mockImplementation((work: (n: typeof notifications) => Promise<void>) => work(notifications));
      notifyingService = new TasksService(
        mockDatabase as unknown as DatabaseService,
        mockEventsService as unknown as EventsService,
        notifications as unknown as NotificationsService,
      );
    });

    it('refuses a new task whose deadline has passed', async () => {
      await expect(service.createTask({ title: 'Late', priority: TaskPriority.LOW, deadline: new Date(Date.now() - day) }, adminContext)).rejects.toMatchObject({ response: { code: 'DEADLINE_IN_PAST' } });
      expect(mockDatabase.task.create).not.toHaveBeenCalled();
    });

    it("refuses a department that isn't one of the college's", async () => {
      mockDatabase.department.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.createTask({ title: 'Audit', priority: TaskPriority.LOW, deadline: new Date(Date.now() + day), departmentId: 'other-college-dept' }, adminContext),
      ).rejects.toMatchObject({ response: { code: 'DEPARTMENT_NOT_FOUND' } });
      expect(mockDatabase.department.findFirst).toHaveBeenCalledWith({ where: { id: 'other-college-dept', collegeId: 'college-1' }, select: { id: true } });
      expect(mockDatabase.task.create).not.toHaveBeenCalled();

      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-100', departmentId: 'dept-1', deadline: new Date(Date.now() + day), assignments: [] });
      mockDatabase.department.findFirst.mockResolvedValueOnce(null);
      await expect(service.updateTask('task-100', { departmentId: 'other-college-dept' }, adminContext)).rejects.toMatchObject({ response: { code: 'DEPARTMENT_NOT_FOUND' } });
      expect(mockDatabase.task.update).not.toHaveBeenCalled();
    });

    it('lets an overdue task be edited, but not moved to a deadline that has passed', async () => {
      const past = new Date(Date.now() - 3 * day);
      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-100', departmentId: 'dept-1', deadline: past, assignments: [] });
      mockDatabase.task.update.mockResolvedValue({ id: 'task-100', title: 'Renamed', departmentId: 'dept-1' });

      // The form sends the deadline back unchanged.
      await service.updateTask('task-100', { title: 'Renamed', deadline: new Date(past) }, adminContext);
      expect(mockDatabase.task.update).toHaveBeenCalledTimes(1);

      await expect(service.updateTask('task-100', { deadline: new Date(Date.now() - day) }, adminContext)).rejects.toMatchObject({ response: { code: 'DEADLINE_IN_PAST' } });
      expect(mockDatabase.task.update).toHaveBeenCalledTimes(1);
    });

    it("tells the task's creator and its department's HODs about a submission, but not the submitter", async () => {
      mockDatabase.taskAssignment.findFirst.mockResolvedValue({
        id: 'assign-1',
        status: TaskStatus.IN_PROGRESS,
        taskId: 'task-100',
        task: { id: 'task-100', title: 'Grade midterms', departmentId: 'dept-1', createdByUserId: 'admin-1' },
      });

      await notifyingService.submitTask('assign-1', { content: 'Done' }, facultyContext);
      expect(notifications.hodsOf).toHaveBeenCalledWith('college-1', 'dept-1');
      expect(notifications.notify).toHaveBeenCalledWith('college-1', ['admin-1', 'hod-1'], expect.objectContaining({ title: 'Task submitted for review: Grade midterms' }));

      // An HOD submitting their own work isn't told about it.
      await notifyingService.submitTask('assign-1', { content: 'Done' }, hodContext);
      expect(notifications.notify).toHaveBeenLastCalledWith('college-1', ['admin-1'], expect.anything());
    });

    it('says a task is overdue when it is assigned after its deadline', async () => {
      mockDatabase.taskAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-100', title: 'Old task', departmentId: 'dept-1', deadline: new Date('2026-01-10T10:00:00Z') });
      await notifyingService.assignTask('task-100', { assigneeUserId: 'faculty-1' }, adminContext);
      expect(notifications.notify).toHaveBeenLastCalledWith('college-1', ['faculty-1'], expect.objectContaining({ body: 'Overdue since 10 Jan 2026.' }));

      mockDatabase.task.findFirst.mockResolvedValue({ id: 'task-101', title: 'New task', departmentId: 'dept-1', deadline: new Date(Date.now() + 2 * day) });
      await notifyingService.assignTask('task-101', { assigneeUserId: 'faculty-2' }, adminContext);
      expect(notifications.notify).toHaveBeenLastCalledWith('college-1', ['faculty-2'], expect.objectContaining({ body: expect.stringMatching(/^Due /) }));
    });
  });
});

describe('TasksService listTasks assignment visibility', () => {
  const database = { task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
  const service = new TasksService(database as unknown as DatabaseService, {} as EventsService);
  const query = { page: 1, pageSize: 20 } as Parameters<TasksService['listTasks']>[0];
  const assignmentsWhere = (): unknown => (database.task.findMany.mock.calls.at(-1)?.[0] as { include: { assignments: { where: unknown } } }).include.assignments.where;

  beforeEach(() => jest.clearAllMocks());

  it('returns every assignee status to admins', async () => {
    await service.listTasks(query, { userId: 'admin-1', collegeId: 'college-1', roles: ['ADMIN'], permissions: [], departmentId: null });
    expect(assignmentsWhere()).toEqual({ collegeId: 'college-1' });
  });

  it('returns every assignee status to HODs', async () => {
    await service.listTasks(query, { userId: 'hod-1', collegeId: 'college-1', roles: ['HOD'], permissions: [], departmentId: 'dept-1' });
    expect(assignmentsWhere()).toEqual({ collegeId: 'college-1' });
  });

  it('returns only their own assignment to faculty', async () => {
    await service.listTasks(query, { userId: 'faculty-1', collegeId: 'college-1', roles: ['FACULTY'], permissions: [], departmentId: 'dept-1' });
    expect(assignmentsWhere()).toEqual({ collegeId: 'college-1', assigneeUserId: 'faculty-1' });
  });
});

describe('TasksService my assignment stats', () => {
  it('returns camelCase counts and a total, as the dashboards read them', async () => {
    const byStatus: Record<string, number> = { PENDING: 2, IN_PROGRESS: 1, SUBMITTED: 3, APPROVED: 4, REWORK: 1 };
    const database = { taskAssignment: { count: jest.fn(({ where }: { where: { status: string } }) => Promise.resolve(byStatus[where.status] ?? 0)) } };
    const service = new TasksService(database as unknown as DatabaseService, {} as EventsService);
    const stats = await service.getMyAssignmentStats({ userId: 'faculty-1', collegeId: 'college-1', roles: ['FACULTY'], permissions: [], departmentId: 'dept-1' });
    expect(stats).toEqual({ pending: 2, inProgress: 1, submitted: 3, approved: 4, rework: 1, total: 11 });
    expect(database.taskAssignment.count).toHaveBeenCalledWith({ where: { collegeId: 'college-1', assigneeUserId: 'faculty-1', status: 'PENDING' } });
  });
});

describe('task status', () => {
  it('sums up the assignments', () => {
    const { PENDING, IN_PROGRESS, SUBMITTED, APPROVED, REWORK } = TaskStatus;
    expect(taskStatusFrom([])).toBe(PENDING);
    expect(taskStatusFrom([PENDING, PENDING])).toBe(PENDING);
    expect(taskStatusFrom([PENDING, IN_PROGRESS])).toBe(IN_PROGRESS);
    expect(taskStatusFrom([APPROVED, PENDING])).toBe(IN_PROGRESS);
    expect(taskStatusFrom([REWORK, IN_PROGRESS])).toBe(REWORK);
    expect(taskStatusFrom([SUBMITTED, REWORK, APPROVED])).toBe(SUBMITTED);
    expect(taskStatusFrom([APPROVED, APPROVED])).toBe(APPROVED);
  });
});

describe('TasksService assignment boundaries', () => {
  const hod: AuthorizationContext = { userId: 'hod-1', collegeId: 'college-1', roles: ['HOD'], permissions: [], departmentId: 'dept-1' };
  const admin: AuthorizationContext = { userId: 'admin-1', collegeId: 'college-1', roles: ['ADMIN'], permissions: [], departmentId: null };
  const database = {
    task: { findFirst: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Report', departmentId: 'dept-1' }), updateMany: jest.fn() },
    taskAssignment: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    user: { findFirst: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
  const events = { emitTaskAssigned: jest.fn() };
  const service = new TasksService(database as unknown as DatabaseService, events as unknown as EventsService);
  beforeEach(() => jest.clearAllMocks());

  it('only assigns to active HOD or faculty accounts in the college', async () => {
    database.user.findFirst.mockResolvedValue(null);
    await expect(service.assignTask('task-1', { assigneeUserId: 'student-user' }, admin)).rejects.toMatchObject({ response: { code: 'INVALID_ASSIGNEE' } });
    expect(database.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'student-user', collegeId: 'college-1', status: 'ACTIVE', userRoles: { some: { role: { name: { in: ['HOD', 'FACULTY'] } } } } },
    }));
    expect(database.taskAssignment.create).not.toHaveBeenCalled();
  });

  it('keeps an HOD from assigning to faculty in another department', async () => {
    database.user.findFirst.mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-2' }] });
    await expect(service.assignTask('task-1', { assigneeUserId: 'other-faculty' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.taskAssignment.create).not.toHaveBeenCalled();
  });

  it('lets admins assign across departments and HODs within theirs', async () => {
    database.user.findFirst.mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-2' }] });
    database.taskAssignment.create.mockResolvedValue({ id: 'a-1' });
    await expect(service.assignTask('task-1', { assigneeUserId: 'other-faculty' }, admin)).resolves.toEqual({ id: 'a-1' });
    database.user.findFirst.mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-1' }] });
    await expect(service.assignTask('task-1', { assigneeUserId: 'own-faculty' }, hod)).resolves.toEqual({ id: 'a-1' });
  });

  it('reports a duplicate assignment as a conflict', async () => {
    database.user.findFirst.mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-1' }] });
    database.taskAssignment.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.assignTask('task-1', { assigneeUserId: 'own-faculty' }, hod)).rejects.toMatchObject({ response: { code: 'ALREADY_ASSIGNED' } });
  });

  it('keeps an HOD from assigning on a task outside their department, even one assigned to them', async () => {
    database.task.findFirst.mockResolvedValueOnce({ id: 'task-2', title: 'College report', departmentId: null });
    database.user.findFirst.mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-1' }] });
    await expect(service.assignTask('task-2', { assigneeUserId: 'own-faculty' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.taskAssignment.create).not.toHaveBeenCalled();
  });
});

describe('TasksService tasks assigned to an HOD', () => {
  const hod: AuthorizationContext = { userId: 'hod-1', collegeId: 'college-1', roles: ['HOD'], permissions: [], departmentId: 'dept-1' };
  const database = { task: { findFirst: jest.fn(), update: jest.fn() } };
  const service = new TasksService(database as unknown as DatabaseService, {} as EventsService);
  const lastQuery = () => database.task.findFirst.mock.calls.at(-1)?.[0] as { where: Record<string, unknown>; include: { assignments: { where?: unknown } } };
  beforeEach(() => jest.clearAllMocks());

  it('opens their department tasks and any task assigned to them', async () => {
    database.task.findFirst.mockResolvedValue({ id: 'task-1', departmentId: 'dept-1' });
    await service.getTask('task-1', hod);
    expect(lastQuery().where).toEqual({
      id: 'task-1',
      collegeId: 'college-1',
      OR: [{ departmentId: 'dept-1' }, { assignments: { some: { assigneeUserId: 'hod-1', collegeId: 'college-1' } } }],
    });
    expect(lastQuery().include.assignments.where).toEqual({ OR: [{ assigneeUserId: 'hod-1' }, { task: { departmentId: 'dept-1' } }] });
  });

  it('manages their department tasks but only works on the ones from elsewhere', async () => {
    database.task.findFirst.mockResolvedValueOnce({ id: 'task-1', departmentId: 'dept-1' });
    await expect(service.getTask('task-1', hod)).resolves.toMatchObject({ canManage: true });
    database.task.findFirst.mockResolvedValueOnce({ id: 'task-2', departmentId: 'dept-2' });
    await expect(service.getTask('task-2', hod)).resolves.toMatchObject({ canManage: false });
    database.task.findFirst.mockResolvedValueOnce({ id: 'task-3', departmentId: null });
    await expect(service.getTask('task-3', hod)).resolves.toMatchObject({ canManage: false });
  });

  it('cannot edit a task from another department', async () => {
    database.task.findFirst.mockResolvedValueOnce({ id: 'task-2', departmentId: 'dept-2', assignments: [{ assigneeUserId: 'hod-1' }] });
    await expect(service.updateTask('task-2', { title: 'Changed' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.task.update).not.toHaveBeenCalled();
  });
});

describe('TasksController roles', () => {
  it('keeps every task read to staff', () => {
    const roles = (handler: keyof TasksController) => Reflect.getMetadata(REQUIRED_ROLES, TasksController.prototype[handler]);
    for (const handler of ['listTasks', 'listMyAssignments', 'getMyAssignmentStats', 'getTask'] as const) {
      expect(roles(handler)).toEqual(['ADMIN', 'HOD', 'FACULTY']);
    }
  });
});
