import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentRecordService } from './student-record.service';

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [StudentsController], providers: [StudentsService, StudentRecordService] })
export class StudentsModule {}