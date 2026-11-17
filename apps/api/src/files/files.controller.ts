import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentAuthorization } from '../authorization/authorization.decorator';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { FilesService } from './files.service';
import { parseFileListQuery, parseRequestPresignedUploadDto } from './files.dto';

@Controller('files')
@UseGuards(AccessAuthGuard, AuthorizationGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly service: FilesService) {}

  @Post('presigned-url')
  async requestPresignedUpload(@Body() body: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const input = parseRequestPresignedUploadDto(body);
    return this.service.requestPresignedUpload(input, context);
  }

  @Get()
  async listFiles(@Query() query: unknown, @CurrentAuthorization() context: AuthorizationContext) {
    const parsed = parseFileListQuery(query);
    return this.service.listFiles(parsed, context);
  }

  @Get(':id')
  async getFile(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.getFile(id, context);
  }

  @Delete(':id')
  async deleteFile(@Param('id') id: string, @CurrentAuthorization() context: AuthorizationContext) {
    return this.service.deleteFile(id, context);
  }
}
