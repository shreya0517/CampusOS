import { EventsService } from './events.service';
import { TASK_EVENTS, type TaskEventPayload, collegeRoom, departmentRoom, userRoom } from './events.types';

describe('EventsService', () => {
  let service: EventsService;
  let mockServer: {
    to: jest.Mock;
  };
  let emitMock: jest.Mock;

  const mockPayload: TaskEventPayload = {
    taskId: 'task-1',
    title: 'Test Task',
    status: 'PENDING',
    priority: 'HIGH',
    departmentId: 'dept-1',
    actorUserId: 'user-1',
    actorName: 'user-1',
    summary: 'Task created',
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    service = new EventsService();
    emitMock = jest.fn();
    mockServer = {
      to: jest.fn().mockReturnValue({ emit: emitMock }),
    };
  });

  it('handles emissions gracefully when server reference is not set', () => {
    expect(() => {
      service.emitTaskCreated(mockPayload, 'college-1', 'dept-1');
    }).not.toThrow();
  });

  describe('when server is registered', () => {
    beforeEach(() => {
      service.setServer(mockServer as never);
    });

    it('emitTaskCreated emits to college and department rooms', () => {
      service.emitTaskCreated(mockPayload, 'college-1', 'dept-1');

      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(mockServer.to).toHaveBeenCalledWith(departmentRoom('college-1', 'dept-1'));
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.CREATED, mockPayload);
    });

    it('emitTaskCreated emits only to college room when departmentId is null', () => {
      service.emitTaskCreated(mockPayload, 'college-1', null);

      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(mockServer.to).not.toHaveBeenCalledWith(expect.stringContaining('department:'));
    });

    it('emitTaskAssigned emits to user room and college room', () => {
      service.emitTaskAssigned(mockPayload, 'college-1', 'assignee-42');

      expect(mockServer.to).toHaveBeenCalledWith(userRoom('assignee-42'));
      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.ASSIGNED, mockPayload);
    });

    it('emitTaskStarted emits to college and actor user room', () => {
      service.emitTaskStarted(mockPayload, 'college-1');

      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(mockServer.to).toHaveBeenCalledWith(userRoom(mockPayload.actorUserId));
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.STARTED, mockPayload);
    });

    it('emitTaskSubmitted emits to college and department room', () => {
      service.emitTaskSubmitted(mockPayload, 'college-1', 'dept-1');

      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(mockServer.to).toHaveBeenCalledWith(departmentRoom('college-1', 'dept-1'));
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.SUBMITTED, mockPayload);
    });

    it('emitTaskReviewed emits to assignee user room and college room', () => {
      service.emitTaskReviewed(mockPayload, 'college-1', 'assignee-42');

      expect(mockServer.to).toHaveBeenCalledWith(userRoom('assignee-42'));
      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.REVIEWED, mockPayload);
    });

    it('emitTaskUpdated emits to college and department rooms', () => {
      service.emitTaskUpdated(mockPayload, 'college-1', 'dept-1');

      expect(mockServer.to).toHaveBeenCalledWith(collegeRoom('college-1'));
      expect(mockServer.to).toHaveBeenCalledWith(departmentRoom('college-1', 'dept-1'));
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.UPDATED, mockPayload);
    });
  });
});
