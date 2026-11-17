import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { TimetableService } from './timetable.service';
import { parseCreateTimetableDto, parseTimetableListQuery } from './timetable.dto';

@Controller('timetable')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class TimetableController {
  constructor(@Inject(TimetableService) private readonly service: TimetableService) {}

  @Post()
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async createEntry(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateTimetableDto(body);
    return this.service.createEntry(input, context);
  }

  @Get()
  async listEntries(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseTimetableListQuery(query);
    return this.service.listEntries(parsed, context);
  }

  @Get('me')
  async getMyTimetable(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getMyTimetable(context);
  }

  @Get('rooms')
  async getRooms(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getRooms(context);
  }

  @Get('classes')
  async getClasses(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getClasses(context);
  }

  @Delete(':id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async deleteEntry(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.deleteEntry(id, context);
  }
}
