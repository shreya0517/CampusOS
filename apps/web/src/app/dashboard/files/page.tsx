'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { deleteFile, getFile, listFiles, requestPresignedUpload, uploadFileBinary } from '@/lib/files-api';
import type { FileItem, FileVisibility } from '@/lib/files-api';

const PAGE_SIZE = 20;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function FilesPage() {
  const { user, primaryRole } = useAuth();
  const isAdmin = primaryRole === 'Admin' || primaryRole === 'HOD';

  const canDelete = (file: FileItem): boolean =>
    isAdmin || file.uploadedById === user?.id;

  const [files, setFiles] = useState<FileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<FileVisibility>('PRIVATE');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const load = async (p = page, s = search): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (s.trim()) params.set('search', s.trim());
      const result = await listFiles(params);
      setFiles(result.items);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Files could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    void load(1, search);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]!);
      setUploadMessage(null);
    }
  };

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadMessage(null);
    try {
      // 1. Get presigned upload URL from backend
      const presigned = await requestPresignedUpload({
        originalName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        sizeBytes: selectedFile.size,
        visibility,
      });

      // 2. Upload file binary directly to S3 URL
      await uploadFileBinary(presigned.uploadUrl, selectedFile);

      setUploadMessage('File uploaded successfully!');
      setSelectedFile(null);
      void load(1, search);
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const item = await getFile(fileId);
      if (item.downloadUrl) {
        window.open(item.downloadUrl, '_blank');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not retrieve download URL.');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    try {
      await deleteFile(fileId);
      void load(page, search);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file.');
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Object Storage</p>
          <h1 className="mt-2 text-3xl font-semibold">AWS S3 File Management</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">Upload documents, manage permissions, and access secure S3 storage links.</p>
        </div>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Upload New File</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUploadSubmit} className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <input
              type="file"
              onChange={handleFileChange}
              className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-[var(--radius)] file:border-0 file:text-sm file:font-semibold file:bg-[hsl(var(--secondary))] file:text-[hsl(var(--secondary-foreground))] hover:file:brightness-95"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase">Visibility:</label>
              <select
                value={visibility}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setVisibility(e.target.value as FileVisibility)}
                className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
              >
                <option value="PRIVATE">Private (Only Me / Admin)</option>
                <option value="COLLEGE">College (All College Users)</option>
                <option value="PUBLIC">Public</option>
              </select>
            </div>
            <Button type="submit" disabled={uploading || !selectedFile}>
              {uploading ? 'Uploading...' : 'Upload to S3'}
            </Button>
          </form>
          {uploadMessage && (
            <p className="mt-3 text-xs font-semibold text-[hsl(var(--primary))]">{uploadMessage}</p>
          )}
        </CardContent>
      </Card>

      {/* Files List Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Files ({total})</CardTitle>
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                placeholder="Search files..."
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="w-64 min-h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
              />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {loading ? (
            <div className="grid gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : files.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <TableHead>File Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Visibility</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <TableCell>
                        <strong className="block truncate max-w-xs">{f.originalName}</strong>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{f.mimeType}</span>
                      </TableCell>
                      <TableCell>{formatBytes(f.sizeBytes)}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 text-xs font-semibold rounded bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          {f.visibility}
                        </span>
                      </TableCell>
                      <TableCell>{f.uploadedBy ? f.uploadedBy.displayName : f.uploadedById}</TableCell>
                      <TableCell>{formatDate(f.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => void handleDownload(f.id)}>
                            Download
                          </Button>
                          {canDelete(f) && (
                            <Button variant="destructive" onClick={() => void handleDelete(f.id)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                onPageChange={(p) => setPage(p)}
              />
            </>
          ) : (
            <EmptyState
              title="No files found"
              description="No files have been uploaded to S3 storage yet."
              action={<Button variant="outline" onClick={() => void load()}>Refresh</Button>}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
