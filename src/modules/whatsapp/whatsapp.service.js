import * as conversationService from '../conversations/conversation.service.js';
import { prisma } from '../../config/prisma.js';
import { mainQueue } from '../../jobs/queue.js';
import { logger } from '../../config/logger.js';
import { fetchAndStoreMedia } from './media.service.js';
import { parseMessage, isMediaMessage, extractMediaId } from './whatsapp.parser.js';
import { notify } from '../notifications/notification.service.js';

const GRAPH_BASE = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}`;

/** Return the tenant's connected WhatsApp account (no access token). */
export const getAccount = async (tenantId) => {
  const account = await prisma.whatsappAccount.findUnique({
    where: { tenantId },
    select: { id: true, wabaId: true, phoneNumberId: true, phoneNumber: true, verified: true },
  });
  return account ?? null;
};

/** Return the tenant's connected WhatsApp account with live status from Meta. */
export const getAccountWithStatus = async (tenantId) => {
  const account = await prisma.whatsappAccount.findUnique({
    where: { tenantId },
    select: { id: true, wabaId: true, phoneNumberId: true, phoneNumber: true, accessToken: true, verified: true },
  });
  if (!account) return null;

  let status = null;
  let qualityRating = null;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${account.phoneNumberId}?fields=display_phone_number,verified_name,status,quality_rating&access_token=${account.accessToken}`
    );
    const json = await res.json().catch(() => ({}));
    status = json.status ?? null;
    qualityRating = json.quality_rating ?? null;
    if (!account.phoneNumber && json.display_phone_number) {
      await prisma.whatsappAccount.update({
        where: { tenantId },
        data: { phoneNumber: json.display_phone_number },
      });
      account.phoneNumber = json.display_phone_number;
    }
  } catch { /* non-fatal */ }

  const { accessToken: _, ...safe } = account;
  return { ...safe, status, qualityRating };
};

/** Remove the tenant's WhatsApp account record (disconnect). */
export const disconnectAccount = async (tenantId) => {
  await prisma.whatsappAccount.deleteMany({ where: { tenantId } });
  return { disconnected: true };
};

/** Fetch WhatsApp Business Profile from Meta for the tenant's phone number. */
export const getBusinessProfile = async (tenantId) => {
  const account = await prisma.whatsappAccount.findUnique({
    where: { tenantId },
    select: { phoneNumberId: true, accessToken: true },
  });
  if (!account?.phoneNumberId || !account?.accessToken) return null;

  const res = await fetch(
    `${GRAPH_BASE}/${account.phoneNumberId}/whatsapp_business_profile` +
    `?fields=about,address,description,email,profile_picture_url,websites,vertical` +
    `&access_token=${account.accessToken}`
  );
  const json = await res.json().catch(() => ({}));
  return json.data?.[0] ?? json ?? null;
};

