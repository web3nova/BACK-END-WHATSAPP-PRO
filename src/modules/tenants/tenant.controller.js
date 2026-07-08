import * as tenantService from './tenant.service.js';
import * as domainService from './domain.service.js';
import { ok, noContent } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

// Super admin — list all tenants
export const list = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await tenantService.listTenants({ page, limit, status });
  return ok(res, result.items, result.meta);
});

// Super admin — get any tenant by id
export const getOne = asyncHandler(async (req, res) => {
  const tenant = await tenantService.getTenant(req.params.id);
  return ok(res, tenant);
});

// Super admin — update any tenant (including status)
export const update = asyncHandler(async (req, res) => {
  const tenant = await tenantService.updateTenant(req.params.id, req.body);
  return ok(res, tenant);
});

// Super admin — delete a tenant
export const remove = asyncHandler(async (req, res) => {
  await tenantService.deleteTenant(req.params.id);
  return noContent(res);
});

// Tenant owner — view and update their own tenant profile
export const getOwn = asyncHandler(async (req, res) => {
  const tenant = await tenantService.getTenant(req.tenant.id);
  return ok(res, tenant);
});

export const updateOwn = asyncHandler(async (req, res) => {
  const tenant = await tenantService.updateOwnTenant(req.tenant.id, req.body);
  return ok(res, tenant);
});

export const setDomain = asyncHandler(async (req, res) => {
  const { domain } = req.body;
  const result = await domainService.setCustomDomain(req.tenant.id, domain);
  return ok(res, result);
});

export const removeDomain = asyncHandler(async (req, res) => {
  await domainService.removeCustomDomain(req.tenant.id);
  return ok(res, { removed: true });
});