import * as adminService from './admin.service.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const stats = asyncHandler(async (req, res) => {
  const data = await adminService.getPlatformStats();
  return ok(res, data);
});

export const suspend = asyncHandler(async (req, res) => {
  const tenant = await adminService.suspendTenant(req.params.id);
  return ok(res, tenant);
});

export const activate = asyncHandler(async (req, res) => {
  const tenant = await adminService.activateTenant(req.params.id);
  return ok(res, tenant);
});

export const listAdmins = asyncHandler(async (req, res) => {
  const admins = await adminService.listSuperAdmins();
  return ok(res, admins);
});

export const createAdmin = asyncHandler(async (req, res) => {
  const admin = await adminService.createSuperAdmin(req.body);
  return created(res, admin);
});

export const deleteAdmin = asyncHandler(async (req, res) => {
  await adminService.deleteSuperAdmin(req.params.id, req.user.id);
  return noContent(res);
});

export const setPlan = asyncHandler(async (req, res) => {
  const subscription = await adminService.setTenantPlan(req.params.id, req.body);
  return ok(res, subscription);
});