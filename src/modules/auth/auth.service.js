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

// 10 minutes of inactivity → force OTP re-authentication
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

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sanitizeUser = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

const sendOtp = async (user) => {
  // Invalidate any existing unused OTPs for this user
  await prisma.otpToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const code      = generateOtp();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5); // 5 minutes

  await prisma.otpToken.create({
    data: { userId: user.id, code, expiresAt },
  });

  return { code, email: user.email, name: user.name };
};

export const register = async ({ email, password, name, tenantName }) => {
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) throw new BadRequestError('Email already in use');

  const passwordHash = await hashPassword(password);
  const slug = tenantName.toLowerCase().trim().replace(/\s+/g, '-');

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

  const { code } = await sendOtp(user);

  await sendMail({
    to:      email,
    subject: 'Complete your registration — verify your email',
    html: `
      <p>Hi${name ? ` ${name}` : ''},</p>
      <p>Your account has been created. Enter the code below to complete setup:</p>
      <h2 style="letter-spacing: 4px;">${code}</h2>
      <p>This code expires in <strong>5 minutes</strong>.</p>
      <p>If you did not create this account, please ignore this email.</p>
    `,
  });

  return { message: 'Registration successful. Check your email for an OTP to complete setup.' };
};

export const login = async ({ email, password }) => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  if (user.isBanned) throw new UnauthorizedError('Your account has been banned');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const { code } = await sendOtp(user);

  await sendMail({
    to:      email,
    subject: 'Your login OTP',
    html: `
      <p>Hi${user.name ? ` ${user.name}` : ''},</p>
      <p>Your one-time login code is:</p>
      <h2 style="letter-spacing: 4px;">${code}</h2>
      <p>This code expires in <strong>5 minutes</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });

  return { message: 'OTP sent to your email' };
};

export const verifyOtp = async ({ email, otp }) => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  if (user.isBanned) throw new UnauthorizedError('Your account has been banned');

  const record = await prisma.otpToken.findFirst({
    where: { userId: user.id, code: otp, used: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!record)                       throw new BadRequestError('Invalid OTP');
  if (record.expiresAt < new Date()) throw new BadRequestError('OTP has expired');

  await prisma.otpToken.update({
    where: { id: record.id },
    data: { used: true },
  });

  const tokens = await issueTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

export const refresh = async ({ refreshToken }) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

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

export default { register, login, verifyOtp, refresh, logout, forgotPassword, resetPassword };
