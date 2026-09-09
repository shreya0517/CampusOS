import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseCreateStudentDto, parseEnrollmentDto, parseStudentListQuery, parseUpdateStudentDto } from './students.dto';
import { StudentsService } from './students.service';

@Controller('students')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class StudentsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}
  @Post() @RequireRoles('ADMIN', 'HOD') create(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.create(parseCreateStudentDto(body), context); }
  @Get() @RequireRoles('ADMIN', 'HOD', 'FACULTY') list(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.list(parseStudentListQuery(query), context); }
  @Get('me') @RequireRoles('STUDENT') me(@CurrentAuthorization() context: AuthorizationContext) { return this.students.me(context); }
  @Get(':id') @RequireRoles('ADMIN', 'HOD', 'FACULTY', 'STUDENT') get(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) { return this.students.get(id, context); }
  @Put(':id') @RequireRoles('ADMIN', 'HOD') update(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.update(id, parseUpdateStudentDto(body), context); }
  @Post(':id/enrollments') @RequireRoles('ADMIN', 'HOD') enroll(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) { return this.students.enroll(id, parseEnrollmentDto(body), context); }
}