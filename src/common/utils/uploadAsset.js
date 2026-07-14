import path from 'path';
import fs from 'fs/promises';
import { storage } from '../../config/storage.js';
import { config } from '../../config/index.js';

const extensionByMime = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

function safeName(name = 'asset') {
  return path
    .parse(name)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export async function uploadAsset({ tenantId, folder, file }) {
  const ext = extensionByMime[file.mimetype] || 'bin';
  const key = `${folder}/${tenantId}/${Date.now()}-${safeName(file.originalname)}.${ext}`;

  try {
    await storage.put(key, file.buffer, file.mimetype);
    const url = await storage.getSignedUrl(key);

    return {
      url,
      storageKey: key,
      mimeType: file.mimetype,
      size: file.size,
    };
  } catch (error) {
    if (config.env !== 'development' && config.env !== 'test') {
      throw error;
    }

    const localPath = path.join(process.cwd(), 'storage', key);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, file.buffer);

    return {
      url: `${config.appUrl}/storage/${key.replaceAll('\\', '/')}`,
      storageKey: key,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}

export async function deleteAsset(storageKey) {
  try {
    await storage.deleteObject(storageKey);
  } catch (error) {
    if (config.env !== 'development' && config.env !== 'test') {
      throw error;
    }

    const localPath = path.join(process.cwd(), 'storage', storageKey);
    await fs.rm(localPath, { force: true });
  }
}

export async function getAssetUrl(storageKey, fallbackUrl) {
  if (!storageKey) return fallbackUrl;

  try {
    return await storage.getSignedUrl(storageKey);
  } catch (error) {
    if (config.env !== 'development' && config.env !== 'test') {
      throw error;
    }
    return `${config.appUrl}/storage/${storageKey.replaceAll('\\', '/')}`;
  }
}

export default uploadAsset;
