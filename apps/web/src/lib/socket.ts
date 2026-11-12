'use client';

import { io, type Socket } from 'socket.io-client';

/**
 * Centralised Socket.IO client for CampusOS.
 *
 * Principles:
 * - One shared connection per authenticated session.
 * - Token is passed in the handshake `auth` option (not in the URL).
 * - Connection is created lazily and disconnected on logout.
 * - Auto-reconnects with exponential backoff.
 * - Listeners are managed via subscribe/unsubscribe to prevent duplicates.
 */

let socket: Socket | null = null;

const getApiBaseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
  // Socket.IO connects to the server origin, not the REST path prefix.
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return 'http://localhost:3001';
  }
};

/**
 * Get or create the shared socket connection.
 * The access token is read from sessionStorage (same location the REST client uses).
 */
export function getSocket(): Socket {
  if (socket?.connected) return socket;

  const token = typeof window !== 'undefined'
    ? window.sessionStorage.getItem('campusos_access_token')
    : null;

  if (!token) {
    throw new Error('Cannot connect to WebSocket: no access token.');
  }

  if (socket) {
    // Socket exists but may be disconnected — update auth and reconnect.
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(getApiBaseUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    // Connection established — rooms are assigned server-side.
  });

  socket.on('auth:error', () => {
    // Server rejected our auth — disconnect cleanly.
    disconnectSocket();
  });

  socket.on('connect_error', (err) => {
    // If the error is auth-related, stop reconnection attempts.
    if (err.message === 'Authentication failed.') {
      socket?.disconnect();
    }
  });

  return socket;
}

/**
 * Disconnect and destroy the socket connection.
 * Call this on logout.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check whether the socket is currently connected.
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * Subscribe to a socket event, returning an unsubscribe function.
 * Designed for use in React useEffect cleanup.
 *
 * @example
 * useEffect(() => {
 *   const unsub = subscribe('task:assigned', (data) => { ... });
 *   return unsub;
 * }, []);
 */
export function subscribe<T = unknown>(event: string, handler: (data: T) => void): () => void {
  try {
    const s = getSocket();
    s.on(event, handler as (...args: unknown[]) => void);
    return () => {
      s.off(event, handler as (...args: unknown[]) => void);
    };
  } catch {
    // No token — no-op subscribe.
    return () => undefined;
  }
}
