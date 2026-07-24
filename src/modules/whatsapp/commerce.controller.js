import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import * as commerceService from './commerce.service.js';
import * as arrangementService from './commerce.arrangement.service.js';
import * as validate from './commerce.validation.js';

// ── Commerce Setup ────────────────────────────────────────────

export const getCommerceStatus = asyncHandler(async (req, res) => {
  const status = await commerceService.getCommerceStatus(req.tenant.id);
  return ok(res, status);
});

export const setupCommerce = asyncHandler(async (req, res) => {
  const data = validate.setupCommerceSchema.parse(req.body);
  const result = await commerceService.setupCommerce(req.tenant.id, data.businessManagerId);
  return created(res, result);
});

export const enableCommerceHandler = asyncHandler(async (req, res) => {
  const result = await commerceService.enableCommerce(req.tenant.id);
  return ok(res, result);
});

export const syncArrangement = asyncHandler(async (req, res) => {
  const data = validate.syncArrangementSchema.parse(req.body);
  const result = await commerceService.syncArrangementToFacebook(req.tenant.id, data.arrangementId);
  return ok(res, result);
});

// ── Arrangements ──────────────────────────────────────────────

export const listArrangements = asyncHandler(async (req, res) => {
  const arrangements = await arrangementService.listArrangements(req.tenant.id);
  return ok(res, arrangements);
});

export const getArrangement = asyncHandler(async (req, res) => {
  const arrangement = await arrangementService.getArrangement(req.tenant.id, req.params.id);
  return ok(res, arrangement);
});

export const createArrangement = asyncHandler(async (req, res) => {
  const data = validate.createArrangementSchema.parse(req.body);
  const arrangement = await arrangementService.createArrangement(req.tenant.id, data);
  return created(res, arrangement);
});

export const updateArrangement = asyncHandler(async (req, res) => {
  const data = validate.updateArrangementSchema.parse(req.body);
  const arrangement = await arrangementService.updateArrangement(req.tenant.id, req.params.id, data);
  return ok(res, arrangement);
});

export const deleteArrangement = asyncHandler(async (req, res) => {
  await arrangementService.deleteArrangement(req.tenant.id, req.params.id);
  return noContent(res);
});

export const setDefaultArrangement = asyncHandler(async (req, res) => {
  const arrangement = await arrangementService.setDefaultArrangement(req.tenant.id, req.params.id);
  return ok(res, arrangement);
});

// ── Sections ──────────────────────────────────────────────────

export const listSections = asyncHandler(async (req, res) => {
  const sections = await arrangementService.listSections(req.tenant.id, req.params.arrangementId);
  return ok(res, sections);
});

export const createSection = asyncHandler(async (req, res) => {
  const data = validate.createSectionSchema.parse(req.body);
  const section = await arrangementService.createSection(req.tenant.id, data);
  return created(res, section);
});

export const updateSection = asyncHandler(async (req, res) => {
  const data = validate.updateSectionSchema.parse(req.body);
  const section = await arrangementService.updateSection(req.tenant.id, req.params.id, data);
  return ok(res, section);
});

export const deleteSection = asyncHandler(async (req, res) => {
  await arrangementService.deleteSection(req.tenant.id, req.params.id);
  return noContent(res);
});

export const reorderSections = asyncHandler(async (req, res) => {
  const data = validate.reorderSectionsSchema.parse(req.body);
  await arrangementService.reorderSections(req.tenant.id, data.items);
  return ok(res, { success: true });
});

// ── Items ─────────────────────────────────────────────────────

export const listItems = asyncHandler(async (req, res) => {
  const items = await arrangementService.listItems(req.tenant.id, req.params.sectionId);
  return ok(res, items);
});

export const addItem = asyncHandler(async (req, res) => {
  const data = validate.addItemSchema.parse(req.body);
  const item = await arrangementService.addItemToSection(req.tenant.id, data);
  return created(res, item);
});

export const removeItem = asyncHandler(async (req, res) => {
  await arrangementService.removeItemFromSection(req.tenant.id, req.params.id);
  return noContent(res);
});

export const reorderItems = asyncHandler(async (req, res) => {
  const data = validate.reorderItemsSchema.parse(req.body);
  await arrangementService.reorderItems(req.tenant.id, data.items);
  return ok(res, { success: true });
});

// ── Customer-facing ───────────────────────────────────────────

export const getCatalogForCustomer = asyncHandler(async (req, res) => {
  const customerPhone = req.query.phone || null;
  const result = await arrangementService.getArrangementForCustomer(req.tenant.id, customerPhone);
  return ok(res, result);
});

export default {
  getCommerceStatus, setupCommerce, enableCommerceHandler, syncArrangement,
  listArrangements, getArrangement, createArrangement, updateArrangement,
  deleteArrangement, setDefaultArrangement,
  listSections, createSection, updateSection, deleteSection, reorderSections,
  listItems, addItem, removeItem, reorderItems,
  getCatalogForCustomer,
};
