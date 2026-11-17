/**
 * WebSocket event types and payloads.
 *
 * Events are server → client only. The WebSocket channel is used for real-time
 * notifications; all mutations remain on the REST API.
 */

/* ─── Room naming ──────────────────────────────────────────────────────────── */

/** Room scoped to an entire college. */
export const collegeRoom = (collegeId: string): string => `college:${collegeId}`;

/** Room scoped to a single user across all their tabs. */
export const userRoom = (userId: string): string => `user:${userId}`;

/** Room scoped to a role within a college. */
export const roleRoom = (collegeId: string, role: string): string => `role:${collegeId}:${role}`;

/** Room scoped to a department within a college. */
export const departmentRoom = (collegeId: string, departmentId: string): string =>
  `department:${collegeId}:${departmentId}`;

/* ─── Event names ──────────────────────────────────────────────────────────── */

export const TASK_EVENTS = {
  CREATED: 'task:created',
  ASSIGNED: 'task:assigned',
  STARTED: 'task:started',
  SUBMITTED: 'task:submitted',
  REVIEWED: 'task:reviewed',
  UPDATED: 'task:updated',
} as const;

/* ─── Event payloads ───────────────────────────────────────────────────────── */

export type TaskEventPayload = {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  departmentId: string | null;
  /** Assignment-level id (present for assign/start/submit/review events). */
  assignmentId?: string;
  /** User id of the person who triggered the action. */
  actorUserId: string;
  /** Display name of the actor. */
  actorName: string;
  /** User id the assignment targets (present on assign/start/submit/review). */
  assigneeUserId?: string;
  /** Human-readable summary (e.g. "Dr. Rohan Das submitted work on Data Structures Lab"). */
  summary: string;
  /** ISO timestamp of the event. */
  timestamp: string;
};
