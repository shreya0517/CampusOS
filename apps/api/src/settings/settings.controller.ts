import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization, RequireRoles } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseInstitutionSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get('institution')
  @RequireRoles('ADMIN')
  institution(@CurrentAuthorization() context: AuthorizationContext) {
    return this.settings.getInstitution(context);
  }

  @Put('institution')
  @RequireRoles('ADMIN')
  updateInstitution(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    return this.settings.updateInstitution(parseInstitutionSettingsDto(body), context);
  }
}
