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
  } else if (type === 'reaction') {
    // Meta sends { message_id, emoji } — emoji is omitted entirely when the
    // customer removes a previously-set reaction, not when they react with a
    // literal empty string, so that's the correct signal to check.
    const emoji = message.reaction?.emoji;
    text = emoji ? `[Customer reacted ${emoji} to your previous message]` : `[Customer removed their reaction to your previous message]`;
  } else if (type === 'location') {
    const loc = message.location || {};
    const label = loc.name || loc.address;
    text = (loc.latitude != null && loc.longitude != null)
      ? `[Customer shared their location${label ? `: ${label}` : ''} (${loc.latitude}, ${loc.longitude})]`
      : `[Received location message]`;
  } else if (type === 'contacts') {
    const contacts = message.contacts || [];
    const names = contacts.map(c => c.name?.formatted_name).filter(Boolean);
    const phones = contacts.flatMap(c => (c.phones || []).map(p => p.phone)).filter(Boolean);
    text = names.length
      ? `[Customer shared a contact card: ${names.join(', ')}${phones.length ? ` (${phones.join(', ')})` : ''}]`
      : `[Received contacts message]`;
  } else if (type === 'sticker') {
    text = `[Received sticker message]`;
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
