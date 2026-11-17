import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseService } from '../database.service';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [FeesController],
  providers: [FeesService, DatabaseService],
  exports: [FeesService],
})
export class FeesModule {}
