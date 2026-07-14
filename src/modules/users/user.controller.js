// src/modules/users/user.controller.js
import * as userService from './user.service.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { asyncHandler } from '../../common/utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await userService.listUsers(req.tenant.id, { page, limit });
  return ok(res, result.items, result.meta);
});

export const getOne = asyncHandler(async (req, res) => {
  const user = await userService.getUser(req.tenant.id, req.params.id);
  return ok(res, user);
});

export const create = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.tenant.id, req.body);
  return created(res, user);
});

export const update = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.tenant.id, req.params.id, req.body);
  return ok(res, user);
});

export const remove = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.tenant.id, req.params.id);
  return noContent(res);
});

export const getMyTours = asyncHandler(async (req, res) => {
  const data = await userService.getTours(req.user.id);
  return ok(res, data);
});

export const patchMyTours = asyncHandler(async (req, res) => {
  const { tourId, completedChapters, done } = req.body;
  const data = await userService.updateTours(req.user.id, tourId, { completedChapters, done });
  return ok(res, data);
});