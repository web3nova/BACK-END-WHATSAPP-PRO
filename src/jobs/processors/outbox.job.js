import { prisma } from '../../config/prisma.js';
import { storage } from '../../config/storage.js';
import { logger } from '../../config/logger.js';
import { decryptSecret } from '../../common/utils/encryption.js';

export default async function processOutbox(job) {
    const { outboxId } = job.data;
    if (!outboxId) throw new Error('Missing outboxId');

    logger.info({ outboxId }, '[outbox] processing');

    const outbox = await prisma.outboxMessage.findUnique({ where: { id: outboxId } });
    if (!outbox) throw new Error('Outbox entry not found');
    if (outbox.status === 'sent') { logger.info({ outboxId }, '[outbox] already sent — skipping'); return; }

    await prisma.outboxMessage.update({ where: { id: outboxId }, data: { attempts: outbox.attempts + 1, status: 'in_progress' } });

    const accountRow = await prisma.whatsappAccount.findUnique({ where: { tenantId: outbox.tenantId } });
    const account = accountRow?.accessToken ? { ...accountRow, accessToken: decryptSecret(accountRow.accessToken) } : accountRow;
    if (!account || !account.accessToken || !account.phoneNumberId) {
        await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'failed', lastError: 'Missing whatsapp account config' } });
        logger.error({ outboxId, tenantId: outbox.tenantId }, '[outbox] missing WhatsApp account config');
        throw new Error('Missing whatsapp account config');
    }

    const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}/${account.phoneNumberId}/messages`;
    logger.info({ outboxId, to: outbox.to, type: outbox.payload?.type }, '[outbox] calling WhatsApp API');

    const payload = outbox.payload;
    let body;
    if (payload.type === 'text') {
        body = { messaging_product: 'whatsapp', to: outbox.to, type: 'text', text: { body: payload.body } };
    } else if (payload.type === 'media') {
        const mediaType = payload.mediaType || 'image';
        let link = payload.url;
        if (!link && payload.storageKey) link = await storage.getSignedUrl(payload.storageKey);
        if (!link) {
            await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'failed', lastError: 'Missing media URL' } });
            throw new Error('Missing media URL for outbox media payload');
        }
        body = { messaging_product: 'whatsapp', to: outbox.to, type: mediaType, [mediaType]: { link, caption: payload.caption } };
    } else {
        await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'failed', lastError: 'Unsupported outbox payload type' } });
        throw new Error('Unsupported outbox payload type');
    }

    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
        await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'sent', providerResponse: data, sentAt: new Date() } });
        logger.info({ outboxId, to: outbox.to }, '[outbox] delivered');
        return data;
    }

    const lastError = JSON.stringify(data);
    const attempts = outbox.attempts + 1;
    const maxAttempts = 5;
    logger.error({ outboxId, to: outbox.to, status: response.status, err: lastError }, '[outbox] WhatsApp API error');

    if (attempts >= maxAttempts) {
        await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'failed', lastError, providerResponse: data } });
        throw new Error(`Outbox delivery failed after ${attempts} attempts`);
    }

    await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'pending', lastError, providerResponse: data } });
    throw new Error('Outbox delivery failed, will retry');
}
