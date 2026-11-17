import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { TasksService } from './tasks.service';
import {
  parseAssignTaskDto,
  parseCreateTaskDto,
  parseReviewTaskDto,
  parseSubmitTaskDto,
  parseTaskListQuery,
  parseUpdateAssignmentStatusDto,
  parseUpdateTaskDto,
} from './tasks.dto';

@Controller('tasks')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class TasksController {
  constructor(@Inject(TasksService) private readonly service: TasksService) {}

  @Post()
  @RequireRoles('ADMIN', 'HOD')
  async createTask(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateTaskDto(body);
    return this.service.createTask(input, context);
  }

  @Get()
  async listTasks(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseTaskListQuery(query);
    return this.service.listTasks(parsed, context);
  }

  @Get('my')
  async listMyAssignments(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.listMyAssignments(context);
  }

  @Get('my/stats')
  async getMyAssignmentStats(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getMyAssignmentStats(context);
  }

  @Get(':id')
  async getTask(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getTask(id, context);
  }

  @Put(':id')
  @RequireRoles('ADMIN', 'HOD')
  async updateTask(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseUpdateTaskDto(body);
    return this.service.updateTask(id, input, context);
  }

  @Delete(':id')
  @RequireRoles('ADMIN')
  async deleteTask(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.deleteTask(id, context);
  }

  @Post(':id/assign')
  @RequireRoles('ADMIN', 'HOD')
  async assignTask(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseAssignTaskDto(body);
    return this.service.assignTask(id, input, context);
  }

  @Put('assignments/:assignmentId/status')
  @RequireRoles('FACULTY', 'HOD')
  async updateMyAssignment(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseUpdateAssignmentStatusDto(body);
    return this.service.updateMyAssignment(assignmentId, input, context);
  }

  @Post('assignments/:assignmentId/submit')
  @RequireRoles('FACULTY', 'HOD')
  async submitTask(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseSubmitTaskDto(body);
    return this.service.submitTask(assignmentId, input, context);
  }

  @Put('assignments/:assignmentId/review')
  @RequireRoles('ADMIN', 'HOD')
  async reviewSubmission(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
    @CurrentAuthorization() context: AuthorizationContext,
  ) {
    const input = parseReviewTaskDto(body);
    return this.service.reviewSubmission(assignmentId, input, context);
  }
}
