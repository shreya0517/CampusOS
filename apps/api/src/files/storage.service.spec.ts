import { StorageService } from './storage.service';

describe('StorageService without AWS credentials', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('hands out mock URLs in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    const storage = new StorageService();
    await expect(storage.generatePresignedUploadUrl('c/u/file.pdf', 'application/pdf')).resolves.toContain('s3.mock.local');
  });

  it('refuses uploads and downloads in production instead of pretending', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AWS_ACCESS_KEY_ID = 'replace_me';
    process.env.AWS_SECRET_ACCESS_KEY = 'replace_me';
    const storage = new StorageService();
    await expect(storage.generatePresignedUploadUrl('c/u/file.pdf', 'application/pdf')).rejects.toMatchObject({ response: { code: 'FILES_NOT_CONFIGURED' } });
    await expect(storage.generatePresignedDownloadUrl('c/u/file.pdf')).rejects.toMatchObject({ response: { code: 'FILES_NOT_CONFIGURED' } });
  });
});
