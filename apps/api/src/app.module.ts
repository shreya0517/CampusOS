import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';

@Module({ imports: [AuthModule, AuthorizationModule] })
export class AppModule {}
