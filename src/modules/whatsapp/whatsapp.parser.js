const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document']);

/**
 * Extract a human-readable text string from an inbound Meta message object.
 * Always returns a non-empty string safe to pass to the AI service.
 */
export function parseMessage(message) {
  const type = message.type;
  let text = '';

  if (type === 'text') {
    text = message.text?.body || '';
  } else if (type === 'interactive') {
    const { type: iType, button_reply, list_reply } = message.interactive;
    if (iType === 'button_reply') {
      text = button_reply?.title || button_reply?.id || '';
    } else if (iType === 'list_reply') {
      text = list_reply?.title || list_reply?.id || '';
    } else {
      text = `[Interactive message of type ${iType}]`;
    }
  } else if (MEDIA_TYPES.has(type)) {
    text = message[type]?.caption || `[Received ${type} - media]`;
  } else if (type === 'sticker' || type === 'contacts' || type === 'location') {
    text = `[Received ${type} message]`;
  } else {
    text = `[Received ${type} message - unsupported by AI currently]`;
  }

  return { type, text };
}

/** Returns true if the message carries a downloadable media payload. */
export function isMediaMessage(type) {
  return MEDIA_TYPES.has(type);
}

/** Extract the provider media ID from a message, or null if not a media message. */
export function extractMediaId(message) {
  if (!isMediaMessage(message.type)) return null;
  return message[message.type]?.id || null;
}
