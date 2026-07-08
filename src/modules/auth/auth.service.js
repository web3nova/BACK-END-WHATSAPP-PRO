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
import { startTrial } from '../billing/billing.service.js';

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

  const tokens = await issueTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

export const login = async ({ email, password }) => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  if (user.isBanned) throw new UnauthorizedError('Your account has been banned');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  // Invalidate any prior unused OTPs for this user
  await prisma.otpToken.updateMany({ where: { userId: user.id, used: false }, data: { used: true } });

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  const expiresAt = new Date(Date.now() + OTP_TTL_MINS * 60 * 1000);
  await prisma.otpToken.create({ data: { userId: user.id, code, expiresAt } });

  await sendMail({
    to: user.email,
    subject: 'Your BizIQ login code',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2 style="color:#1e293b">Your login code</h2>
        <p style="color:#475569">Use this code to complete your sign-in. It expires in ${OTP_TTL_MINS} minutes.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#4166F5;margin:24px 0">${code}</div>
        <p style="color:#94a3b8;font-size:13px">If you didn't try to sign in, you can ignore this email.</p>
      </div>
    `,
  });

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

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: user.tenantId },
    select: { id: true, plan: true, status: true, trialEndsAt: true },
  });

  const tokens = await issueTokens(user);
  return { user: sanitizeUser(user), subscription, ...tokens };
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

export const forgotPassword = async ({ email }) => {
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

  const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;

  await sendMail({
    to:      email,
    subject: 'Reset your password',
    html: `
      <p>You requested a password reset.</p>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
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

  await sendMail({
    to: user.email,
    subject: 'Your new BizIQ login code',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto">
        <h2 style="color:#1e293b">New login code</h2>
        <p style="color:#475569">Here is your new sign-in code. It expires in ${OTP_TTL_MINS} minutes.</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#4166F5;margin:24px 0">${code}</div>
      </div>
    `,
  });

  return { sent: true };
};

export default { register, login, verifyOtp, resendOtp, refresh, logout, forgotPassword, resetPassword };
