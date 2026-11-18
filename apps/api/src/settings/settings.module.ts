import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
