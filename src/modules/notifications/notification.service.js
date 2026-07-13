import { sendEmail } from './channels/email.channel.js';
import { sendWhatsApp } from './channels/whatsapp.channel.js';
import { sendSMS } from './channels/sms.channel.js';
import { logger } from '../../config/logger.js';
import { mainQueue } from '../../jobs/queue.js';
// mainQueue now backed by pg-boss — no Redis dependency
import { prisma } from '../../config/prisma.js';

/**
 * Send a notification via one or more channels.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {'email'|'whatsapp'|'sms'} params.channel
 * @param {string} params.to               - email address or phone number
 * @param {string} params.subject          - email subject (email channel only)
 * @param {string} params.text             - plain text / WhatsApp body
 * @param {string} [params.html]           - HTML body (email channel only)
 */
export async function send({ tenantId, channel, to, subject, text, html }) {
  try {
    switch (channel) {
      case 'email':
        await sendEmail({ to, subject, html: html || `<p>${text}</p>` });
        break;
      case 'whatsapp':
        await sendWhatsApp({ tenantId, to, text });
        break;
      case 'sms':
        await sendSMS({ to, text });
        break;
      default:
        logger.warn({ channel }, 'Unknown notification channel');
    }
  } catch (err) {
    logger.error({ err, channel, to, tenantId }, 'Notification dispatch failed');
    throw err;
  }
}

/**
 * Enqueue a notification for background delivery with retries.
 * Prefer this over calling send() directly in request handlers.
 */
export async function enqueue({ tenantId, channel, to, subject, text, html }) {
  await mainQueue.add(
    'sendNotification',
    { tenantId, channel, to, subject, text, html },
    { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 3000 } }
  );
}

export default { send, enqueue };

// ── In-app notification store ──────────────────────────────────────────────

export async function createInApp(tenantId, { type, title, body, metadata } = {}) {
  try {
    await prisma.notification.create({
      data: { tenantId, type, title, body, metadata: metadata ?? undefined },
    });
  } catch (err) {
    logger.warn({ err: err?.message, tenantId, type }, '[notification] failed to create in-app notification');
  }
}

/**
 * Unified notify — creates an in-app record AND enqueues outbound delivery
 * (email always; WhatsApp/SMS if the tenant owner has a phone on record).
 *
 * outbound=false skips outbound (e.g. for very noisy events like every message).
 * Call fire-and-forget: notify(...).catch(() => {})
 */
// Notification type → preference key mapping
const TYPE_TO_PREF = {
  new_order:       'orderNotif',
  escalation:      'whatsappNotif',
  trial_started:   'emailNotif',
  payment_received:'emailNotif',
  whatsapp_connected: 'emailNotif',
  account_update:  'emailNotif',
  phone_quality_update: 'emailNotif',
  account_review:  'emailNotif',
  phone_name_update: 'emailNotif',
  account_alert:   'emailNotif',
  business_status: 'emailNotif',
  template_status: 'emailNotif',
  // weekly_report handled separately by cron
};

const DEFAULT_PREFS = {
  orderNotif:     true,
  whatsappNotif:  true,
  emailNotif:     true,
  weeklyReport:   true,
};

export async function getNotificationPrefs(tenantId) {
  const biz = await prisma.business.findUnique({ where: { tenantId }, select: { settings: true } });
  const stored = biz?.settings?.notificationPrefs ?? {};
  return { ...DEFAULT_PREFS, ...stored };
}

export async function updateNotificationPrefs(tenantId, prefs) {
  const biz = await prisma.business.findUnique({ where: { tenantId }, select: { settings: true } });
  const current = biz?.settings ?? {};
  const merged = { ...DEFAULT_PREFS, ...(current.notificationPrefs ?? {}), ...prefs };
  await prisma.business.update({
    where: { tenantId },
    data: { settings: { ...current, notificationPrefs: merged } },
  });
  return merged;
}

export async function notify(tenantId, { type, title, body, metadata, outbound = true, emailSubject, emailHtml } = {}) {
  // 1. In-app (never throws)
  await createInApp(tenantId, { type, title, body, metadata });

  if (!outbound) return;

  // 2. Look up tenant owner contact details + notification prefs in one shot
  try {
    const [tenant, prefs] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { users: { take: 1, orderBy: { createdAt: 'asc' }, select: { email: true } } },
      }),
      getNotificationPrefs(tenantId),
    ]);

    const ownerEmail = tenant?.users?.[0]?.email;
    if (!ownerEmail) return;

    // Global email toggle
    if (!prefs.emailNotif) return;

    // Per-type preference check
    const prefKey = TYPE_TO_PREF[type];
    if (prefKey && !prefs[prefKey]) return;

    // Email — enqueued for background delivery with retries
    await enqueue({
      tenantId,
      channel: 'email',
      to: ownerEmail,
      subject: emailSubject || title,
      text: body,
      html: emailHtml || `<p>${body}</p>`,
    });
  } catch (err) {
    logger.warn({ err: err?.message, tenantId, type }, '[notification] failed to enqueue outbound notification');
  }
}

