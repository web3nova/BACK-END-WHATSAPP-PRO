import { z } from 'zod';

export const listTenantsSchema = z.object({
  page:   z.coerce.number().int().min(1).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
});

export const getTenantSchema = z.object({
  id: z.string().uuid(),
});

export const updateTenantSchema = z.object({
  name:   z.string().min(2).optional(),
  domain: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
});

export const deleteTenantSchema = z.object({
  id: z.string().uuid(),
});