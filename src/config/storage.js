import { config } from './index.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

const storageDir = path.resolve(process.cwd(), 'storage');

// Local filesystem-backed storage adapter for development.
// In production swap this implementation for an S3-compatible client.
export const storage = {
  async put(key, body, _contentType) {
    const fullPath = path.join(storageDir, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await writeFile(fullPath, buf);
    return key;
  },
  async getSignedUrl(key) {
    // No signing for local storage — return an app URL that serves static files.
    const base = config.appUrl || `http://localhost:${process.env.PORT || 4000}`;
    return `${base.replace(/\/$/, '')}/storage/${encodeURIComponent(key)}`;
  },
  bucket: config.storage.bucket,
};

export default storage;
