import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { VisitorsService } from './visitors.service';
import { parseCreateVisitorDto, parseReviewVisitorDto, parseVisitorListQuery } from './visitors.dto';

@Controller('visitors')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class VisitorsController {
  constructor(@Inject(VisitorsService) private readonly service: VisitorsService) {}

  @Post()
  async registerVisitor(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseCreateVisitorDto(body);
    return this.service.registerVisitor(input, context);
  }

  @Get()
  @RequireRoles('ADMIN', 'HOD')
  async listVisitors(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseVisitorListQuery(query);
    return this.service.listVisitors(parsed, context);
  }

  @Get('my')
  async myVisitors(@CurrentAuthorization() context: AuthorizationContext) {
    return this.service.myVisitors(context);
  }

  @Get(':id')
  async getVisitor(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getVisitor(id, context);
  }

  @Put(':id/review')
  @RequireRoles('ADMIN', 'HOD')
  async reviewVisitor(@Param('id') id: string, @Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseReviewVisitorDto(body);
    return this.service.reviewVisitor(id, input, context);
  }
}
