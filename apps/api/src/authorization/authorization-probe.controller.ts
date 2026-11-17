import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { CurrentAuthorization, RequirePermissions, RequireRoles } from './authorization.decorator';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';
import type { AuthorizationContext } from './authorization.types';

@Controller('authorization/probes')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class AuthorizationProbeController {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  @Get('tenant/:collegeId')
  @RequireRoles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('TENANT_READ')
  tenant(@Param('collegeId') collegeId: string, @CurrentAuthorization() context: AuthorizationContext) {
    this.authorization.assertTenant(context, collegeId);
    return { scope: 'tenant', collegeId };
  }

  @Get('department/:collegeId/:departmentId')
  @RequireRoles('HOD', 'ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('DEPARTMENT_READ')
  async department(@Param('collegeId') collegeId: string, @Param('departmentId') departmentId: string, @CurrentAuthorization() context: AuthorizationContext) {
    const department = await this.authorization.findDepartmentProbe(context, collegeId, departmentId);
    return { scope: 'department', departmentId: department.id };
  }

  @Get('platform/tenant/:collegeId')
  @RequireRoles('SUPER_ADMIN')
  @RequirePermissions('TENANT_MANAGE')
  platformTenant(@Param('collegeId') collegeId: string, @CurrentAuthorization() context: AuthorizationContext) {
    this.authorization.assertTenant(context, collegeId);
    return { scope: 'platform-tenant', collegeId };
  }
}
