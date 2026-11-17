import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { AttendanceService } from './attendance.service';
import { parseAttendanceListQuery, parseClassListQuery, parseCreateAttendanceDto, parseUpdateAttendanceDto } from './attendance.dto';

@Controller()
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Get('classes')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  listClasses(@Query() q: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.listClasses(parseClassListQuery(q), c);
  }

  @Post('attendance')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  create(@Body() b: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.createAttendance(parseCreateAttendanceDto(b), c);
  }

  @Get('attendance')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  list(@Query() q: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.listAttendance(parseAttendanceListQuery(q), c);
  }

  @Get('attendance/:id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  get(@Param('id') id: string, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.getAttendance(id, c);
  }

  @Put('attendance/:id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  update(@Param('id') id: string, @Body() b: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.updateAttendance(id, parseUpdateAttendanceDto(b), c);
  }
}
