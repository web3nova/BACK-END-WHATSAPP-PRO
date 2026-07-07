import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import * as paymentConfigService from './payment-config.service.js';
import * as bankService from './bank.service.js';

export const getConfig = asyncHandler(async (req, res) => {
  const data = await paymentConfigService.getConfig(getTenantId(req));
  return ok(res, data);
});

export const upsertConfig = asyncHandler(async (req, res) => {
  const data = await paymentConfigService.upsertConfig(getTenantId(req), req.body);
  return ok(res, data);
});

export const resolveAccount = asyncHandler(async (req, res) => {
  const { accountNumber, bankCode } = req.query;
  const data = await bankService.resolveAccount(accountNumber, bankCode);
  return ok(res, data);
});

export const listBanks = asyncHandler(async (req, res) => {
  const data = await bankService.listBanks();
  return ok(res, data);
});
