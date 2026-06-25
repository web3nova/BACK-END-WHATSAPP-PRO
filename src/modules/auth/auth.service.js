// src/modules/auth/auth.service.js
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
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

const buildTokenPayload = (user) => ({
  sub: user.id,
  tenantId: user.tenantId,
  isSuperAdmin: user.isSuperAdmin,
  roleId: user.roleId,
});

const issueTokens = (user) => ({
  accessToken: signAccessToken(buildTokenPayload(user)),
  refreshToken: signRefreshToken({ sub: user.id }),
});

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

  const tokens = issueTokens(user);
  return { tenant, user: sanitizeUser(user), ...tokens };
};

export const login = async ({ email, password }) => {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const tokens = issueTokens(user);
  return { user: sanitizeUser(user), ...tokens };
};

export const refresh = async ({ refreshToken }) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new NotFoundError('User not found');

  const tokens = issueTokens(user);
  return tokens;
};

const sanitizeUser = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
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

  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;

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

export default { register, login, refresh, forgotPassword, resetPassword };