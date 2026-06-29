import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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

  bucket: config.storage.bucket,
};

export default storage;
