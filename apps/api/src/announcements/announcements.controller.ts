import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { AnnouncementsService } from './announcements.service';
import { parseAnnouncementListQuery, parseCreateAnnouncementDto, parseManageAnnouncementQuery, parseUpdateAnnouncementDto } from './announcements.dto';

@Controller('announcements')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class AnnouncementsController {
  constructor(@Inject(AnnouncementsService) private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.list(parseAnnouncementListQuery(query), context);
  }

  @Get('manage')
  @RequireRoles('ADMIN')
  manage(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.manage(parseManageAnnouncementQuery(query), context);
  }

  @Post()
  @RequireRoles('ADMIN')
  create(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.create(parseCreateAnnouncementDto(body), context);
  }

  @Put(':id')
  @RequireRoles('ADMIN')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.update(id, parseUpdateAnnouncementDto(body), context);
  }

  @Post(':id/archive')
  @RequireRoles('ADMIN')
  archive(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.archive(id, context);
  }

  @Post(':id/restore')
  @RequireRoles('ADMIN')
  restore(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.restore(id, context);
  }
}
