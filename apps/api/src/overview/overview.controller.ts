import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { InstitutionAnalyticsService } from './institution-analytics.service';
import { InstitutionOverviewService } from './institution-overview.service';
import { parseAnalyticsQuery } from './overview.dto';

@Controller('overview')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class OverviewController {
  constructor(
    @Inject(InstitutionOverviewService) private readonly institution: InstitutionOverviewService,
    @Inject(InstitutionAnalyticsService) private readonly analytics: InstitutionAnalyticsService,
  ) {}

  @Get('institution')
  @RequireRoles('ADMIN')
  async institutionOverview(@CurrentAuthorization() context: AuthorizationContext) {
    return this.institution.overview(context);
  }

  @Get('analytics')
  @RequireRoles('ADMIN')
  async institutionAnalytics(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.analytics.analytics(parseAnalyticsQuery(query), context);
  }
}
