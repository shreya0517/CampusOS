import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { AnnouncementsService } from './announcements.service';
import { parseAnnouncementListQuery, parseCreateAnnouncementDto } from './announcements.dto';

@Controller('announcements')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class AnnouncementsController {
  constructor(@Inject(AnnouncementsService) private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.list(parseAnnouncementListQuery(query), context);
  }

  @Post()
  @RequireRoles('ADMIN')
  create(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.announcements.create(parseCreateAnnouncementDto(body), context);
  }
}
