import { prisma } from '../../config/prisma.js';
import { storage } from '../../config/storage.js';
import { logger } from '../../config/logger.js';
import { decryptSecret } from '../../common/utils/encryption.js';

// Meta hands back exact quota usage on every Graph API response — log it so
// climbing usage is visible in Render logs before we actually get throttled,
// instead of only finding out once sends start failing.
// https://developers.facebook.com/docs/graph-api/overview/rate-limiting
// Extracts a single 0-100 "how close to the limit" number from whichever
// shape a given usage header uses: X-App-Usage is flat ({call_count,...}),
// X-Ad-Account-Usage is flat with a differently-named field, and
// X-Business-Use-Case-Usage is an object keyed by account id containing an
// array of usage entries.
function extractUsagePct(usage) {
    if (typeof usage.call_count === 'number') return usage.call_count;
    if (typeof usage.acc_id_util_pct === 'number') return usage.acc_id_util_pct;
    const entries = Object.values(usage).flat().filter(v => v && typeof v === 'object');
    return Math.max(0, ...entries.map(e => e.call_count ?? 0));
}

function logRateLimitHeaders(response, outboxId) {
    for (const headerName of ['x-app-usage', 'x-business-use-case-usage', 'x-ad-account-usage']) {
        const raw = response.headers.get(headerName);
        if (!raw) continue;
        try {
            const usage = JSON.parse(raw);
            const pct = extractUsagePct(usage);
            const level = pct >= 80 ? 'warn' : 'debug';
            logger[level]({ outboxId, header: headerName, usage }, `[outbox] Meta rate-limit usage${pct >= 80 ? ' — approaching limit' : ''}`);
        } catch { /* malformed/unexpected shape — not worth failing the send over */ }
    }
}

// Throttle-specific error codes per Meta's docs — these mean "stop sending,"
// not "retry immediately like any other failure." Codes: 4 (app rate limit),
// 17 (user rate limit), 32 (Pages rate limit), 613 (custom rate limit).
const THROTTLE_ERROR_CODES = new Set([4, 17, 32, 613]);
function isThrottleError(status, data) {
    return status === 429 || THROTTLE_ERROR_CODES.has(data?.error?.code);
}

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
    logRateLimitHeaders(response, outboxId);

    if (response.ok) {
        await prisma.outboxMessage.update({ where: { id: outboxId }, data: { status: 'sent', providerResponse: data, sentAt: new Date() } });
        logger.info({ outboxId, to: outbox.to }, '[outbox] delivered');
        return data;
    }

    if (isThrottleError(response.status, data)) {
        logger.warn({ outboxId, to: outbox.to, status: response.status, code: data?.error?.code, err: JSON.stringify(data) }, '[outbox] THROTTLED by Meta — back off, do not just retry blindly');
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
