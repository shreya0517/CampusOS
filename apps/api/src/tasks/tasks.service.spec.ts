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
