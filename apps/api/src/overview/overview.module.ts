import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OverviewController } from './overview.controller';
import { InstitutionAnalyticsService } from './institution-analytics.service';
import { InstitutionOverviewService } from './institution-overview.service';

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [OverviewController], providers: [InstitutionOverviewService, InstitutionAnalyticsService] })
export class OverviewModule {}
