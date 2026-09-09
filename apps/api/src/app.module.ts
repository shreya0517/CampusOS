import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { StudentsModule } from './students/students.module';

@Module({ imports: [AuthModule, AuthorizationModule, StudentsModule] })
export class AppModule {}
