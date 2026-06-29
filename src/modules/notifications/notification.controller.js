import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import { send } from './notification.service.js';

const sendSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'sms']),
  to: z.string().min(1),
  subject: z.string().optional(),
  text: z.string().min(1),
  html: z.string().optional(),
});

export const sendNotification = asyncHandler(async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) throw new BadRequestError('Invalid notification payload', parsed.error.flatten());
  await send({ tenantId: req.tenant.id, ...parsed.data });
  return ok(res, { sent: true });
});
