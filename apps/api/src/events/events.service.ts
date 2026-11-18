import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  departmentHeadsRoom,
  roleRoom,
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
  // A task event reaches the college's Admins, the HODs of the task's department, and the people working on it.
  // Never the whole college: students and other staff must not see task titles, assignees or review outcomes.

  emitTaskCreated(payload: TaskEventPayload, collegeId: string, departmentId: string | null): void {
    this.emitTask(TASK_EVENTS.CREATED, payload, collegeId, departmentId, []);
  }

  emitTaskAssigned(payload: TaskEventPayload, collegeId: string, assigneeUserId: string): void {
    this.emitTask(TASK_EVENTS.ASSIGNED, payload, collegeId, payload.departmentId, [assigneeUserId]);
  }

  /** Also to the assignee's other tabs. */
  emitTaskStarted(payload: TaskEventPayload, collegeId: string): void {
    this.emitTask(TASK_EVENTS.STARTED, payload, collegeId, payload.departmentId, [payload.actorUserId]);
  }

  emitTaskSubmitted(payload: TaskEventPayload, collegeId: string, departmentId: string | null): void {
    this.emitTask(TASK_EVENTS.SUBMITTED, payload, collegeId, departmentId, [payload.actorUserId]);
  }

  emitTaskReviewed(payload: TaskEventPayload, collegeId: string, assigneeUserId: string): void {
    this.emitTask(TASK_EVENTS.REVIEWED, payload, collegeId, payload.departmentId, [assigneeUserId]);
  }

  /** An edit to the task itself also reaches everyone assigned to it. */
  emitTaskUpdated(payload: TaskEventPayload, collegeId: string, departmentId: string | null, assigneeUserIds: string[] = []): void {
    this.emitTask(TASK_EVENTS.UPDATED, payload, collegeId, departmentId, assigneeUserIds);
  }

  private emitTask(event: string, payload: TaskEventPayload, collegeId: string, departmentId: string | null, userIds: string[]): void {
    const rooms = [roleRoom(collegeId, 'ADMIN'), ...(departmentId ? [departmentHeadsRoom(collegeId, departmentId)] : []), ...userIds.map(userRoom)];
    // One emit to all the rooms, so someone in several of them (an Admin who is also the assignee) gets it once.
    this.emitToRooms([...new Set(rooms)], event, payload);
  }

  /** Sends an event to every open connection of one user (their personal room). */
  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emitToRoom(userRoom(userId), event, payload);
  }

  /* ─── Helpers ──────────────────────────────────────────────────────────── */

  private emitToRoom(room: string, event: string, payload: unknown): void {
    this.emitToRooms([room], event, payload);
  }

  private emitToRooms(rooms: string[], event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Cannot emit ${event}: Socket.IO server not ready.`);
      return;
    }
    this.server.to(rooms).emit(event, payload);
  }
}
