import { ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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

/** Uploader details: the email only for an Admin; others see the name. */
const uploaderSelect = (withEmail: boolean) => ({ id: true, displayName: true, ...(withEmail ? { email: true } : {}) });

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

    // The upload URL first: if storage can't take the file, no record is left pointing at nothing.
    const uploadUrl = await this.storage.generatePresignedUploadUrl(storageKey, input.mimeType);

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

    return {
      file: fileRecord,
      uploadUrl,
      storageKey,
    };
  }

  /**
   * The same rule as opening a file: an Admin sees every file; everyone else sees their own files and those shared
   * with the college (COLLEGE or PUBLIC). Someone else's PRIVATE file isn't listed, not even its name.
   */
  async listFiles(query: FileListQuery, context: AuthorizationContext) {
    const isAdmin = context.roles.includes('ADMIN');

    const baseWhere: Record<string, unknown> = {
      collegeId: context.collegeId,
    };

    if (query.visibility) {
      baseWhere.visibility = query.visibility;
    }

    if (query.search) {
      baseWhere.originalName = { contains: query.search, mode: 'insensitive' };
    }

    if (!isAdmin) {
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
          uploadedBy: { select: uploaderSelect(isAdmin) },
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
        uploadedBy: { select: uploaderSelect(context.roles.includes('ADMIN')) },
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

    // The record is removed only once the stored object is gone (a missing object counts as gone). If storage fails,
    // the record stays, so the file isn't left in the bucket with nothing pointing at it; deleting again retries.
    try {
      await this.storage.deleteObject(fileRecord.storageKey);
    } catch (error) {
      this.logger.error(`Could not delete stored object ${fileRecord.storageKey}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException({ code: 'FILE_DELETE_FAILED', message: 'The file could not be deleted from storage. Please try again.' });
    }

    await this.database.file.delete({
      where: { collegeId_id: { collegeId: context.collegeId, id } },
    });

    return { success: true };
  }
}
