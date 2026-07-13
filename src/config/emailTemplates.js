// Branded HTML email layout — table-based, inline CSS for max client
// compatibility (Gmail/Outlook strip <style> blocks and don't render SVG).
const BRAND = '#4166F5';
const INK = '#1e293b';
const MUTED = '#64748b';
const APP_URL = process.env.FRONTEND_URL || 'https://www.biziq.online';

function layout({ preheader = '', heading, bodyHtml, ctaLabel, ctaUrl }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef0f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:${BRAND};height:4px;line-height:4px;font-size:1px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #f1f3f6;">
              <img src="${APP_URL}/BizIq.png" width="130" alt="BizIQ" style="display:block;width:130px;max-width:130px;height:auto;border:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${INK};line-height:1.3;">${heading}</h1>
              <div style="font-size:15px;color:${INK};line-height:1.6;">${bodyHtml}</div>
            </td>
          </tr>
          ${ctaUrl ? `
          <tr>
            <td style="padding:8px 32px 32px;">
              <a href="${ctaUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:13px 26px;border-radius:10px;box-shadow:0 2px 8px rgba(65,102,245,0.35);">${ctaLabel || 'Open Dashboard'}</a>
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:22px 32px 28px;border-top:1px solid #f1f3f6;">
              <p style="margin:0 0 10px;font-size:12px;color:${MUTED};line-height:1.6;">
                You're receiving this because your business is on BizIQ.
                <br/>Questions? Just reply to this email — a real person reads these.
              </p>
              <p style="margin:0;font-size:11px;color:#a3abba;">
                BizIQ · Run Your Business Smarter · <a href="${APP_URL}" style="color:#a3abba;">biziq.online</a>
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function otpEmail({ code, ttlMinutes, isResend = false }) {
  const bodyHtml = `
    <p style="margin:0 0 8px;">${isResend ? 'Here is your new sign-in code.' : 'Use this code to complete your sign-in.'} It expires in ${ttlMinutes} minutes.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${BRAND};margin:24px 0;text-align:center;background:#f4f6ff;border-radius:12px;padding:20px 0;">${code}</div>
    <p style="margin:0;color:${MUTED};font-size:13px;">If you didn't try to sign in, you can safely ignore this email.</p>
  `;
  return layout({
    preheader: `Your BizIQ sign-in code is ${code}`,
    heading: isResend ? 'Your new login code' : 'Your login code',
    bodyHtml,
  });
}

export function passwordResetEmail({ resetUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 16px;">We received a request to reset your BizIQ password. This link expires in 1 hour.</p>
    <p style="margin:0;color:${MUTED};font-size:13px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  `;
  return layout({
    preheader: 'Reset your BizIQ password',
    heading: 'Reset your password',
    bodyHtml,
    ctaLabel: 'Reset Password',
    ctaUrl: resetUrl,
  });
}

export function paymentConfirmedEmail({ businessName, amountMinor, renewsAt }) {
  const amount = `₦${(amountMinor / 100).toLocaleString()}`;
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${businessName || 'there'} — your payment of <strong>${amount}</strong> was successful. 🎉</p>
    <p style="margin:0;">Your subscription is now <strong style="color:#16a34a;">active</strong>${renewsAt ? ` and renews on <strong>${renewsAt.toDateString()}</strong>` : ''}. Thanks for growing with BizIQ!</p>
  `;
  return layout({
    preheader: `Payment of ${amount} confirmed — your subscription is active`,
    heading: 'Payment confirmed ✅',
    bodyHtml,
    ctaLabel: 'Go to Dashboard',
    ctaUrl: `${APP_URL}/dashboard`,
  });
}

export function trialEndingEmail({ businessName, trialEndsAt, isToday }) {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${businessName || 'there'} — your free trial ${isToday ? 'ends <strong>today</strong>' : `ends in <strong>2 days</strong>, on <strong>${trialEndsAt.toDateString()}</strong>`}.</p>
    <p style="margin:0;">Don't lose access to your AI sales agent, storefront, and orders — upgrade now to keep everything running.</p>
  `;
  return layout({
    preheader: isToday ? 'Your free trial ends today' : 'Your free trial ends in 2 days',
    heading: isToday ? '⏰ Your trial ends today' : '⏰ Your trial ends in 2 days',
    bodyHtml,
    ctaLabel: 'Upgrade Now',
    ctaUrl: `${APP_URL}/billing`,
  });
}

export function renewalReminderEmail({ businessName, planLabel, amount, renewsAt }) {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${businessName || 'there'} — this is a reminder that your <strong>${planLabel || 'subscription'}</strong> renews on <strong>${renewsAt.toDateString()}</strong> for <strong>${amount}</strong>.</p>
    <p style="margin:0;color:${MUTED};font-size:13px;">Make sure your payment method is up to date to avoid any interruption.</p>
  `;
  return layout({
    preheader: `Your subscription renews on ${renewsAt.toDateString()}`,
    heading: 'Upcoming renewal',
    bodyHtml,
    ctaLabel: 'Manage Billing',
    ctaUrl: `${APP_URL}/billing`,
  });
}

export function newOrderEmail({ businessName, customerName, amount, orderRef }) {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${businessName || 'there'} — you just got a new order! 🎉</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f6ff;border-radius:12px;padding:16px;margin-bottom:16px;">
      <tr><td style="padding:4px 16px;font-size:14px;color:${MUTED};">Order</td><td style="padding:4px 16px;font-size:14px;font-weight:600;color:${INK};text-align:right;">${orderRef || '—'}</td></tr>
      <tr><td style="padding:4px 16px;font-size:14px;color:${MUTED};">Customer</td><td style="padding:4px 16px;font-size:14px;font-weight:600;color:${INK};text-align:right;">${customerName || 'Customer'}</td></tr>
      <tr><td style="padding:4px 16px;font-size:14px;color:${MUTED};">Amount</td><td style="padding:4px 16px;font-size:16px;font-weight:800;color:${BRAND};text-align:right;">${amount}</td></tr>
    </table>
    <p style="margin:0;color:${MUTED};font-size:13px;">Head to your dashboard to review and fulfil this order.</p>
  `;
  return layout({
    preheader: `New order ${orderRef || ''} — ${amount}`,
    heading: '🛍️ New order received',
    bodyHtml,
    ctaLabel: 'View Order',
    ctaUrl: `${APP_URL}/dashboard/orders`,
  });
}

export function superAdminWelcomeEmail({ name, email, addedBy, setPasswordUrl }) {
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${name || email} — ${addedBy ? `<strong>${addedBy}</strong> has` : 'you have been'} given you <strong>super admin</strong> access on the BizIQ platform.</p>
    <p style="margin:0 0 16px;">Set your password to activate your account and sign in. This link expires in 7 days.</p>
    <p style="margin:0;color:${MUTED};font-size:13px;">Your login email: <strong style="color:${INK};">${email}</strong></p>
  `;
  return layout({
    preheader: 'You now have super admin access on BizIQ — set your password to get started',
    heading: '🔑 You\'ve been added as a super admin',
    bodyHtml,
    ctaLabel: 'Set Your Password',
    ctaUrl: setPasswordUrl,
  });
}

export function trialWelcomeEmail({ businessName, trialEndsAt }) {
  const endDate = trialEndsAt?.toDateString?.() || String(trialEndsAt);
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hey${businessName ? ` ${businessName}` : ''} 👋 — your 14-day free trial just started, and your AI sales agent is already live on WhatsApp.</p>
    <p style="margin:0 0 20px;">Here's what's working for you right now:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
      <tr><td style="padding:6px 0;">🤖&nbsp;&nbsp;<strong>AI Sales Agent</strong> — replies to customers on WhatsApp instantly, day or night</td></tr>
      <tr><td style="padding:6px 0;">🛍️&nbsp;&nbsp;<strong>Your Storefront</strong> — a branded product catalog customers can browse</td></tr>
      <tr><td style="padding:6px 0;">💳&nbsp;&nbsp;<strong>Orders & Payments</strong> — quotes, orders, and payment links, handled automatically</td></tr>
    </table>
    <p style="margin:0;color:${MUTED};font-size:14px;">Full access until <strong style="color:${INK};">${endDate}</strong>. Upgrade anytime to keep it running.</p>
  `;
  return layout({
    preheader: 'Your AI sales agent is live — here\'s what to do next.',
    heading: '🎉 Your free trial has started!',
    bodyHtml,
    ctaLabel: 'Go to Dashboard',
    ctaUrl: `${APP_URL}/dashboard`,
  });
}

export function escalationEmail({ customerName, reason }) {
  const name = customerName || 'A customer';
  const bodyHtml = `
    <p style="margin:0 0 16px;">Your AI sales agent couldn't handle a message from <strong>${name}</strong> and has stepped back — the conversation is waiting for you.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fef2f2;border-left:3px solid #dc2626;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <tr><td style="font-size:13px;color:#991b1b;line-height:1.5;">${reason || 'The AI ran into an issue processing this message.'}</td></tr>
    </table>
    <p style="margin:0;color:${MUTED};font-size:13px;">Reply to the customer directly on WhatsApp to pick things up.</p>
  `;
  return layout({
    preheader: `${name} needs a human reply — the AI couldn't continue`,
    heading: '⚠️ A customer needs your attention',
    bodyHtml,
    ctaLabel: 'Open Conversation',
    ctaUrl: `${APP_URL}/dashboard/whatsapp`,
  });
}

export function paymentReceiptEmail({ customerName, summary, orderRef }) {
  const name = customerName || 'A customer';
  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${name}</strong> sent a payment receipt${orderRef ? ` for order <strong>${orderRef}</strong>` : ''} — it needs your manual verification before the order is marked as paid.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f6ff;border-radius:12px;padding:16px;margin-bottom:16px;">
      <tr><td style="font-size:14px;color:${INK};line-height:1.6;">${summary}</td></tr>
    </table>
    <p style="margin:0;color:${MUTED};font-size:13px;">The AI has not marked this order as paid — only you can confirm the transfer went through.</p>
  `;
  return layout({
    preheader: `${name} sent a payment receipt — please verify`,
    heading: '💳 Payment receipt needs verification',
    bodyHtml,
    ctaLabel: 'Review & Verify',
    ctaUrl: `${APP_URL}/dashboard/whatsapp`,
  });
}

export default {
  trialWelcomeEmail,
  superAdminWelcomeEmail,
  otpEmail,
  passwordResetEmail,
  paymentConfirmedEmail,
  trialEndingEmail,
  renewalReminderEmail,
  newOrderEmail,
  escalationEmail,
  paymentReceiptEmail,
};
