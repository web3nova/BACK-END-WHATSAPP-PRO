import { z } from 'zod';

export const listUsersSchema = z.object({
  page:  z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const getUserSchema = z.object({
  id: z.string().uuid(),
});

export const createUserSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().optional(),
  roleId:   z.string().uuid().optional(),
});

export const updateUserSchema = z.object({
  name:   z.string().optional(),
  roleId: z.string().uuid().nullable().optional(),
});

export const deleteUserSchema = z.object({
  id: z.string().uuid(),
});