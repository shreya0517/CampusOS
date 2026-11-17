import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [AttendanceController], providers: [AttendanceService] })
export class AttendanceModule {}
