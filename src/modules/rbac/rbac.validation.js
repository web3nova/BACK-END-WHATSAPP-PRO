import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/permissions.js';

const allPermissions = Object.values(PERMISSIONS);

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    permissions: z
      .array(z.enum(allPermissions))
      .default([]),
  }),
});

export const updateRoleSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    permissions: z.array(z.enum(allPermissions)).optional(),
  }),
});

export const getRoleSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const deleteRoleSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const assignRoleSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    roleId: z.string().uuid().nullable(),
  }),
});