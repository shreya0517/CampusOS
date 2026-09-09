import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { StudentsModule } from './students/students.module';
import { DepartmentsModule } from './departments/departments.module';
import { FacultyModule } from './faculty/faculty.module';

@Module({ imports: [AuthModule, AuthorizationModule, StudentsModule, DepartmentsModule, FacultyModule] })
export class AppModule {}
