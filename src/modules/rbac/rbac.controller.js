import * as rbacService from './rbac.service.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const roles = await rbacService.listRoles(req.tenant.id);
  return ok(res, roles);
});

export const getOne = asyncHandler(async (req, res) => {
  const role = await rbacService.getRole(req.tenant.id, req.params.id);
  return ok(res, role);
});

export const create = asyncHandler(async (req, res) => {
  const role = await rbacService.createRole(req.tenant.id, req.body);
  return created(res, role);
});

export const update = asyncHandler(async (req, res) => {
  const role = await rbacService.updateRole(req.tenant.id, req.params.id, req.body);
  return ok(res, role);
});

export const remove = asyncHandler(async (req, res) => {
  await rbacService.deleteRole(req.tenant.id, req.params.id);
  return noContent(res);
});

export const assign = asyncHandler(async (req, res) => {
  const user = await rbacService.assignRole(
    req.tenant.id,
    req.params.userId,
    req.body.roleId
  );
  return ok(res, user);
});