import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { NotificationCategory } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { EventsService } from '../events/events.service';
import type { AuthorizationContext } from '../authorization/authorization.types';

export type NotificationInput = { category: NotificationCategory; title: string; body: string; link?: string | null };
export type NotificationListQuery = { category?: NotificationCategory; unreadOnly: boolean; page: number; pageSize: number };

/** Live event pushed to a user's socket room when a notification is stored for them. */
export const NOTIFICATION_EVENT = 'notification:new';
/** Rows are written in batches of this size, so a college-wide announcement doesn't become one huge insert. */
const BATCH_SIZE = 500;

const notificationSelect = { id: true, category: true, title: true, body: true, link: true, readAt: true, createdAt: true } as const;

/**
 * In-app notifications: stored so people see them after signing in again, and pushed live over Socket.IO to anyone
 * connected. Producers call `notify` after their own change has been saved; a failure here is logged and never undoes
 * or fails that change.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  async notify(collegeId: string, userIds: Iterable<string | null | undefined>, input: NotificationInput): Promise<void> {
    const recipients = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
    if (!recipients.length) return;
    try {
      const now = new Date();
      for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
        await this.database.notification.createMany({
          data: recipients.slice(start, start + BATCH_SIZE).map((userId) => ({
            collegeId,
            userId,
            channel: 'IN_APP' as const,
            status: 'SENT' as const,
            category: input.category,
            title: input.title.slice(0, 200),
            body: input.body.slice(0, 1000),
            link: input.link ?? null,
            sentAt: now,
          })),
        });
      }
      for (const userId of recipients) this.events.emitToUser(userId, NOTIFICATION_EVENT, { category: input.category, title: input.title, link: input.link ?? null });
    } catch (error) {
      this.logger.error(`Could not store a ${input.category} notification for ${recipients.length} user(s): ${(error as Error).message}`);
    }
  }

  /**
   * Runs a producer's recipient lookups and notify calls without letting a failure reach the caller: the action that
   * raised the notification has already been saved, so an error here must not turn into a failed (and retried) request.
   */
  async safely(work: (notifications: NotificationsService) => Promise<void>): Promise<void> {
    try {
      await work(this);
    } catch (error) {
      this.logger.error(`Could not send notifications: ${(error as Error).message}`);
    }
  }

  /** Active users holding any of the given roles in the college. */
  async usersWithRoles(collegeId: string, roles: string[]): Promise<string[]> {
    const users = await this.database.user.findMany({ where: { collegeId, status: 'ACTIVE', userRoles: { some: { role: { name: { in: roles } } } } }, select: { id: true } });
    return users.map((user) => user.id);
  }

  /** The HOD(s) of a department: users with the HOD role whose faculty profile is in it. */
  async hodsOf(collegeId: string, departmentId: string | null | undefined): Promise<string[]> {
    if (!departmentId) return [];
    const hods = await this.database.faculty.findMany({
      where: { collegeId, departmentId, userId: { not: null }, user: { is: { status: 'ACTIVE', userRoles: { some: { role: { name: 'HOD' } } } } } },
      select: { userId: true },
    });
    return hods.map((hod) => hod.userId as string);
  }

  /** Sign-in accounts of the given students (those without an account are skipped). */
  async studentUsers(collegeId: string, studentIds: string[]): Promise<string[]> {
    if (!studentIds.length) return [];
    const students = await this.database.student.findMany({ where: { collegeId, id: { in: studentIds }, userId: { not: null } }, select: { userId: true } });
    return students.map((student) => student.userId as string);
  }

  async list(query: NotificationListQuery, context: AuthorizationContext) {
    const where = { collegeId: context.collegeId, userId: context.userId, ...(query.category ? { category: query.category } : {}), ...(query.unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      this.database.notification.findMany({ where, select: notificationSelect, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.notification.count({ where }),
      this.unreadCount(context),
    ]);
    return { items, total, unread, page: query.page, pageSize: query.pageSize };
  }

  unreadCount(context: AuthorizationContext): Promise<number> {
    return this.database.notification.count({ where: { collegeId: context.collegeId, userId: context.userId, readAt: null } });
  }

  /** Marks one of the caller's own notifications as read; someone else's is reported as not found. */
  async markRead(id: string, context: AuthorizationContext) {
    const result = await this.database.notification.updateMany({ where: { id, collegeId: context.collegeId, userId: context.userId, readAt: null }, data: { readAt: new Date(), status: 'READ' } });
    if (result.count === 0) {
      const exists = await this.database.notification.findFirst({ where: { id, collegeId: context.collegeId, userId: context.userId }, select: { id: true } });
      if (!exists) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification was not found.' });
    }
    return { unread: await this.unreadCount(context) };
  }

  async markAllRead(context: AuthorizationContext, category?: NotificationCategory) {
    const result = await this.database.notification.updateMany({
      where: { collegeId: context.collegeId, userId: context.userId, readAt: null, ...(category ? { category } : {}) },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { marked: result.count, unread: await this.unreadCount(context) };
  }
}
