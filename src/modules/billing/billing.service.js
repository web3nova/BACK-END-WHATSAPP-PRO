// src/modules/billing/billing.service.js
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { config } from '../../config/index.js';
import { sendMail } from '../../config/mailer.js';
import { BadRequestError, NotFoundError } from '../../common/errors/index.js';
import { notify } from '../notifications/notification.service.js';
import { trialWelcomeEmail, paymentConfirmedEmail, trialEndingEmail, renewalReminderEmail } from '../../config/emailTemplates.js';
import { trackEvent } from '../../services/tiktok.js';

const TRIAL_DAYS = 14;

// We don't auto-debit renewals (no card-on-file/recurring charge — Monnify
// checkout is a one-off manual payment each period), so cutting access the
// instant renewsAt passes would punish a business owner who's just a day
// late on a bank transfer, not one who's actually churned. This grace
// window keeps them active past renewsAt so a late-but-genuine renewal
// doesn't break an in-progress customer conversation.
const RENEWAL_GRACE_DAYS = 3;

// ── Is this tenant currently allowed to use the product? ─────────────────────
// Shared by the route-level requireActiveSubscription() middleware AND the AI
// reply job — a lapsed tenant shouldn't just lose dashboard access, their
// WhatsApp number should stop auto-replying too, otherwise the core paid
// feature keeps running for free in the background.
export const isSubscriptionActive = async (tenantId) => {
  // MVP/onboarding phase — see config.billing.enforceGate comment.
  if (!config.billing.enforceGate) return true;

  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return false;
  // renewsAt is when the current paid period runs out — a lifetime/no-expiry
  // ACTIVE row (renewsAt null, e.g. an admin override) stays active.
  if (sub.status === 'ACTIVE' && (!sub.renewsAt || graceDeadline(sub.renewsAt) > new Date())) return true;
  if (sub.status === 'TRIAL' && sub.trialEndsAt > new Date()) return true;
  return false;
};

const graceDeadline = (renewsAt) => new Date(renewsAt.getTime() + RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000);

// ── Helpers ──────────────────────────────────────────────────────────────────

