import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { AttendanceService } from './attendance.service';
import { parseAttendanceListQuery, parseAttendanceReportQuery, parseClassListQuery, parseCreateAttendanceDto, parseMyAttendanceQuery, parseUpdateAttendanceDto } from './attendance.dto';
import { AttendanceReportService } from './attendance-report.service';

@Controller()
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class AttendanceController {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(AttendanceReportService) private readonly reports: AttendanceReportService,
  ) {}

  @Get('classes')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  listClasses(@Query() q: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.listClasses(parseClassListQuery(q), c);
  }

  @Get('classes/mine')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  myClasses(@CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.listMyClasses(c);
  }

  @Get('classes/:id/overview')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  classOverview(@Param('id') id: string, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.getClassOverview(id, c);
  }

  // Admin decision 2: Admin monitors attendance but does not mark or edit it; faculty mark, and the HOD corrects after
  // the faculty correction window.
  @Post('attendance')
  @RequireRoles('HOD', 'FACULTY')
  create(@Body() b: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.createAttendance(parseCreateAttendanceDto(b), c);
  }

  @Get('attendance')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  list(@Query() q: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.listAttendance(parseAttendanceListQuery(q), c);
  }

  @Get('attendance/report')
  @RequireRoles('ADMIN', 'HOD')
  report(@Query() q: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.reports.report(parseAttendanceReportQuery(q), c);
  }

  @Get('attendance/me')
  @RequireRoles('STUDENT')
  me(@Query() q: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.getMyAttendance(parseMyAttendanceQuery(q), c);
  }

  @Get('attendance/:id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  get(@Param('id') id: string, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.getAttendance(id, c);
  }

  @Get('attendance/:id/history')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  history(@Param('id') id: string, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.getAttendanceHistory(id, c);
  }

  @Put('attendance/:id')
  @RequireRoles('HOD', 'FACULTY')
  update(@Param('id') id: string, @Body() b: unknown, @CurrentAuthorization() c: AuthorizationContext) {
    return this.attendance.updateAttendance(id, parseUpdateAttendanceDto(b), c);
  }
}
