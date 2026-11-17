import { authenticatedRequest } from './api-client';

export type FileVisibility = 'PRIVATE' | 'COLLEGE' | 'PUBLIC';

export type FileUser = { id: string; displayName: string; email: string };

export type FileItem = {
  id: string;
  collegeId: string;
  uploadedById: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: FileVisibility;
  createdAt: string;
  uploadedBy?: FileUser;
  downloadUrl?: string;
};

type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const requestPresignedUpload = (input: {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  visibility?: FileVisibility;
}): Promise<{ file: FileItem; uploadUrl: string; storageKey: string }> =>
  authenticatedRequest('/files/presigned-url', { method: 'POST', body: JSON.stringify(input) });

export const listFiles = (q: URLSearchParams): Promise<List<FileItem>> => authenticatedRequest(`/files?${q}`);

export const getFile = (id: string): Promise<FileItem> => authenticatedRequest(`/files/${id}`);

export const deleteFile = (id: string): Promise<{ success: boolean }> =>
  authenticatedRequest(`/files/${id}`, { method: 'DELETE' });

export const uploadFileBinary = async (uploadUrl: string, file: File): Promise<void> => {
  if (uploadUrl.includes('mock.local')) {
    // Simulated upload for mock local mode
    return;
  }

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`S3 Upload failed with status ${response.status}`);
  }
};
