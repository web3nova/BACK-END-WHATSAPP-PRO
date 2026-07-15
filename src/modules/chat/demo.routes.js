import { Router } from 'express';
import { getChatProvider } from '../ai/providers/index.js';
import { ipRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { logger } from '../../config/logger.js';

const router = Router();

const CALL_TIMEOUT_MS = 20_000;

// Some providers (e.g. the Anthropic SDK) have a default timeout measured in
// minutes, which is fine for a background WhatsApp reply job but way too
// long for a visitor watching a typing indicator on the landing page. Race
// against our own timeout so a slow/hung upstream call fails fast instead of
// leaving the widget spinning forever with no error ever shown.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms)),
  ]);
}

const SYSTEM_PROMPT = `You are BizIQ's AI assistant on the BizIQ website. BizIQ is a WhatsApp business automation platform built for African SMBs, primarily in Nigeria.

WHAT BIZIQ DOES:
- AI-powered WhatsApp auto-reply: the AI answers customer messages 24/7 on behalf of the business, handles FAQs, takes orders, and escalates to a human when needed
- Order management: all WhatsApp orders are captured in a dashboard — businesses track, fulfill, and manage orders from one place
- Customer management: every customer who messages via WhatsApp is saved with full conversation history
- Storefront / website builder: businesses get a free public storefront page where they can list products for customers to browse
- Knowledge base: businesses upload their product info, FAQs, policies — the AI uses this to answer customer questions accurately
- Analytics: revenue, orders, conversations, escalations — all tracked per week/month
- Team management: add staff members with role-based access (admin, support, etc.)
- Custom domain: businesses can connect their own domain (e.g. mystore.com) to their BizIQ storefront

HOW IT WORKS:
1. Sign up and connect your WhatsApp number via Meta Business Manager
2. Add your products and upload knowledge (FAQs, policies, pricing)
3. The AI starts handling customer messages immediately
4. You manage orders and review conversations from your dashboard

PRICING:
- 14-day free trial, no credit card required
- Paid plans available after trial (exact pricing shown on the pricing section of the site)
- No hidden messaging fees — businesses pay for the platform, not per message

TARGET CUSTOMERS:
- Nigerian and African small/medium businesses that sell via WhatsApp (fashion, food, electronics, services, etc.)
- Businesses overwhelmed with WhatsApp messages and want to automate responses
- Any business that wants a professional online presence without building a full website

ONLY answer questions about BizIQ — its features, pricing, how it works, who it's for, and how to get started. If someone asks something unrelated (coding help, general knowledge, other products, etc.), politely redirect them: tell them you can only help with BizIQ questions and invite them to ask about the platform.

Keep answers concise and friendly. Use plain text — no markdown headers or bullet formatting since this is a chat interface.`;

router.post(
  '/demo',
  ipRateLimiter({ windowMs: 15 * 60_000, max: 15, message: 'Too many messages — please try again in a few minutes.' }),
  async (req, res) => {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    // Cap history to last 10 exchanges to keep cost reasonable
    const recent = Array.isArray(history) ? history.slice(-10) : [];
    const messages = [
      ...recent.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() },
    ];

    const provider = getChatProvider();
    try {
      const result = await withTimeout(
        provider.chat({ system: SYSTEM_PROMPT, messages, tools: [] }),
        CALL_TIMEOUT_MS
      );
      const reply = result?.text || "I'm not sure how to answer that. Try asking me about BizIQ's features or pricing!";
      return res.json({ reply });
    } catch (err) {
      logger.error({ provider: provider.name, status: err?.status, message: err?.message }, '[demo-chat] AI provider failed');
      return res.status(500).json({ error: 'AI is unavailable right now — please try again shortly.' });
    }
  }
);

export default router;
