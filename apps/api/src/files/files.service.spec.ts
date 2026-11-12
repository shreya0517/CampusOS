import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';
import { FilesService } from './files.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseFileListQuery, parseRequestPresignedUploadDto } from './files.dto';

const admin: AuthorizationContext = { userId: 'admin-1', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const student: AuthorizationContext = { userId: 'stu-1', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };
const otherUser: AuthorizationContext = { userId: 'user-2', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

const mockFile = {
  id: 'file-1',
  collegeId: 'col-a',
  uploadedById: 'stu-1',
  storageKey: 'col-a/stu-1/123-test.pdf',
  originalName: 'test.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  visibility: FileVisibility.PRIVATE,
  createdAt: new Date(),
  uploadedBy: { id: 'stu-1', displayName: 'John Doe', email: 'john@example.com' },
};

describe('FilesService', () => {
  const database = {
    file: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
  };

  const storage = {
    generatePresignedUploadUrl: jest.fn().mockResolvedValue('https://s3.mock.local/upload-url'),
    generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.mock.local/download-url'),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  const service = new FilesService(database as never, storage as never);

  beforeEach(() => jest.clearAllMocks());

  it('validates DTO parsing', () => {
    expect(() => parseRequestPresignedUploadDto({})).toThrow();
    expect(() => parseRequestPresignedUploadDto({ originalName: 'a.pdf', mimeType: 'app/pdf', sizeBytes: -1 })).toThrow();
    expect(() => parseFileListQuery({ page: 0 })).toThrow();

    const validUpload = parseRequestPresignedUploadDto({ originalName: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 500 });
    expect(validUpload.originalName).toBe('doc.pdf');
    expect(validUpload.sizeBytes).toBe(500);

    const validQuery = parseFileListQuery({ search: 'doc', page: '1', pageSize: '10' });
    expect(validQuery.search).toBe('doc');
    expect(validQuery.page).toBe(1);
  });

  it('requests presigned upload and creates file record', async () => {
    database.file.create.mockResolvedValue(mockFile);

    const result = await service.requestPresignedUpload(
      { originalName: 'test.pdf', mimeType: 'application/pdf', sizeBytes: 1024 },
      student,
    );

    expect(result.file).toEqual(mockFile);
    expect(result.uploadUrl).toBe('https://s3.mock.local/upload-url');
    expect(storage.generatePresignedUploadUrl).toHaveBeenCalled();
  });

  it('allows owner to get file download URL', async () => {
    database.file.findFirst.mockResolvedValue(mockFile);

    const result = await service.getFile('file-1', student);
    expect(result.downloadUrl).toBe('https://s3.mock.local/download-url');
  });

  it('blocks other user from getting PRIVATE file', async () => {
    database.file.findFirst.mockResolvedValue(mockFile);

    await expect(service.getFile('file-1', otherUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admin to delete file', async () => {
    database.file.findFirst.mockResolvedValue(mockFile);
    database.file.delete.mockResolvedValue(mockFile);

    const result = await service.deleteFile('file-1', admin);
    expect(result.success).toBe(true);
    expect(storage.deleteObject).toHaveBeenCalledWith(mockFile.storageKey);
  });

  it('blocks non-owner non-admin from deleting file', async () => {
    database.file.findFirst.mockResolvedValue(mockFile);

    await expect(service.deleteFile('file-1', otherUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFoundException when file does not exist', async () => {
    database.file.findFirst.mockResolvedValue(null);

    await expect(service.getFile('missing-file', student)).rejects.toBeInstanceOf(NotFoundException);
  });
});
