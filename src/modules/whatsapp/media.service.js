import { prisma } from '../../config/prisma.js';
import { storage } from '../../config/storage.js';
import { config } from '../../config/index.js';

/**
 * Fetch media from Meta and store it via the storage adapter.
 * Returns an object suitable for persisting as a MediaAsset.
 */
export const fetchAndStoreMedia = async ({ tenantId, mediaId, accessToken }) => {
  if (!mediaId) return null;
  if (!accessToken) throw new Error('Missing access token for media fetch');

  const apiVersion = process.env.WHATSAPP_API_VERSION || config.whatsapp.apiVersion || 'v20.0';
  const metaUrl = `https://graph.facebook.com/${apiVersion}/${mediaId}`;

  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => '');
    throw new Error(`Failed to fetch media metadata: ${metaRes.status} ${body}`);
  }
  const metaJson = await metaRes.json().catch(() => ({}));
  const mediaUrl = metaJson.url;
  if (!mediaUrl) throw new Error('Media URL not returned by Meta');

  const mediaRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!mediaRes.ok) {
    const body = await mediaRes.text().catch(() => '');
    throw new Error(`Failed to download media: ${mediaRes.status} ${body}`);
  }

  const arrayBuffer = await mediaRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';

  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf' };
  const ext = extMap[contentType] || (contentType.split('/')[1] || 'bin');
  const key = `whatsapp/${tenantId}/${Date.now()}_${mediaId}.${ext}`;

  await storage.put(key, buffer, contentType);
  const publicUrl = await storage.getSignedUrl(key);

  return {
    provider: 'whatsapp',
    providerMediaId: mediaId,
    mimeType: contentType,
    size: buffer.length,
    storageKey: key,
    url: publicUrl,
    meta: metaJson,
  };
};

export default { fetchAndStoreMedia };
