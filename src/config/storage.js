import { config } from './index.js';

// Thin placeholder around an S3-compatible client.
// Swap the body for @aws-sdk/client-s3 when wiring real storage.
export const storage = {
  async put(_key, _body, _contentType) {
    throw new Error('storage.put not implemented — wire up S3 client');
  },
  async getSignedUrl(_key) {
    throw new Error('storage.getSignedUrl not implemented');
  },
  bucket: config.storage.bucket,
};

export default storage;
