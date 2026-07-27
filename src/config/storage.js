import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './index.js';

const client = new S3Client({
  endpoint: config.storage.endpoint,
  region: config.storage.region,
  credentials: {
    accessKeyId: config.storage.accessKey,
    secretAccessKey: config.storage.secretKey,
  },
  // Required for path-style access on non-AWS S3 providers (Cloudflare R2, MinIO, etc.)
  forcePathStyle: false,
  // Newer @aws-sdk/client-s3 defaults to WHEN_SUPPORTED, which appends
  // x-amz-checksum-* / x-amz-sdk-checksum-algorithm params to presigned URLs.
  // Cloudflare R2 doesn't accept those signed params and rejects the request
  // with 403 (broke all product/logo image loads after an SDK bump). Force the
  // old behaviour so presigned GET URLs carry no checksum params.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export const storage = {
  async put(key, body, contentType = 'application/octet-stream') {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await client.send(new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }));
    return key;
  },

  async getSignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
    });
    return getSignedUrl(client, command, { expiresIn });
  },

  async deleteObject(key) {
    await client.send(new DeleteObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
    }));
  },

  bucket: config.storage.bucket,
};

export default storage;
