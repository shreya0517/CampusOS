import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { StorageService } from './storage.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { FileListQuery, RequestPresignedUploadDto } from './files.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const missing = (): never => {
  throw new NotFoundException({ code: 'FILE_NOT_FOUND', message: 'File was not found.' });
};

const sanitizeFileName = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async requestPresignedUpload(input: RequestPresignedUploadDto, context: AuthorizationContext) {
    const sanitizedName = sanitizeFileName(input.originalName);
    const timeStamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const storageKey = `${context.collegeId}/${context.userId}/${timeStamp}-${randomSuffix}-${sanitizedName}`;

    const visibility = input.visibility ?? FileVisibility.PRIVATE;

    const fileRecord = await this.database.file.create({
      data: {
        collegeId: context.collegeId,
        uploadedById: context.userId,
        storageKey,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        visibility,
      },
      include: {
        uploadedBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    const uploadUrl = await this.storage.generatePresignedUploadUrl(storageKey, input.mimeType);

    return {
      file: fileRecord,
      uploadUrl,
      storageKey,
    };
  }

  async listFiles(query: FileListQuery, context: AuthorizationContext) {
    const isManager = context.roles.includes('ADMIN') || context.roles.includes('HOD') || context.roles.includes('FACULTY');

    const baseWhere: Record<string, unknown> = {
      collegeId: context.collegeId,
    };

    if (query.visibility) {
      baseWhere.visibility = query.visibility;
    }

    if (query.search) {
      baseWhere.originalName = { contains: query.search, mode: 'insensitive' };
    }

    if (!isManager) {
      // Students see files uploaded by themselves OR with COLLEGE or PUBLIC visibility
      baseWhere.OR = [
        { uploadedById: context.userId },
        { visibility: FileVisibility.COLLEGE },
        { visibility: FileVisibility.PUBLIC },
      ];
    }

    const [items, total] = await Promise.all([
      this.database.file.findMany({
        where: baseWhere,
        include: {
          uploadedBy: { select: { id: true, displayName: true, email: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.file.count({ where: baseWhere }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getFile(id: string, context: AuthorizationContext) {
    const fileRecord = await this.database.file.findFirst({
      where: { id, collegeId: context.collegeId },
      include: {
        uploadedBy: { select: { id: true, displayName: true, email: true } },
      },
    });

    if (!fileRecord) throw missing();

    const isOwner = fileRecord.uploadedById === context.userId;
    const isAdmin = context.roles.includes('ADMIN');
    const isCollegeVisible = fileRecord.visibility === FileVisibility.COLLEGE;
    const isPublicVisible = fileRecord.visibility === FileVisibility.PUBLIC;

    if (!isOwner && !isAdmin && !isCollegeVisible && !isPublicVisible) {
      denied();
    }

    const downloadUrl = await this.storage.generatePresignedDownloadUrl(fileRecord.storageKey);

    return {
      ...fileRecord,
      downloadUrl,
    };
  }

  async deleteFile(id: string, context: AuthorizationContext) {
    const fileRecord = await this.database.file.findFirst({
      where: { id, collegeId: context.collegeId },
    });

    if (!fileRecord) throw missing();

    const isOwner = fileRecord.uploadedById === context.userId;
    const isAdmin = context.roles.includes('ADMIN');

    if (!isOwner && !isAdmin) {
      denied();
    }

    try {
      await this.storage.deleteObject(fileRecord.storageKey);
    } catch (error) {
      this.logger.warn(`S3 DeleteObject warning for key ${fileRecord.storageKey}: ${error}`);
    }

    await this.database.file.delete({
      where: { collegeId_id: { collegeId: context.collegeId, id } },
    });

    return { success: true };
  }
}
