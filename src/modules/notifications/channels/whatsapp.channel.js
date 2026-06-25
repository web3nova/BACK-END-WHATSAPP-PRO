import { sendMessage } from '../../whatsapp/whatsapp.service.js';

export async function sendWhatsApp({ tenantId, to, text }) {
  return sendMessage(tenantId, to, text);
}

export default { sendWhatsApp };