/** Update WhatsApp Business Profile on Meta for the tenant's phone number. */
export const updateBusinessProfile = async (tenantId, fields) => {
  const account = await prisma.whatsappAccount.findUnique({
    where: { tenantId },
    select: { phoneNumberId: true, accessToken: true },
  });
  if (!account?.phoneNumberId || !account?.accessToken) {
    const err = new Error('WhatsApp account not connected');
    err.statusCode = 400;
    throw err;
  }

  // Strip undefined fields
  const body = { messaging_product: 'whatsapp' };
  if (fields.about !== undefined)       body.about       = fields.about;
  if (fields.address !== undefined)     body.address     = fields.address;
  if (fields.description !== undefined) body.description = fields.description;
  if (fields.email !== undefined)       body.email       = fields.email;
  if (fields.websites !== undefined)    body.websites    = fields.websites;
  if (fields.vertical !== undefined)    body.vertical    = fields.vertical;

  const res = await fetch(
    `${GRAPH_BASE}/${account.phoneNumberId}/whatsapp_business_profile?access_token=${account.accessToken}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || 'Failed to update WhatsApp Business Profile');
    err.statusCode = res.status;
    throw err;
  }
  return { success: true };
};

/** Resolve tenantId from phoneNumberId or wabaId — used by account-level webhooks. */
const resolveTenant = async ({ phoneNumberId, wabaId } = {}) => {
  if (phoneNumberId) {
    const account = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId }, select: { tenantId: true } });
    if (account) return account.tenantId;
  }
  if (wabaId) {
    const account = await prisma.whatsappAccount.findFirst({ where: { wabaId }, select: { tenantId: true } });
    if (account) return account.tenantId;
  }
  return null;
};

/** Handle account-level and phone-number-level Meta webhook events. */
const processAccountEvent = async (field, value) => {
  try {
    const wabaId = value.waba_id ?? value.biz_waba_id ?? null;
    const phoneNumberId = value.phone_number_id ?? null;
    const tenantId = await resolveTenant({ wabaId, phoneNumberId });
    if (!tenantId) {
      logger.warn({ field, wabaId, phoneNumberId }, '[whatsapp] account event — no tenant found');
      return;
    }

    switch (field) {
      case 'phone_number_quality_update': {
        const quality = value.current_limit ?? value.quality ?? 'UNKNOWN';
        const phone = value.display_phone_number ?? '';
        const isLow = ['LIMITED', 'FLAGGED', 'RATE_LIMITED'].includes(quality?.toUpperCase());
        await notify(tenantId, {
          type: 'phone_quality_update',
          title: isLow ? 'WhatsApp quality rating is low' : 'WhatsApp quality rating updated',
          body: `${phone ? phone + ' — ' : ''}Quality rating: ${quality}. ${isLow ? 'High spam reports may restrict your messaging. Review your messages.' : 'Your number is in good standing.'}`,
          emailSubject: `WhatsApp number quality update — ${quality}`,
          metadata: { quality, phone },
          outbound: isLow, // only email if quality is low
        });
        break;
      }

      case 'account_update': {
        const event = value.event ?? '';
        const banInfo = value.ban_info ?? null;
        const messages = {
          DISABLED_UPDATE:    { title: 'WhatsApp account disabled', body: 'Your WhatsApp Business account has been disabled by Meta. Contact Meta support.', email: true },
          FLAGGED_UPDATE:     { title: 'WhatsApp account flagged', body: 'Your account has been flagged. Message sending may be restricted until your quality improves.', email: true },
          RESTRICTED_UPDATE:  { title: 'WhatsApp account restricted', body: 'Your messaging limit has been reduced due to quality issues.', email: true },
          UNRESTRICTED_UPDATE:{ title: 'WhatsApp account restriction lifted', body: 'Your account is no longer restricted. Normal messaging limits restored.', email: false },
          PARTNER_ADDED:      { title: 'Partner added to WhatsApp account', body: 'A new partner has been added to your WhatsApp Business account.', email: false },
          PARTNER_REMOVED:    { title: 'Partner removed from WhatsApp account', body: 'A partner has been removed from your WhatsApp Business account.', email: false },
        };
        const msg = messages[event] ?? { title: `WhatsApp account update: ${event}`, body: JSON.stringify(value), email: false };
        await notify(tenantId, {
          type: 'account_update',
          title: msg.title,
          body: banInfo ? `${msg.body} Reason: ${banInfo.waba_ban_state ?? banInfo.ban_state ?? 'see Meta dashboard'}.` : msg.body,
          emailSubject: msg.title,
          metadata: { event, value },
          outbound: msg.email,
        });
        break;
      }

      case 'account_review_update': {
        const decision = value.decision ?? '';
        const approved = decision === 'APPROVED';
        await notify(tenantId, {
          type: 'account_review',
          title: approved ? 'WhatsApp account review approved' : 'WhatsApp account review decision',
          body: approved
            ? 'Your WhatsApp Business account has been approved. You can now send messages at scale.'
            : `Account review decision: ${decision}. Check your Meta Business Manager for details.`,
          emailSubject: `WhatsApp account review — ${decision}`,
          metadata: { decision },
          outbound: true,
        });
        break;
      }

      case 'phone_number_name_update': {
        const decision = value.decision ?? '';
        const name = value.requested_verified_name ?? value.display_name ?? '';
        const phone = value.display_phone_number ?? '';
        const approved = decision === 'APPROVED';
        await notify(tenantId, {
          type: 'phone_name_update',
          title: approved ? 'WhatsApp display name approved' : 'WhatsApp display name rejected',
          body: approved
            ? `"${name}" has been approved as your WhatsApp display name${phone ? ` for ${phone}` : ''}.`
            : `Display name "${name}" was rejected by Meta${phone ? ` for ${phone}` : ''}. Please submit a compliant name.`,
          emailSubject: `WhatsApp display name ${approved ? 'approved' : 'rejected'}`,
          metadata: { decision, name, phone },
          outbound: true,
        });
        break;
      }

      case 'account_alerts': {
        const alertType = value.alert_type ?? value.type ?? 'UNKNOWN';
        await notify(tenantId, {
          type: 'account_alert',
          title: 'WhatsApp account alert',
          body: `Alert type: ${alertType}. Log in to Meta Business Manager to review and take action before your account is restricted.`,
          emailSubject: `WhatsApp account alert — ${alertType}`,
          metadata: { alertType, value },
          outbound: true,
        });
        break;
      }

      case 'business_status_update': {
        const status = value.status ?? '';
        await notify(tenantId, {
          type: 'business_status',
          title: `WhatsApp business verification: ${status}`,
          body: status === 'VERIFIED'
            ? 'Your business is now verified on Meta. This increases your messaging limits.'
            : `Business verification status changed to ${status}. Check Meta Business Manager for next steps.`,
          emailSubject: `WhatsApp business status — ${status}`,
          metadata: { status, value },
          outbound: true,
        });
        break;
      }

      case 'message_template_status_update': {
        const name = value.message_template_name ?? '';
        const status = value.event ?? value.status ?? '';
        const approved = ['APPROVED', 'REINSTATED'].includes(status);
        await notify(tenantId, {
          type: 'template_status',
          title: `Message template ${approved ? 'approved' : 'rejected'}`,
          body: `Template "${name}" status: ${status}.${!approved ? ' Review Meta\'s policies and resubmit.' : ''}`,
          emailSubject: `WhatsApp template ${approved ? 'approved' : 'rejected'}: ${name}`,
          metadata: { name, status },
          outbound: true,
        });
        break;
      }

      default:
        logger.debug({ field }, '[whatsapp] unhandled account event field');
    }
  } catch (err) {
    logger.error({ err: err?.message, field }, '[whatsapp] error processing account event');
  }
};

/**
 * Process the incoming Meta Webhook payload asynchronously.
 * Handles messages AND all account/phone-number-level events.
 */
export const processIncoming = async (payload) => {
  if (!payload.entry) return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const field = change.field;
      const value = change.value;
      if (!value) continue;

      // Route non-message events to the account event handler
      if (field !== 'messages') {
        await processAccountEvent(field, value);
        continue;
      }

      if (!value.messages) continue;

      const phoneNumberId = value.metadata?.phone_number_id;

      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i];
        const contact = value.contacts && value.contacts[i] ? value.contacts[i] : value.contacts[0];

        const senderPhone = message.from;
        const senderName = contact?.profile?.name || '';
        const { text } = parseMessage(message);

        logger.info({ senderPhone, phoneNumberId }, '[whatsapp] incoming message');

        const mediaAssets = [];
        try {
          const mediaId = extractMediaId(message);
          if (isMediaMessage(message.type) && mediaId) {
            const account = await prisma.whatsappAccount.findFirst({ where: { phoneNumberId } });
            if (account && account.accessToken) {
              const asset = await fetchAndStoreMedia({ tenantId: account.tenantId, mediaId, accessToken: account.accessToken });
              if (asset) mediaAssets.push(asset);
            }
          }
        } catch (err) {
          logger.warn({ err: err?.message }, '[whatsapp] failed to fetch/store media');
        }

        await conversationService.handleIncomingMessage({
          phoneNumberId,
          senderPhone,
          senderName,
          text,
          messageId: message.id,
          media: mediaAssets
        });
      }
    }
  }
};

/**
 * Create an outbox entry and enqueue background job to deliver it.
 * Returns the outbox DB row.
 */
export const sendMessage = async (tenantId, toPhone, payloadOrText) => {
  const payload = typeof payloadOrText === 'string' ? { type: 'text', body: payloadOrText } : payloadOrText;

  const outbox = await prisma.outboxMessage.create({
    data: {
      tenantId,
      to: toPhone,
      payload,
    }
  });

  // enqueue a job to deliver the outbox item (idempotent by jobId)
  await mainQueue.add('sendOutbox', { outboxId: outbox.id }, { jobId: outbox.id, removeOnComplete: true, attempts: 5, backoff: { type: 'exponential', delay: 5000 } });

  return outbox;
};

