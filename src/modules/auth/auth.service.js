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

const INACTIVITY_MS = 10 * 60 * 1000;

const buildTokenPayload = (user) => ({
  sub: user.id,
  tenantId: user.tenantId,
  isSuperAdmin: user.isSuperAdmin,
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
  if (existing) throw new BadRequestError('Email already in use');

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

  // Fetch subscription so the frontend can restore state across browsers
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

export default { register, login, refresh, logout, forgotPassword, resetPassword };
