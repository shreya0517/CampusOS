import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { InstitutionOverviewService } from './institution-overview.service';

@Controller('overview')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class OverviewController {
  constructor(@Inject(InstitutionOverviewService) private readonly institution: InstitutionOverviewService) {}

  @Get('institution')
  @RequireRoles('ADMIN')
  async institutionOverview(@CurrentAuthorization() context: AuthorizationContext) {
    return this.institution.overview(context);
  }
}
