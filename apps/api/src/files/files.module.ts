import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [FilesController],
  providers: [StorageService, FilesService],
  exports: [StorageService, FilesService],
})
export class FilesModule {}