export async function listForTenant(tenantId, { limit = 30 } = {}) {
  return prisma.notification.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getUnreadCount(tenantId) {
  return prisma.notification.count({ where: { tenantId, read: false } });
}

export async function markAllRead(tenantId) {
  return prisma.notification.updateMany({ where: { tenantId, read: false }, data: { read: true } });
}

export async function markOneRead(tenantId, id) {
  return prisma.notification.updateMany({ where: { id, tenantId }, data: { read: true } });
}

/**
 * Send weekly performance report emails to all tenants that have weeklyReport enabled.
 * Called by cron every Monday at 8am.
 */
export async function sendWeeklyReports() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (n) => `₦${(n / 100).toLocaleString('en-NG')}`;

  // Get all tenants with their owner email and biz name
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      users: { take: 1, orderBy: { createdAt: 'asc' }, select: { email: true } },
      business: { select: { displayName: true, settings: true } },
    },
  });

  let sent = 0;

  for (const tenant of tenants) {
    const ownerEmail = tenant.users?.[0]?.email;
    if (!ownerEmail) continue;

    const prefs = {
      ...DEFAULT_PREFS,
      ...(tenant.business?.settings?.notificationPrefs ?? {}),
    };
    if (!prefs.weeklyReport || !prefs.emailNotif) continue;

    const tenantId = tenant.id;
    const businessName = tenant.business?.displayName || tenant.name;

    try {
      // Fetch weekly stats in parallel
      const [orderCount, revenueAgg, newCustomers, conversationCount, escalationCount] = await Promise.all([
        prisma.order.count({ where: { tenantId, createdAt: { gte: since } } }),
        prisma.order.aggregate({ where: { tenantId, createdAt: { gte: since } }, _sum: { totalMinor: true } }),
        prisma.customer.count({ where: { tenantId, createdAt: { gte: since } } }),
        prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
        prisma.conversation.count({ where: { tenantId, status: 'escalated', updatedAt: { gte: since } } }),
      ]);

      const revenue = revenueAgg._sum.totalMinor ?? 0;
      const weekLabel = since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const todayLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
          <div style="background:#4166F5;padding:28px 32px">
            <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700">${businessName}</h1>
            <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px">Weekly Report · ${weekLabel} – ${todayLabel}</p>
          </div>

          <div style="padding:28px 32px">
            <p style="color:#475569;font-size:14px;margin:0 0 24px">Here's how your business performed over the last 7 days.</p>

            <!-- Stats grid -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:12px">
              <tr>
                <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;width:50%">
                  <div style="font-size:26px;font-weight:800;color:#4166F5">${orderCount}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px">Orders Received</div>
                </td>
                <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;width:50%">
                  <div style="font-size:26px;font-weight:800;color:#059669">${fmt(revenue)}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px">Revenue</div>
                </td>
              </tr>
              <tr>
                <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
                  <div style="font-size:26px;font-weight:800;color:#7c3aed">${newCustomers}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px">New Customers</div>
                </td>
                <td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
                  <div style="font-size:26px;font-weight:800;color:#0891b2">${conversationCount}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px">WhatsApp Chats</div>
                </td>
              </tr>
            </table>

            ${escalationCount > 0 ? `
            <div style="margin-top:20px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px">
              <p style="color:#dc2626;margin:0;font-size:13px;font-weight:600">⚠️ ${escalationCount} conversation${escalationCount > 1 ? 's' : ''} needed human attention this week</p>
              <p style="color:#64748b;margin:6px 0 0;font-size:12px">Check your WhatsApp inbox for escalated conversations.</p>
            </div>` : `
            <div style="margin-top:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px">
              <p style="color:#16a34a;margin:0;font-size:13px;font-weight:600">✅ No escalations this week — AI handled everything</p>
            </div>`}

            <a href="${process.env.FRONTEND_URL || 'https://www.biziq.online'}/dashboard" style="display:block;text-align:center;margin-top:24px;padding:13px 24px;background:#4166F5;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
              View Full Dashboard
            </a>
          </div>

          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
            <p style="color:#94a3b8;font-size:11px;margin:0">
              You're receiving this because weekly reports are enabled in your BizIQ notification settings.
              <br>BizIQ · AI-powered business platform
            </p>
          </div>
        </div>
      `;

      await enqueue({
        tenantId,
        channel: 'email',
        to: ownerEmail,
        subject: `📊 Your weekly report is ready — ${businessName}`,
        text: `Orders: ${orderCount} | Revenue: ${fmt(revenue)} | New customers: ${newCustomers} | Chats: ${conversationCount}`,
        html,
      });

      sent++;
    } catch (err) {
      logger.error({ err: err.message, tenantId }, '[weekly-report] failed for tenant');
    }
  }

  return { sent };
}
