import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, noContent } from '../../common/utils/apiResponse.js';
import * as customerService from './customer.service.js';

const tid = (req) => req.tenant.id;

export const list = asyncHandler(async (req, res) => {
  const result = await customerService.listCustomers(tid(req), req.query);
  return ok(res, result.items, result.meta);
});

export const get = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomer(tid(req), req.params.id);
  return ok(res, customer);
});

export const update = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(tid(req), req.params.id, req.body);
  return ok(res, customer);
});

export const remove = asyncHandler(async (req, res) => {
  await customerService.deleteCustomer(tid(req), req.params.id);
  return noContent(res);
});
