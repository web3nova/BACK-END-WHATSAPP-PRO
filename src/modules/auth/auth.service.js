// src/modules/auth/auth.service.js
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { config } from '../../config/index.js';
import { hashPassword, comparePassword } from '../../common/utils/hash.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../common/utils/token.js';
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
} from '../../common/errors/index.js';
import { sendMail } from '../../config/mailer.js';
import { logger } from '../../config/logger.js';
import { startTrial } from '../billing/billing.service.js';
import { otpEmail, passwordResetEmail } from '../../config/emailTemplates.js';
import { trackEvent } from '../../services/tiktok.js';

const INACTIVITY_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const OTP_TTL_MINS = 10;

const buildTokenPayload = (user) => ({
  sub: user.id,
  tenantId: user.tenantId,
  isSuperAdmin: user.isSuperAdmin,
  teamRole: user.teamRole ?? 'owner',
  roleId: user.roleId,
});

const issueTokens = async (user) => {
  const accessToken = signAccessToken(buildTokenPayload(user));
  const { token: refreshToken, jti, expiresAt } = signRefreshToken({ sub: user.id });

  await prisma.refreshToken.create({
    data: { userId: user.id, jti, expiresAt },
  });

  return { accessToken, refreshToken };
};

const sanitizeUser = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

export const register = async ({ email, password, name, tenantName }) => {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    const msg = existing.teamRole !== 'owner'
      ? 'This email is already a team member in another business. Use a different email to create your own account.'
      : 'Email already in use';
    throw new BadRequestError(msg);
  }

  const passwordHash = await hashPassword(password);
  const baseSlug = tenantName.toLowerCase().trim().replace(/\s+/g, '-');

  // Ensure the slug is unique — append a short hex suffix when taken
  const slugTaken = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
  const slug = slugTaken
    ? `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`
    : baseSlug;

  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name: tenantName, slug },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        name,
        isSuperAdmin: false,
      },
    });

    return { tenant, user };
  });

  await startTrial(tenant.id);

  trackEvent({
    event: 'CompleteRegistration',
    properties: { email, name },
    context: { email },
  });

  const tokens = await issueTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

// Shared by verifyOtp and the reviewer-account bypass in login() below, so
// both produce an identical final response — the bypass reuses this instead
// of duplicating it, so it can't silently drift out of sync.
async function completeLogin(user) {
  // Super admins have no tenant (tenantId is null) — skip the lookup rather
  // than querying a non-nullable unique column with null, which Prisma rejects.
  const subscription = user.tenantId
    ? await prisma.subscription.findUnique({
        where: { tenantId: user.tenantId },
        select: { id: true, plan: true, status: true, trialEndsAt: true },
      })
    : null;

  const tokens = await issueTokens(user);
  return { user: sanitizeUser(user), subscription, ...tokens };
}

export const login = async ({ email, password }) => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  if (user.isBanned) throw new UnauthorizedError('Your account has been banned');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  // App-store/platform reviewer account (e.g. Meta App Review): automated
  // reviewers can't receive a real OTP email, so this ONE exact,
  // env-configured account skips OTP and logs straight in — password is
  // still required and already checked above. Does nothing at all unless
  // REVIEWER_TEST_EMAIL is explicitly set, and never applies to any other
  // account regardless of what email is submitted.
  const reviewerEmail = process.env.REVIEWER_TEST_EMAIL?.toLowerCase().trim();
  if (reviewerEmail && email.toLowerCase().trim() === reviewerEmail) {
    logger.warn({ userId: user.id, email: user.email }, '[auth] reviewer test-account login — OTP skipped');
    return completeLogin(user);
  }

  // Invalidate any prior unused OTPs for this user
  await prisma.otpToken.updateMany({ where: { userId: user.id, used: false }, data: { used: true } });

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000);
  await prisma.otpToken.create({ data: { userId: user.id, code, expiresAt } });

  // Fire-and-forget — don't block the response waiting for Resend
  sendMail({
    to: user.email,
    subject: 'Your BizIQ login code',
    html: otpEmail({ code, ttlMinutes: OTP_TTL_MINS }),
  }).catch((err) => logger.error(`[auth] OTP email failed for ${user.email}: ${err.message}`));

  return { requiresOtp: true, userId: user.id, email: user.email };
};

export const verifyOtp = async ({ userId, code }) => {
  const record = await prisma.otpToken.findFirst({
    where: { userId, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) throw new UnauthorizedError('Invalid or expired code. Request a new one.');

  await prisma.otpToken.update({ where: { id: record.id }, data: { used: true } });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  return completeLogin(user);
};

export const refresh = async ({ refreshToken }) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Tokens issued before the jti field was introduced have no jti claim
  if (!payload.jti) throw new UnauthorizedError('Invalid or expired refresh token');

  const record = await prisma.refreshToken.findUnique({
    where: { jti: payload.jti },
  });

  if (!record) throw new UnauthorizedError('Session not found, please log in again');

  // Enforce 10-minute inactivity timeout
  if (Date.now() - record.lastUsedAt.getTime() > INACTIVITY_MS) {
    await prisma.refreshToken.delete({ where: { id: record.id } });
    throw new UnauthorizedError('Session expired due to inactivity');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { accessToken: signAccessToken(buildTokenPayload(user)) };
};

export const logout = async ({ refreshToken }) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return; // Already invalid — nothing to invalidate
  }
  if (payload?.jti) {
    await prisma.refreshToken.deleteMany({ where: { jti: payload.jti } });
  }
};

// Apps allowed to receive a user back after password reset. The main app and
// the internal admin dashboard have separate frontends/domains — the reset
// link must point at whichever one the request actually came from.
const RESET_ORIGIN_ALLOWLIST = [
  config.frontendUrl,
  'https://biziq-admin.vercel.app',
  'https://admin.biziq.online',
  'http://localhost:5174',
].filter(Boolean);

export const forgotPassword = async ({ email, origin }) => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) return;

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const base = origin && RESET_ORIGIN_ALLOWLIST.includes(origin) ? origin : config.frontendUrl;
  const resetUrl = `${base}/reset-password?token=${token}`;

  sendMail({
    to:      email,
    subject: 'Reset your BizIQ password',
    html: passwordResetEmail({ resetUrl }),
  }).catch((err) => logger.error(`[auth] Password reset email failed for ${email}: ${err.message}`));
};

export const resetPassword = async ({ token, password }) => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record)                       throw new BadRequestError('Invalid or expired reset token');
  if (record.used)                   throw new BadRequestError('Reset token has already been used');
  if (record.expiresAt < new Date()) throw new BadRequestError('Reset token has expired');

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { used: true },
    }),
  ]);

  return { message: 'Password reset successfully' };
};

export const resendOtp = async ({ userId }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');

  await prisma.otpToken.updateMany({ where: { userId, used: false }, data: { used: true } });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000);
  await prisma.otpToken.create({ data: { userId, code, expiresAt } });

  sendMail({
    to: user.email,
    subject: 'Your new BizIQ login code',
    html: otpEmail({ code, ttlMinutes: OTP_TTL_MINS, isResend: true }),
  }).catch((err) => logger.error(`[auth] Resend OTP email failed for ${user.email}: ${err.message}`));

  return { sent: true };
};

export default { register, login, verifyOtp, resendOtp, refresh, logout, forgotPassword, resetPassword };
