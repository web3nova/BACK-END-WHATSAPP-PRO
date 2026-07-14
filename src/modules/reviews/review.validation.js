import { z } from 'zod';

export const productParamsSchema = z.object({
  id: z.string().uuid(),
});

export const reviewParamsSchema = z.object({
  id: z.string().uuid(),
});

export const submitReviewSchema = z.object({
  orderId: z.string(),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(2000).optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export const listReviewsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const productReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
