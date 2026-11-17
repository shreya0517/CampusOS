import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseService } from '../database.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ExamsController],
  providers: [ExamsService, DatabaseService],
  exports: [ExamsService],
})
export class ExamsModule {}
