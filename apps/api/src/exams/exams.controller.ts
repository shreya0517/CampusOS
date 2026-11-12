import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { ExamsService } from './exams.service';
import {
  parseCreateExamDto,
  parseCreateExamSubjectDto,
  parseExamListQuery,
  parseUpdateExamDto,
  parseUpdateMarksDto,
} from './exams.dto';

@Controller('exams')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class ExamsController {
  constructor(@Inject(ExamsService) private readonly service: ExamsService) {}

  @Post()
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async createExam(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateExamDto(body);
    return this.service.createExam(input, context);
  }

  @Get()
  async listExams(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseExamListQuery(query);
    return this.service.listExams(parsed, context);
  }

  @Get('me/results')
  @RequireRoles('STUDENT')
  async getMyResults(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getMyResults(context);
  }

  @Get(':id')
  async getExam(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getExam(id, context);
  }

  @Put(':id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async updateExam(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseUpdateExamDto(body);
    return this.service.updateExam(id, input, context);
  }

  @Delete(':id')
  @RequireRoles('ADMIN', 'HOD')
  async deleteExam(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.deleteExam(id, context);
  }

  @Post(':id/subjects')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async addExamSubject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseCreateExamSubjectDto(body);
    return this.service.addExamSubject(id, input, context);
  }

  @Delete(':id/subjects/:examSubjectId')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async removeExamSubject(
    @Param('id') id: string,
    @Param('examSubjectId') examSubjectId: string,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.service.removeExamSubject(id, examSubjectId, context);
  }

  @Get(':id/subjects/:examSubjectId/marks')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async getSubjectMarks(
    @Param('id') _id: string,
    @Param('examSubjectId') examSubjectId: string,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    return this.service.getSubjectMarks(examSubjectId, context);
  }

  @Put(':id/subjects/:examSubjectId/marks')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async updateSubjectMarks(
    @Param('id') _id: string,
    @Param('examSubjectId') examSubjectId: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseUpdateMarksDto(body);
    return this.service.updateSubjectMarks(examSubjectId, input, context);
  }

  @Post(':id/calculate-results')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async calculateAndPublishResults(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.calculateAndPublishResults(id, context);
  }

  @Get(':id/results')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async listExamResults(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.listExamResults(id, context);
  }
}