const getMonnifyToken = async () => {
  const credentials = Buffer.from(
    `${config.monnify.apiKey}:${config.monnify.secretKey}`
  ).toString('base64');

  const res = await fetch(`${config.monnify.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!data.requestSuccessful) {
    throw new BadRequestError('Failed to authenticate with Monnify');
  }
  return data.responseBody.accessToken;
};

// ── Start free trial on registration ─────────────────────────────────────────

export const startTrial = async (tenantId) => {
  const trialStartsAt = new Date();
  const trialEndsAt   = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const existing = await prisma.subscription.findUnique({ where: { tenantId } });

  // If an active trial or paid subscription already exists, leave it alone
  if (existing && (existing.status === 'ACTIVE' || (existing.status === 'TRIAL' && existing.trialEndsAt > new Date()))) {
    return existing;
  }

  // A trial is a one-time perk — once used (even if it since expired or was
  // cancelled), never grant a second one. Only genuinely new tenants (no
  // subscription row yet) fall through to create one below.
  if (existing?.hasUsedTrial) {
    throw new BadRequestError('Your free trial has already been used. Please subscribe to a plan to continue.');
  }

  const sub = await prisma.subscription.upsert({
    where:  { tenantId },
    update: { status: 'TRIAL', trialStartsAt, trialEndsAt, hasUsedTrial: true },
    create: { tenantId, status: 'TRIAL', trialStartsAt, trialEndsAt, hasUsedTrial: true },
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

  notify(tenantId, {
    type: 'trial_started',
    title: 'Your 14-day free trial has started',
    body: `You have full access until ${trialEndsAt.toDateString()}. Upgrade anytime to keep access.`,
    emailSubject: 'Welcome to BizIQ — your free trial has started 🎉',
    emailHtml: trialWelcomeEmail({ businessName: tenant?.name, trialEndsAt }),
    outbound: true,
  }).catch(() => {});

  trackEvent({ event: 'StartTrial', context: {} });

  return sub;
};

// ── Get subscription for a tenant ────────────────────────────────────────────

export const getSubscription = async (tenantId) => {
  if (!tenantId) return null;
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return null;

  const now = new Date();
  const isTrialExpired = sub.status === 'TRIAL' && sub.trialEndsAt && sub.trialEndsAt < now;
  // renewsAt null means no expiry (e.g. an admin-set lifetime override) — not
  // expired. Past renewsAt but still inside RENEWAL_GRACE_DAYS isn't expired
  // either — see the comment on RENEWAL_GRACE_DAYS above.
  const isExpired = sub.status === 'ACTIVE' && sub.renewsAt && graceDeadline(sub.renewsAt) < now;

  return {
    status: isTrialExpired || isExpired ? 'EXPIRED' : sub.status,
    plan: sub.planId ?? null,
    trialEndsAt: sub.trialEndsAt ?? null,
    currentPeriodEnd: sub.renewsAt ?? null,
    isActive: !isTrialExpired && !isExpired && (sub.status === 'TRIAL' || sub.status === 'ACTIVE'),
    hasUsedTrial: sub.hasUsedTrial,
    // MVP/onboarding phase — see config.billing.enforceGate comment in
    // config/index.js. The frontend uses this to decide whether an
    // expired/cancelled subscription should actually lock the tenant out.
    gatingEnabled: config.billing.enforceGate,
  };
};

// ── Get available billing plans ───────────────────────────────────────────────

export const getPlans = async () => {
  return prisma.billingPlan.findMany({
    where:   { isActive: true },
    orderBy: { priceMinor: 'asc' },
  });
};

// ── Initialize Monnify Checkout ───────────────────────────────────────────────

export const initializePayment = async (tenantId, planId) => {
  if (!tenantId) throw new BadRequestError('Super admin accounts cannot initialize payments');

  const tenant = await prisma.tenant.findUnique({
    where:   { id: tenantId },
    include: { subscription: true, users: { take: 1, orderBy: { createdAt: 'asc' } } },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  // Already paid and mid-cycle — you can only pick a plan again once the
  // current paid period ends. Otherwise the webhook would blindly overwrite
  // renewsAt/planId on a second purchase, which can shorten (not extend)
  // time already paid for, or silently swap the plan they're currently on.
  const currentSub = tenant.subscription;
  if (currentSub?.status === 'ACTIVE' && currentSub.renewsAt && currentSub.renewsAt > new Date()) {
    throw new BadRequestError(`You already have an active subscription until ${currentSub.renewsAt.toDateString()}. You can choose a new plan once your current period ends.`);
  }

  const plan = await prisma.billingPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Billing plan not found');
  if (!plan.isActive) throw new BadRequestError('This plan is no longer available');

  const ownerEmail = tenant.users[0]?.email;
  if (!ownerEmail) throw new BadRequestError('No user found for this tenant');

  const reference = `SUB-${tenantId}-${Date.now()}`;
  const token     = await getMonnifyToken();

  const res = await fetch(`${config.monnify.baseUrl}/api/v1/merchant/transactions/init-transaction`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount:                plan.priceMinor / 100, // convert kobo to naira
      customerName:          tenant.name,
      customerEmail:         ownerEmail,
      paymentReference:      reference,
      paymentDescription:    `${plan.label} subscription - ${tenant.name}`,
      currencyCode:          plan.currency,
      contractCode:          config.monnify.contractCode,
      redirectUrl:           `${config.frontendUrl}/billing/callback`,
      paymentMethods:        ['CARD', 'ACCOUNT_TRANSFER'],
    }),
  });

  const data = await res.json();
  if (!data.requestSuccessful) {
    throw new BadRequestError('Failed to initialize payment with Monnify');
  }

  // Save pending payment record
  await prisma.payment.create({
    data: {
      tenantId,
      reference,
      provider:    'monnify',
      amountMinor: plan.priceMinor,
      currency:    plan.currency,
      status:      'pending',
      meta:        { planId, checkoutUrl: data.responseBody.checkoutUrl },
    },
  });

  return {
    checkoutUrl: data.responseBody.checkoutUrl,
    reference,
  };
};

// ── Monnify Webhook ───────────────────────────────────────────────────────────

export const handleWebhook = async (payload, signature) => {
  // Verify webhook signature
  const hash = crypto
    .createHmac('sha512', config.monnify.secretKey)
    .update(JSON.stringify(payload))
    .digest('hex');

  if (hash !== signature) {
    throw new BadRequestError('Invalid webhook signature');
  }

  const { paymentReference, paymentStatus, transactionReference } = payload;

  if (paymentStatus !== 'PAID') return { ignored: true };

  const payment = await prisma.payment.findUnique({ where: { reference: paymentReference } });
  if (!payment) throw new NotFoundError('Payment record not found');
  if (payment.status === 'success') return { ignored: true }; // already processed

  const planId = payment.meta?.planId;
  const plan   = planId ? await prisma.billingPlan.findUnique({ where: { id: planId } }) : null;

  // Extend from whichever is later — "now" for a fresh/lapsed subscriber, or
  // their existing renewsAt if they still had paid time left (e.g. an early
  // renewal) — never shorten time they've already paid for.
  const existingSub = await prisma.subscription.findUnique({ where: { tenantId: payment.tenantId } });
  const base = existingSub?.renewsAt && existingSub.renewsAt > new Date() ? existingSub.renewsAt : new Date();
  const renewsAt = plan
    ? new Date(base.getTime() + plan.intervalDays * 24 * 60 * 60 * 1000)
    : null;

  await prisma.$transaction([
    prisma.payment.update({
      where: { reference: paymentReference },
      data:  { status: 'success', providerReference: transactionReference },
    }),
    prisma.subscription.update({
      where: { tenantId: payment.tenantId },
      data:  { status: 'ACTIVE', planId: planId || undefined, renewsAt, monnifyRef: transactionReference },
    }),
  ]);

  // Notify — in-app record + a single branded confirmation email (this used
  // to also fire a separate sendMail() with the same subject, so merchants
  // were getting the same "payment confirmed" news twice: once nicely
  // branded, once as a plain-text notify() fallback).
  const tenant = await prisma.tenant.findUnique({
    where:   { id: payment.tenantId },
    select:  { name: true },
  });

  notify(payment.tenantId, {
    type: 'payment_received',
    title: 'Payment confirmed — subscription active',
    body: `₦${(payment.amountMinor / 100).toLocaleString()} received. Your subscription is now active${renewsAt ? ` until ${renewsAt.toDateString()}` : ''}.`,
    emailSubject: 'Payment confirmed — your subscription is active',
    emailHtml: paymentConfirmedEmail({ businessName: tenant?.name, amountMinor: payment.amountMinor, renewsAt }),
    metadata: { reference: paymentReference, planId },
    outbound: true,
  }).catch(() => {});

  trackEvent({
    event: 'Subscribe',
    properties: { planId, amount: payment.amountMinor, currency: payment.currency },
    context: { email: ownerEmail },
  });

  return { success: true };
};

// ── Admin: create or update a billing plan ────────────────────────────────────

export const upsertPlan = async ({ name, label, priceMinor, currency, intervalDays, isActive }) => {
  return prisma.billingPlan.upsert({
    where:  { name },
    update: { label, priceMinor, currency, intervalDays, isActive },
    create: { name, label, priceMinor, currency: currency || 'NGN', intervalDays, isActive: isActive ?? true },
  });
};

// ── Cron: send trial reminder emails ─────────────────────────────────────────

export const sendTrialReminders = async () => {
  const now = new Date();

  // Day 3 reminder — 2 days left
  const day3Start = new Date(now);
  day3Start.setDate(day3Start.getDate() + 2);
  day3Start.setHours(0, 0, 0, 0);
  const day3End = new Date(day3Start);
  day3End.setHours(23, 59, 59, 999);

  // Day 5 reminder — trial ends today
  const day5Start = new Date(now);
  day5Start.setHours(0, 0, 0, 0);
  const day5End = new Date(now);
  day5End.setHours(23, 59, 59, 999);

  const [day3Subs, day5Subs] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: 'TRIAL', trialEndsAt: { gte: day3Start, lte: day3End } },
      include: { tenant: { include: { users: { take: 1, orderBy: { createdAt: 'asc' } } } } },
    }),
    prisma.subscription.findMany({
      where: { status: 'TRIAL', trialEndsAt: { gte: day5Start, lte: day5End } },
      include: { tenant: { include: { users: { take: 1, orderBy: { createdAt: 'asc' } } } } },
    }),
  ]);

  for (const sub of day3Subs) {
    const email = sub.tenant.users[0]?.email;
    if (!email) continue;
    await sendMail({
      to:      email,
      subject: 'Your free trial ends in 2 days',
      html: trialEndingEmail({ businessName: sub.tenant.name, trialEndsAt: sub.trialEndsAt, isToday: false }),
    });
  }

  for (const sub of day5Subs) {
    const email = sub.tenant.users[0]?.email;
    if (!email) continue;
    await sendMail({
      to:      email,
      subject: 'Your free trial ends today',
      html: trialEndingEmail({ businessName: sub.tenant.name, trialEndsAt: sub.trialEndsAt, isToday: true }),
    });
  }

  return { day3: day3Subs.length, day5: day5Subs.length };
};

// ── Cron: send monthly billing reminder ──────────────────────────────────────

export const sendMonthlyBillingReminders = async () => {
  const now       = new Date();
  const in3Days   = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);
  in3Days.setHours(23, 59, 59, 999);

  const subs = await prisma.subscription.findMany({
    where: {
      status:   'ACTIVE',
      renewsAt: { gte: now, lte: in3Days },
    },
    include: {
      tenant: { include: { users: { take: 1, orderBy: { createdAt: 'asc' } } } },
      plan:   true,
    },
  });

  for (const sub of subs) {
    const email = sub.tenant.users[0]?.email;
    if (!email) continue;
    const amount = sub.plan ? `₦${(sub.plan.priceMinor / 100).toLocaleString()}` : 'your plan amount';
    await sendMail({
      to:      email,
      subject: 'Your subscription renews in 3 days',
      html: renewalReminderEmail({ businessName: sub.tenant.name, planLabel: sub.plan?.label, amount, renewsAt: sub.renewsAt }),
    });
  }

  return { sent: subs.length };
};

export default {
  startTrial,
  getPlans,
  initializePayment,
  handleWebhook,
  upsertPlan,
  sendTrialReminders,
  sendMonthlyBillingReminders,
};