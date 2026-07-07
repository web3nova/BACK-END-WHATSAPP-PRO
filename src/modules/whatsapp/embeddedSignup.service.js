import { prisma } from '../../config/prisma.js';
import { BadRequestError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';

const GRAPH_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v20.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Meta Embedded Signup OAuth flow.
 *
 * The frontend completes the Meta OAuth popup and sends back:
 *   - code          : short-lived auth code from Meta
 *   - redirectUri   : must match the URI registered in your Meta App
 *   - wabaId        : WhatsApp Business Account ID (provided by Meta in the signup callback)
 *   - phoneNumberId : Phone Number ID to receive/send messages (provided by Meta in the signup callback)
 *
 * This function exchanges the code for a long-lived access token and persists
 * all three identifiers so the tenant can immediately start sending/receiving.
 */
export async function exchangeCodeForAccount({ tenantId, code, redirectUri, wabaId, phoneNumberId }) {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    throw new Error('META_APP_ID / META_APP_SECRET not configured');
  }
  if (!code) throw new BadRequestError('Missing OAuth code');
  if (!wabaId) throw new BadRequestError('Missing wabaId');
  if (!phoneNumberId) throw new BadRequestError('Missing phoneNumberId');

  // 1. Exchange auth code → short-lived user token
  const shortTokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri || '',
      code,
    })
  );
  const shortTokenJson = await shortTokenRes.json().catch(() => ({}));
  if (!shortTokenRes.ok || !shortTokenJson.access_token) {
    throw new Error(`Failed to exchange code: ${JSON.stringify(shortTokenJson)}`);
  }

  // 2. Exchange short-lived → long-lived token
  const longTokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?` +
    new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortTokenJson.access_token,
    })
  );
  const longTokenJson = await longTokenRes.json().catch(() => ({}));
  if (!longTokenRes.ok || !longTokenJson.access_token) {
    throw new Error(`Failed to extend token: ${JSON.stringify(longTokenJson)}`);
  }

  const accessToken = longTokenJson.access_token;

  // 3. Fetch the human-readable display phone number from Meta
  let phoneNumber = null;
  try {
    // Try direct phone number ID lookup first
    const phoneRes = await fetch(
      `${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${accessToken}`
    );
    const phoneJson = await phoneRes.json().catch(() => ({}));
    if (phoneJson.display_phone_number) {
      phoneNumber = phoneJson.display_phone_number;
    } else {
      logger.warn({ phoneJson }, '[whatsapp] direct phone number lookup returned no display_phone_number');
      // Fallback: list all phone numbers on the WABA and match by ID
      const wabaPhoneRes = await fetch(
        `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`
      );
      const wabaPhoneJson = await wabaPhoneRes.json().catch(() => ({}));
      const match = wabaPhoneJson.data?.find(p => p.id === phoneNumberId);
      phoneNumber = match?.display_phone_number ?? null;
      if (!phoneNumber) {
        logger.warn({ wabaPhoneJson }, '[whatsapp] WABA phone number list lookup also failed');
      }
    }
  } catch (err) {
    logger.warn({ err: err?.message }, '[whatsapp] could not fetch display phone number');
  }

  // 4. Persist all identifiers — tenant can now send/receive WhatsApp messages
  await prisma.whatsappAccount.upsert({
    where: { tenantId },
    update: { accessToken, wabaId, phoneNumberId, phoneNumber, verified: true },
    create: { tenantId, accessToken, wabaId, phoneNumberId, phoneNumber, verified: true },
  });

  return { tenantId, wabaId, phoneNumberId, phoneNumber, verified: true };
}

export default { exchangeCodeForAccount };
