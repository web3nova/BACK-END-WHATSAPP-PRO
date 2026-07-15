import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created } from '../../common/utils/apiResponse.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as orderService from './order.service.js';

function tenantId(req) {
  const id = req.tenant?.id || req.headers['x-tenant-id'] || process.env.TEST_TENANT_ID || 'test-tenant-id';
  if (!id) throw new BadRequestError('Missing tenant context (req.tenant or x-tenant-id header).');
  return id;
}

export const list = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const { status, customerId } = req.query;
  const data = await orderService.listOrders(tenant, { status, customerId });
  ok(res, data);
});

export const getOne = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const data = await orderService.getOrder(tenant, req.params.id);
  ok(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const data = await orderService.createOrder(tenant, req.body, { senderUserId: req.user?.id ?? null });
  created(res, data);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const { status } = req.body;
  const data = await orderService.updateOrderStatus(tenant, req.params.id, status);
  ok(res, data);
});

export const update = asyncHandler(async (req, res) => {
  const tenant = tenantId(req);
  const data = await orderService.updateOrder(tenant, req.params.id, req.body);
  ok(res, data);
});
