import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  collegeRoom,
  departmentRoom,
  userRoom,
  TASK_EVENTS,
  type TaskEventPayload,
} from './events.types';

/**
 * Centralised service that emits WebSocket events to the correct rooms.
 *
 * Domain services call methods on this service **after** a successful database
 * transaction. The gateway registers the Socket.IO server instance on startup.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private server: Server | null = null;

  /** Called once by the gateway after the server initialises. */
  setServer(server: Server): void {
    this.server = server;
    this.logger.log('Socket.IO server reference registered.');
  }

  /* ─── Task events ──────────────────────────────────────────────────────── */

  emitTaskCreated(payload: TaskEventPayload, collegeId: string, departmentId: string | null): void {
    // Notify the college-level admin room and the department room (if scoped).
    this.emitToRoom(collegeRoom(collegeId), TASK_EVENTS.CREATED, payload);
    if (departmentId) {
      this.emitToRoom(departmentRoom(collegeId, departmentId), TASK_EVENTS.CREATED, payload);
    }
  }

  emitTaskAssigned(payload: TaskEventPayload, collegeId: string, assigneeUserId: string): void {
    // Notify the assignee directly.
    this.emitToRoom(userRoom(assigneeUserId), TASK_EVENTS.ASSIGNED, payload);
    // Also notify the college-level admin room for dashboards.
    this.emitToRoom(collegeRoom(collegeId), TASK_EVENTS.ASSIGNED, payload);
  }

  emitTaskStarted(payload: TaskEventPayload, collegeId: string): void {
    this.emitToRoom(collegeRoom(collegeId), TASK_EVENTS.STARTED, payload);
    // Notify the actor's own user room (other tabs).
    this.emitToRoom(userRoom(payload.actorUserId), TASK_EVENTS.STARTED, payload);
  }

  emitTaskSubmitted(payload: TaskEventPayload, collegeId: string, departmentId: string | null): void {
    // Submitted work should reach admins and the department HOD.
    this.emitToRoom(collegeRoom(collegeId), TASK_EVENTS.SUBMITTED, payload);
    if (departmentId) {
      this.emitToRoom(departmentRoom(collegeId, departmentId), TASK_EVENTS.SUBMITTED, payload);
    }
  }

  emitTaskReviewed(payload: TaskEventPayload, collegeId: string, assigneeUserId: string): void {
    // The assignee must be notified of the review outcome.
    this.emitToRoom(userRoom(assigneeUserId), TASK_EVENTS.REVIEWED, payload);
    this.emitToRoom(collegeRoom(collegeId), TASK_EVENTS.REVIEWED, payload);
  }

  emitTaskUpdated(payload: TaskEventPayload, collegeId: string, departmentId: string | null): void {
    this.emitToRoom(collegeRoom(collegeId), TASK_EVENTS.UPDATED, payload);
    if (departmentId) {
      this.emitToRoom(departmentRoom(collegeId, departmentId), TASK_EVENTS.UPDATED, payload);
    }
  }

  /* ─── Helpers ──────────────────────────────────────────────────────────── */

  private emitToRoom(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Cannot emit ${event}: Socket.IO server not ready.`);
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
