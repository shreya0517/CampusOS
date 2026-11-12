import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { AssignmentsService } from './assignments.service';
import {
  parseAssignmentListQuery,
  parseCreateAssignmentDto,
  parseGradeSubmissionDto,
  parseSubmitAssignmentDto,
  parseUpdateAssignmentDto,
} from './assignments.dto';

@Controller('assignments')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class AssignmentsController {
  constructor(@Inject(AssignmentsService) private readonly service: AssignmentsService) {}

  @Post()
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async createAssignment(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateAssignmentDto(body);
    return this.service.createAssignment(input, context);
  }

  @Get()
  async listAssignments(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseAssignmentListQuery(query);
    return this.service.listAssignments(parsed, context);
  }

  @Get(':id')
  async getAssignment(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getAssignment(id, context);
  }

  @Put(':id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async updateAssignment(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseUpdateAssignmentDto(body);
    return this.service.updateAssignment(id, input, context);
  }

  @Delete(':id')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async deleteAssignment(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.deleteAssignment(id, context);
  }

  @Post(':id/submissions')
  @RequireRoles('STUDENT')
  async submitAssignment(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseSubmitAssignmentDto(body);
    return this.service.submitAssignment(id, input, context);
  }

  @Get(':id/submissions')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async listSubmissions(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.listSubmissions(id, context);
  }

  @Put(':id/submissions/:submissionId/grade')
  @RequireRoles('ADMIN', 'HOD', 'FACULTY')
  async gradeSubmission(
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseGradeSubmissionDto(body);
    return this.service.gradeSubmission(id, submissionId, input, context);
  }
}
