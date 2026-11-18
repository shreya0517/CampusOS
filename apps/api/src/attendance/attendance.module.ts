import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceReportService } from './attendance-report.service';

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [AttendanceController], providers: [AttendanceService, AttendanceReportService] })
export class AttendanceModule {}
