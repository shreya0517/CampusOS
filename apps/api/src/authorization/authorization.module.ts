import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationProbeController } from './authorization-probe.controller';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';

@Module({ imports: [AuthModule], controllers: [AuthorizationProbeController], providers: [AuthorizationService, AuthorizationGuard], exports: [AuthorizationService, AuthorizationGuard] })
export class AuthorizationModule {}
