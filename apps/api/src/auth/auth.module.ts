import { Module } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { AccessAuthGuard } from './access-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({ controllers: [AuthController], providers: [DatabaseService, AuthService, AccessAuthGuard], exports: [DatabaseService, AuthService, AccessAuthGuard] })
export class AuthModule {}
