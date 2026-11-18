import { Controller, Get, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseMarkAllQuery, parseNotificationListQuery } from './notifications.dto';
import { NotificationsService } from './notifications.service';

/** Everyone reads and marks only their own notifications; the user comes from the session, never the request. */
@Controller('notifications')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  @RequireRoles('ADMIN', 'HOD', 'FACULTY', 'STUDENT')
  list(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.list(parseNotificationListQuery(query), context);
  }

  @Get('unread-count')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY', 'STUDENT')
  async unreadCount(@CurrentAuthorization() context: AuthorizationContext) {
    return { unread: await this.notifications.unreadCount(context) };
  }

  @Put('read-all')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY', 'STUDENT')
  markAllRead(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.markAllRead(context, parseMarkAllQuery(query));
  }

  @Put(':id/read')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY', 'STUDENT')
  markRead(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.notifications.markRead(id, context);
  }
}
