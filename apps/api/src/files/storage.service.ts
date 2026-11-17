import { Injectable, Logger } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client | null = null;
  private readonly bucketName: string;
  private readonly isMock: boolean;

  constructor() {
    const region = process.env.AWS_REGION || 'ap-south-1';
    this.bucketName = process.env.AWS_S3_BUCKET || 'campusos-local';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey && accessKeyId !== 'replace_me' && secretAccessKey !== 'replace_me') {
      this.s3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.isMock = false;
    } else {
      this.logger.warn('AWS credentials not configured or set to placeholder. Operating in S3 mock mode.');
      this.isMock = true;
    }
  }

  async generatePresignedUploadUrl(storageKey: string, mimeType: string, expiresInSeconds = 900): Promise<string> {
    if (this.isMock || !this.s3Client) {
      return `https://s3.mock.local/${this.bucketName}/${storageKey}?upload=true&expires=${expiresInSeconds}&contentType=${encodeURIComponent(mimeType)}`;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: mimeType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  async generatePresignedDownloadUrl(storageKey: string, expiresInSeconds = 3600): Promise<string> {
    if (this.isMock || !this.s3Client) {
      return `https://s3.mock.local/${this.bucketName}/${storageKey}?download=true&expires=${expiresInSeconds}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (this.isMock || !this.s3Client) {
      this.logger.log(`Mock S3 deleteObject for key: ${storageKey}`);
      return;
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    try {
      await this.s3Client.send(command);
    } catch (error: unknown) {
      const err = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.code === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        this.logger.warn(`S3 object not found for key ${storageKey}, proceeding.`);
        return;
      }
      this.logger.error(`Failed S3 deleteObject for key ${storageKey}: ${error}`);
      throw error;
    }
  }
}
