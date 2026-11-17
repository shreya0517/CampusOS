import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseService } from '../database.service';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [TimetableController],
  providers: [TimetableService, DatabaseService],
  exports: [TimetableService],
})
export class TimetableModule {}
