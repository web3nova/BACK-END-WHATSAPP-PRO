import { prisma } from '../../config/prisma.js';
import { randomInt } from 'crypto';
import { BadRequestError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';
import { notify } from '../notifications/notification.service.js';
import { encryptSecret, decryptSecret } from '../../common/utils/encryption.js';
import { whatsappConnectedEmail, platformAlertEmail } from '../../config/emailTemplates.js';

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

  // 3. Register the phone number via Cloud API (moves status from Pending → Active).
  // If this tenant connected before, Meta already has a 2-step-verification PIN
  // set on the number from that prior registration — generating a fresh random
  // PIN on every reconnect fails with "(#133005) Two step verification PIN
  // Mismatch". Reuse the stored PIN when we have one; only mint a new PIN for a
  // genuinely first-time connection.
  const existingAccount = await prisma.whatsappAccount.findUnique({ where: { tenantId }, select: { twoStepPin: true } });
  const existingPin = existingAccount?.twoStepPin ? decryptSecret(existingAccount.twoStepPin) : null;

  let twoStepPin = existingPin || String(randomInt(100000, 999999));
  let phoneRegistered = false;

  const attemptRegister = async (pin) => {
    const regBody = new URLSearchParams({ messaging_product: 'whatsapp', pin });
    const regRes = await fetch(`${GRAPH_BASE}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      body: regBody.toString(),
    });
    const regJson = await regRes.json().catch(() => ({}));
    return { ok: regRes.ok, status: regRes.status, json: regJson };
  };

  try {
    let result = await attemptRegister(twoStepPin);
    // PIN mismatch (133005) using the stored PIN means the number's actual PIN
    // on Meta's side has drifted (e.g. reset from another client) — fall back
    // to minting a fresh one rather than staying stuck.
    if (!result.ok && result.json?.error?.code === 133005 && existingPin) {
      logger.warn('[whatsapp] stored 2FA PIN rejected — retrying registration with a new PIN');
      twoStepPin = String(randomInt(100000, 999999));
      result = await attemptRegister(twoStepPin);
    }
    if (!result.ok) {
      logger.warn({ status: result.status, body: result.json }, '[whatsapp] phone number registration failed — number may stay pending');
    } else {
      phoneRegistered = true;
      logger.info({ phoneNumberId }, '[whatsapp] phone number registered successfully');
    }
  } catch (err) {
    logger.warn({ err: err?.message }, '[whatsapp] phone number registration request failed');
  }

  // 4. Fetch the human-readable display phone number from Meta
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

  // 5. Subscribe app to this WABA's webhook events
  let webhookSubscribed = false;
  try {
    const subRes = await fetch(`${GRAPH_BASE}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const subJson = await subRes.json().catch(() => ({}));
    if (!subRes.ok) {
      logger.warn({ wabaId, body: subJson }, '[whatsapp] WABA webhook subscription failed');
    } else {
      webhookSubscribed = true;
      logger.info({ wabaId }, '[whatsapp] WABA webhook subscribed successfully');
    }
  } catch (err) {
    logger.warn({ err: err?.message }, '[whatsapp] WABA webhook subscription request failed');
  }

  // 6. Persist all identifiers — tenant can now send/receive WhatsApp messages
  const encryptedAccessToken = encryptSecret(accessToken);
  const encryptedPin = twoStepPin ? encryptSecret(twoStepPin) : null;
  await prisma.whatsappAccount.upsert({
    where: { tenantId },
    update: { accessToken: encryptedAccessToken, wabaId, phoneNumberId, phoneNumber, ...(encryptedPin && { twoStepPin: encryptedPin }), verified: true },
    create: { tenantId, accessToken: encryptedAccessToken, wabaId, phoneNumberId, phoneNumber, ...(encryptedPin && { twoStepPin: encryptedPin }), verified: true },
  });

  // Only declare full success once the number is actually registered AND
  // webhook events are subscribed — otherwise the "connected" email would be
  // sent even though messages can't yet flow (registration pending / no
  // webhook = no inbound messages), which is a confusing thing to promise.
  const fullyConnected = phoneRegistered && webhookSubscribed && !!phoneNumber;

  if (fullyConnected) {
    notify(tenantId, {
      type: 'whatsapp_connected',
      title: 'WhatsApp Business connected',
      body: `${phoneNumber} is now connected and ready to receive messages.`,
      emailSubject: 'WhatsApp Business number connected successfully',
      emailHtml: whatsappConnectedEmail({ phoneNumber }),
      metadata: { wabaId, phoneNumberId, phoneNumber },
      outbound: true,
    }).catch(() => {});
  } else {
    const issues = [
      !phoneRegistered && 'phone number registration',
      !webhookSubscribed && 'webhook subscription',
      !phoneNumber && 'display number lookup',
    ].filter(Boolean).join(', ');
    const message = `Your WhatsApp number was linked, but ${issues} didn't complete. Messaging may not work correctly yet — reconnect from your dashboard or contact support if this persists.`;
    notify(tenantId, {
      type: 'whatsapp_connected',
      title: 'WhatsApp Business linked — setup incomplete',
      body: message,
      emailSubject: 'WhatsApp Business setup needs attention',
      emailHtml: platformAlertEmail({ heading: 'WhatsApp setup incomplete', message, tone: 'warn', emoji: '⚠️' }),
      metadata: { wabaId, phoneNumberId, phoneNumber, phoneRegistered, webhookSubscribed },
      outbound: true,
    }).catch(() => {});
  }

  return { tenantId, wabaId, phoneNumberId, phoneNumber, verified: true };
}

export default { exchangeCodeForAccount };
