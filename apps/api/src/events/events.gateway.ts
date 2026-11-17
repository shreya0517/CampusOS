import { Inject, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService, type AccessPayload } from '../auth/auth.service';
import { AuthorizationService } from '../authorization/authorization.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { EventsService } from './events.service';
import { collegeRoom, departmentRoom, roleRoom, userRoom } from './events.types';

/**
 * Socket metadata stored on each authenticated connection.
 * Never trust values from the client — these are derived server-side.
 */
type SocketMeta = {
  userId: string;
  collegeId: string;
  sessionId: string;
  authorization: AuthorizationContext;
};

const SOCKET_META = Symbol('socket-meta');

/**
 * Central WebSocket gateway for CampusOS.
 *
 * Security principles:
 * 1. JWT is validated during the connection handshake — not via client messages.
 * 2. All identity data (userId, collegeId, roles, departmentId) comes from the
 *    database, never from client-supplied values.
 * 3. Rooms are joined server-side only; clients cannot request room joins.
 * 4. Failed auth immediately disconnects the socket.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
  // Path: default /socket.io
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  /* ─── Lifecycle ────────────────────────────────────────────────────────── */

  afterInit(server: Server): void {
    this.events.setServer(server);
    this.logger.log('WebSocket gateway initialised.');
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const meta = await this.authenticate(client);
      this.setMeta(client, meta);
      this.joinAuthorizedRooms(client, meta);
      this.logger.log(`Socket connected: user=${meta.userId} college=${meta.collegeId} sid=${client.id}`);
    } catch (error) {
      this.logger.warn(`Socket auth failed (${client.id}): ${error instanceof Error ? error.message : 'unknown'}`);
      client.emit('auth:error', { message: 'Authentication failed.' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const meta = this.getMeta(client);
    if (meta) {
      this.logger.log(`Socket disconnected: user=${meta.userId} sid=${client.id}`);
    }
  }

  /* ─── Authentication ───────────────────────────────────────────────────── */

  /**
   * Authenticate the socket connection using the JWT access token passed in
   * the `auth.token` handshake option. The token is verified and the backing
   * session is validated against the database (catching revoked sessions).
   */
  private async authenticate(client: Socket): Promise<SocketMeta> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token || typeof token !== 'string') {
      throw new Error('Missing access token.');
    }

    // 1. Verify JWT signature and expiration.
    let payload: AccessPayload;
    try {
      payload = this.auth.verifyAccessToken(token);
    } catch {
      throw new Error('Invalid or expired access token.');
    }

    // 2. Validate session in the database (checks revoked, expired, user active).
    const user = await this.auth.authorizeAccessToken(token);

    // 3. Resolve full authorization context (roles, permissions, departmentId).
    const authorization = await this.authorization.getContext(user);

    return {
      userId: user.id,
      collegeId: user.collegeId,
      sessionId: payload.sid,
      authorization,
    };
  }

  /* ─── Room assignment ──────────────────────────────────────────────────── */

  /**
   * Server-controlled room joins based on the authenticated context.
   * The client never requests rooms — they are derived from the user's
   * college, roles, and department.
   */
  private joinAuthorizedRooms(client: Socket, meta: SocketMeta): void {
    const ctx = meta.authorization;

    // 1. College room — every authenticated user in this tenant.
    client.join(collegeRoom(ctx.collegeId));

    // 2. User-specific room — for targeted notifications.
    client.join(userRoom(ctx.userId));

    // 3. Role rooms — for role-targeted broadcasts.
    for (const role of ctx.roles) {
      client.join(roleRoom(ctx.collegeId, role));
    }

    // 4. Department room — for HOD / faculty scoped to a department.
    if (ctx.departmentId) {
      client.join(departmentRoom(ctx.collegeId, ctx.departmentId));
    }
  }

  /* ─── Socket metadata helpers ──────────────────────────────────────────── */

  private setMeta(client: Socket, meta: SocketMeta): void {
    (client as unknown as Record<symbol, SocketMeta>)[SOCKET_META] = meta;
  }

  private getMeta(client: Socket): SocketMeta | undefined {
    return (client as unknown as Record<symbol, SocketMeta | undefined>)[SOCKET_META];
  }
}
