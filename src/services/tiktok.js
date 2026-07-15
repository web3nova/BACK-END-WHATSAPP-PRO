import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3/pixel/track';

export async function trackEvent({ event, eventId, properties, context }) {
  const { pixelId, accessToken, testEventCode } = config.tiktok;
  if (!pixelId) return;

  const body = {
    pixel_code: pixelId,
    event,
    event_time: Math.floor(Date.now() / 1000),
    test_event_code: testEventCode || undefined,
    properties: properties || {},
    context: {
      user_agent: context?.userAgent || '',
      ip: context?.ip || '',
      ...(context?.email ? { email: context.email } : {}),
      ...(context?.phone ? { phone: context.phone } : {}),
    },
  };

  if (eventId) body.event_id = eventId;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Access-Token'] = accessToken;
  }

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      logger.warn({ status: res.status, response: data }, '[tiktok] event track failed');
    }
  } catch (err) {
    logger.error({ err: err.message }, '[tiktok] event track error');
  }
}
