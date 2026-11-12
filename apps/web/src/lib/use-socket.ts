'use client';

import { useEffect, useRef } from 'react';
import { subscribe, getSocket, disconnectSocket, isSocketConnected } from './socket';

/* ─── Event names (mirror of backend events.types.ts) ──────────────────── */

export const TASK_EVENTS = {
  CREATED: 'task:created',
  ASSIGNED: 'task:assigned',
  STARTED: 'task:started',
  SUBMITTED: 'task:submitted',
  REVIEWED: 'task:reviewed',
  UPDATED: 'task:updated',
} as const;

export type TaskEventPayload = {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  departmentId: string | null;
  assignmentId?: string;
  actorUserId: string;
  actorName: string;
  assigneeUserId?: string;
  summary: string;
  timestamp: string;
};

/**
 * Hook that subscribes to one or more task events and calls the handler.
 * Cleans up listeners on unmount. Prevents duplicate subscriptions.
 *
 * @param events - Array of event names to listen for.
 * @param handler - Callback invoked with event name and payload.
 *
 * @example
 * useTaskEvents(
 *   [TASK_EVENTS.ASSIGNED, TASK_EVENTS.REVIEWED],
 *   (event, payload) => {
 *     console.log(`${event}:`, payload);
 *     reloadTasks();
 *   },
 * );
 */
export function useTaskEvents(
  events: string[],
  handler: (event: string, payload: TaskEventPayload) => void,
): void {
  // Use a ref to avoid re-subscribing when the handler identity changes.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    for (const event of events) {
      const unsub = subscribe<TaskEventPayload>(event, (payload) => {
        handlerRef.current(event, payload);
      });
      unsubscribers.push(unsub);
    }

    return () => {
      for (const unsub of unsubscribers) unsub();
    };
  }, [events.join(',')]); // Re-subscribe only when the event list actually changes.
}

/**
 * Hook that initialises the WebSocket connection when the user is authenticated,
 * and disconnects on logout. Should be called once in the app shell or auth provider.
 */
export function useSocketConnection(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return;
    }

    try {
      getSocket();
    } catch {
      // No token available yet — will connect when token arrives.
    }

    return () => {
      // Component unmount — don't disconnect globally; the provider handles that.
    };
  }, [isAuthenticated]);
}

export { disconnectSocket, isSocketConnected };
