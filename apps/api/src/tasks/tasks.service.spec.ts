import { ForbiddenException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import type { DatabaseService } from '../database.service';
import type { EventsService } from '../events/events.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { TaskPriority, TaskStatus } from '@prisma/client';

type MockDb = {
  task: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  taskAssignment: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  faculty: {
    findFirst: jest.Mock;
  };
  user: {
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
        delete: jest.fn(),
      },
      taskAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      faculty: {
        findFirst: jest.fn(),
      },
      // Assignees are active faculty in department dept-1 unless a test says otherwise.
      user: {
        findFirst: jest.fn().mockResolvedValue({ facultyProfiles: [{ departmentId: 'dept-1' }] }),
      },
    };

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
      deadline: new Date('2026-12-01'),
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
      mockDatabase.taskAssignment.update.mockResolvedValue({ ...existing, status: TaskStatus.IN_PROGRESS });

      await service.updateMyAssignment('assign-1', { status: TaskStatus.IN_PROGRESS }, facultyContext);

      expect(mockEventsService.emitTaskStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'task-100',
          assignmentId: 'assign-1',
          assigneeUserId: facultyContext.userId,
        }),
        'college-1',
      );
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
      mockDatabase.taskAssignment.findFirst.mockResolvedValue(existing);
      mockDatabase.taskAssignment.update.mockResolvedValue({ ...existing, status: TaskStatus.SUBMITTED });

      await service.submitTask('assign-1', { content: 'All graded' }, facultyContext);

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
      mockDatabase.taskAssignment.findFirst.mockResolvedValue(existing);
      mockDatabase.taskAssignment.update.mockResolvedValue({ ...existing, status: TaskStatus.APPROVED });
      mockDatabase.taskAssignment.findMany.mockResolvedValue([{ status: TaskStatus.APPROVED }]);
      mockDatabase.task.update.mockResolvedValue({});

      await service.reviewSubmission('assign-1', { decision: 'APPROVED', notes: 'Great job' }, adminContext);

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

describe('TasksService assignment boundaries', () => {
  const hod: AuthorizationContext = { userId: 'hod-1', collegeId: 'college-1', roles: ['HOD'], permissions: [], departmentId: 'dept-1' };
  const admin: AuthorizationContext = { userId: 'admin-1', collegeId: 'college-1', roles: ['ADMIN'], permissions: [], departmentId: null };
  const database = {
    task: { findFirst: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Report', departmentId: 'dept-1' }) },
    taskAssignment: { create: jest.fn() },
    user: { findFirst: jest.fn() },
  };
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
});
