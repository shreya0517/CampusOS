import { Body, Controller, Get, Header, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseAccountStatusDto, parseStudentAccountDto, parseCreateStudentDto, parseEnrollmentDto, parseStudentListQuery, parseUpdateMyContactDto, parseUpdateStudentDto } from './students.dto';
import { StudentsService } from './students.service';
import { StudentRecordService } from './student-record.service';

@Controller('students')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class StudentsController {
  constructor(
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(StudentRecordService) private readonly records: StudentRecordService,
  ) {}
  @Post() @RequireRoles('ADMIN') create(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.create(parseCreateStudentDto(body), context); }
  @Get() @RequireRoles('ADMIN', 'HOD', 'FACULTY') list(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.list(parseStudentListQuery(query), context); }
  @Get('sections') @RequireRoles('ADMIN', 'HOD') sections(@CurrentAuthorization() context: AuthorizationContext) { return this.students.sections(context); }
  @Get('export') @RequireRoles('ADMIN') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="students.csv"') exportCsv(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.exportCsv(parseStudentListQuery(query), context); }
  @Get('me') @RequireRoles('STUDENT') me(@CurrentAuthorization() context: AuthorizationContext) { return this.students.me(context); }
  @Put('me') @RequireRoles('STUDENT') updateMe(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.updateMyContact(parseUpdateMyContactDto(body), context); }
  @Get(':id') @RequireRoles('ADMIN', 'HOD', 'FACULTY', 'STUDENT') get(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) { return this.students.get(id, context); }
  @Put(':id') @RequireRoles('ADMIN', 'HOD') update(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.update(id, parseUpdateStudentDto(body), context); }
  @Get(':id/record') @RequireRoles('ADMIN', 'HOD') record(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) { return this.records.record(id, context); }
  @Post(':id/account') @RequireRoles('ADMIN') createAccount(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.createAccount(id, parseStudentAccountDto(body), context); }
  @Post(':id/account/password') @RequireRoles('ADMIN') resetAccountPassword(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) { return this.students.resetAccountPassword(id, context); }
  @Put(':id/account') @RequireRoles('ADMIN') setAccountStatus(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.setAccountStatus(id, parseAccountStatusDto(body), context); }
  @Post(':id/enrollments') @RequireRoles('ADMIN') enroll(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.enroll(id, parseEnrollmentDto(body), context); }
}