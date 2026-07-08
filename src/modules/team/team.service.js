import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { sendMail } from '../../config/mailer.js';
import { config } from '../../config/index.js';

const INVITE_TTL_HOURS = 48;

export const listMembers = async (tenantId) => {
  const [members, invites] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, teamRole: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.invite.findMany({
      where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return { members, pendingInvites: invites };
};

export const sendInvite = async (tenantId, { email, role = 'member' }, inviterName) => {
  const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } });
  if (existing) throw Object.assign(new Error('This email already belongs to a team member.'), { statusCode: 409 });

  // Block inviting someone who already owns their own business account
  const ownerElsewhere = await prisma.user.findFirst({ where: { email, teamRole: 'owner' } });
  if (ownerElsewhere) throw Object.assign(new Error('This email is already registered as a business owner and cannot be added as a team member.'), { statusCode: 409 });

  // Upsert: resend clears old token
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  await prisma.invite.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: { token, role, expiresAt, acceptedAt: null },
    create: { tenantId, email, role, token, expiresAt },
  });

  const link = `${config.frontendUrl}/accept-invite?token=${token}`;
  await sendMail({
    to: email,
    subject: `You've been invited to join ${inviterName || 'a team'} on BizIQ`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1e293b">You're invited!</h2>
        <p>${inviterName || 'A team owner'} has invited you to join their business on <strong>BizIQ</strong> as a <strong>${role}</strong>.</p>
        <p>This invite expires in ${INVITE_TTL_HOURS} hours.</p>
        <a href="${link}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#4f6ef7;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
          Accept Invite
        </a>
        <p style="color:#64748b;font-size:13px">Or copy this link: ${link}</p>
      </div>
    `,
  });

  return { email, role, expiresAt };
};

export const acceptInvite = async ({ token, name, password }) => {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) throw Object.assign(new Error('Invalid or expired invite link.'), { statusCode: 400 });
  if (invite.acceptedAt) throw Object.assign(new Error('This invite has already been used.'), { statusCode: 400 });
  if (invite.expiresAt < new Date()) throw Object.assign(new Error('This invite has expired. Ask the owner to resend it.'), { statusCode: 400 });

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: invite.tenantId, email: invite.email } },
  });
  if (existing) throw Object.assign(new Error('An account with this email already exists.'), { statusCode: 409 });

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await prisma.$transaction([
    prisma.user.create({
      data: { tenantId: invite.tenantId, email: invite.email, name, passwordHash, teamRole: invite.role },
    }),
    prisma.invite.update({
      where: { token },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
};

export const removeMember = async (tenantId, userId, requesterId) => {
  if (userId === requesterId) throw Object.assign(new Error('You cannot remove yourself.'), { statusCode: 400 });
  const member = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!member) throw Object.assign(new Error('Member not found.'), { statusCode: 404 });
  await prisma.user.delete({ where: { id: userId } });
};

export const cancelInvite = async (tenantId, inviteId) => {
  const invite = await prisma.invite.findFirst({ where: { id: inviteId, tenantId } });
  if (!invite) throw Object.assign(new Error('Invite not found.'), { statusCode: 404 });
  await prisma.invite.delete({ where: { id: inviteId } });
};
