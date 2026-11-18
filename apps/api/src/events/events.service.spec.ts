import { EventsService } from './events.service';
import { TASK_EVENTS, type TaskEventPayload, collegeRoom, departmentHeadsRoom, departmentRoom, roleRoom, userRoom } from './events.types';

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
    const admins = roleRoom('college-1', 'ADMIN');
    const heads = departmentHeadsRoom('college-1', 'dept-1');
    const sentTo = (): string[] => mockServer.to.mock.calls.flatMap(([rooms]) => (Array.isArray(rooms) ? rooms : [rooms]));

    afterEach(() => {
      // Never the whole college, and never the department's faculty at large.
      expect(sentTo()).not.toContain(collegeRoom('college-1'));
      expect(sentTo()).not.toContain(departmentRoom('college-1', 'dept-1'));
      // One emit per event, so nobody gets it twice.
      expect(mockServer.to).toHaveBeenCalledTimes(1);
    });

    it('sends a new task to admins and the HODs of its department', () => {
      service.emitTaskCreated(mockPayload, 'college-1', 'dept-1');
      expect(mockServer.to).toHaveBeenCalledWith([admins, heads]);
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.CREATED, mockPayload);
    });

    it('sends a college-wide task to admins only', () => {
      service.emitTaskCreated({ ...mockPayload, departmentId: null }, 'college-1', null);
      expect(mockServer.to).toHaveBeenCalledWith([admins]);
    });

    it('sends an assignment to the assignee, admins and the HODs', () => {
      service.emitTaskAssigned(mockPayload, 'college-1', 'assignee-42');
      expect(mockServer.to).toHaveBeenCalledWith([admins, heads, userRoom('assignee-42')]);
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.ASSIGNED, mockPayload);
    });

    it("sends a start to the assignee's other tabs, admins and the HODs", () => {
      service.emitTaskStarted(mockPayload, 'college-1');
      expect(mockServer.to).toHaveBeenCalledWith([admins, heads, userRoom('user-1')]);
    });

    it('sends a submission to admins, the HODs and the submitter', () => {
      service.emitTaskSubmitted(mockPayload, 'college-1', 'dept-1');
      expect(mockServer.to).toHaveBeenCalledWith([admins, heads, userRoom('user-1')]);
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.SUBMITTED, mockPayload);
    });

    it('sends a review to the assignee, admins and the HODs', () => {
      service.emitTaskReviewed(mockPayload, 'college-1', 'faculty-1');
      expect(mockServer.to).toHaveBeenCalledWith([admins, heads, userRoom('faculty-1')]);
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.REVIEWED, mockPayload);
    });

    it('sends an edit to admins, the HODs and every assignee, once each', () => {
      service.emitTaskUpdated(mockPayload, 'college-1', 'dept-1', ['faculty-1', 'faculty-2', 'faculty-1']);
      expect(mockServer.to).toHaveBeenCalledWith([admins, heads, userRoom('faculty-1'), userRoom('faculty-2')]);
      expect(emitMock).toHaveBeenCalledWith(TASK_EVENTS.UPDATED, mockPayload);
    });
  });
});
