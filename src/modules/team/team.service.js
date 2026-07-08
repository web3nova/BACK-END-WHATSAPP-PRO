import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { sendMail } from '../../config/mailer.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';

const INVITE_TTL_HOURS = 48;

const ROLE_LABELS = {
  admin: 'Admin',
  member: 'Member',
};

const ROLE_DESCRIPTIONS = {
  admin: 'Admins can manage products, orders, customers, WhatsApp, analytics, knowledge base, and payments. They cannot access billing or team settings.',
  member: 'Members can view and manage orders, products, customers, WhatsApp conversations, and analytics.',
};

async function getBusinessInfo(tenantId) {
  const [tenant, business] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.business.findUnique({ where: { tenantId }, select: { displayName: true, logoUrl: true, category: true, location: true } }).catch(() => null),
  ]);
  return {
    businessName: business?.displayName || tenant?.name || 'A business',
    logoUrl: business?.logoUrl || null,
    category: business?.category || null,
    location: business?.location || null,
  };
}

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
  const { businessName, logoUrl, category, location } = await getBusinessInfo(tenantId);
  const roleLabel = ROLE_LABELS[role] || role;
  const roleDesc = ROLE_DESCRIPTIONS[role] || '';
  const expiryDate = expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  sendMail({
    to: email,
    subject: `${inviterName || 'Someone'} invited you to join ${businessName} on BizIQ`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">

        <!-- Header -->
        <div style="background:#4166F5;padding:32px 32px 24px;text-align:center">
          ${logoUrl
            ? `<img src="${logoUrl}" alt="${businessName}" style="height:52px;width:52px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.3);margin-bottom:12px;display:block;margin-left:auto;margin-right:auto">`
            : `<div style="height:52px;width:52px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff">${businessName[0].toUpperCase()}</div>`}
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700">${businessName}</h1>
          ${category ? `<p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px">${category}${location ? ` · ${location}` : ''}</p>` : ''}
        </div>

        <!-- Body -->
        <div style="padding:32px">
          <h2 style="color:#1e293b;margin:0 0 8px;font-size:18px">You've been invited to join the team</h2>
          <p style="color:#475569;margin:0 0 24px;font-size:14px;line-height:1.6">
            <strong>${inviterName || 'The business owner'}</strong> has invited you to join <strong>${businessName}</strong> on BizIQ as a <strong>${roleLabel}</strong>.
          </p>

          <!-- Role card -->
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:24px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <span style="background:#4166F5;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px">${roleLabel}</span>
            </div>
            <p style="color:#475569;margin:0;font-size:13px;line-height:1.6">${roleDesc}</p>
          </div>

          <!-- CTA -->
          <a href="${link}" style="display:block;text-align:center;padding:14px 24px;background:#4166F5;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-bottom:16px">
            Accept Invitation
          </a>

          <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0 0 8px">
            This invite expires on <strong>${expiryDate}</strong>. After accepting, you'll create a password and log in immediately.
          </p>
          <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0">
            If the button doesn't work, copy this link:<br>
            <a href="${link}" style="color:#4166F5;word-break:break-all">${link}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
          <p style="color:#94a3b8;font-size:11px;margin:0">
            If you weren't expecting this invite, you can safely ignore this email. It will expire automatically.
          </p>
          <p style="color:#94a3b8;font-size:11px;margin:6px 0 0">
            BizIQ · AI-powered business platform
          </p>
        </div>
      </div>
    `,
  }).catch((err) => logger.error(`[team] Invite email failed for ${email}: ${err.message}`));

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

export const removeMember = async (tenantId, userId, requesterId, requesterName) => {
  if (userId === requesterId) throw Object.assign(new Error('You cannot remove yourself.'), { statusCode: 400 });
  const member = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!member) throw Object.assign(new Error('Member not found.'), { statusCode: 404 });
  if (member.teamRole === 'owner') throw Object.assign(new Error('The business owner cannot be removed.'), { statusCode: 403 });

  // Delete the account — they will no longer be able to log in
  await prisma.user.delete({ where: { id: userId } });

  const { businessName } = await getBusinessInfo(tenantId);

  sendMail({
    to: member.email,
    subject: `You've been removed from ${businessName} on BizIQ`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">

        <div style="background:#1e293b;padding:28px 32px;text-align:center">
          <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:700">${businessName}</h1>
          <p style="color:rgba(255,255,255,0.6);margin:4px 0 0;font-size:13px">Team update</p>
        </div>

        <div style="padding:32px">
          <h2 style="color:#1e293b;margin:0 0 12px;font-size:17px">Your access has been removed</h2>
          <p style="color:#475569;margin:0 0 16px;font-size:14px;line-height:1.6">
            Hi <strong>${member.name || member.email}</strong>, your membership in the <strong>${businessName}</strong> team on BizIQ has been removed by <strong>${requesterName || 'the business owner'}</strong>.
          </p>

          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px">
            <p style="color:#dc2626;margin:0;font-size:13px;font-weight:600">What this means for your account</p>
            <ul style="color:#475569;margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.8">
              <li>Your BizIQ account for <strong>${businessName}</strong> has been deleted</li>
              <li>You will no longer be able to sign in to this business's dashboard</li>
              <li>Any data you created (orders, notes, etc.) remains with the business</li>
            </ul>
          </div>

          <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0">
            If you believe this was a mistake, please contact <strong>${requesterName || 'the business owner'}</strong> directly to request a new invite.
          </p>
        </div>

        <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center">
          <p style="color:#94a3b8;font-size:11px;margin:0">BizIQ · AI-powered business platform</p>
        </div>
      </div>
    `,
  }).catch((err) => logger.error(`[team] Removal email failed for ${member.email}: ${err.message}`));
};

export const cancelInvite = async (tenantId, inviteId) => {
  const invite = await prisma.invite.findFirst({ where: { id: inviteId, tenantId } });
  if (!invite) throw Object.assign(new Error('Invite not found.'), { statusCode: 404 });
  await prisma.invite.delete({ where: { id: inviteId } });
};
