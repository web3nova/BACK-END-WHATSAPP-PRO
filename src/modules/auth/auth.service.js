// src/modules/auth/auth.service.js
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

export default { register, login, refresh };