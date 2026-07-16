import { asyncHandler } from '../../common/utils/asyncHandler.js';
import { ok, created, noContent } from '../../common/utils/apiResponse.js';
import { getTenantId } from '../../common/utils/tenantContext.js';
import { BadRequestError } from '../../common/errors/index.js';
import * as websiteService from './website.service.js';

function normalizeHost(host = '') {
  const normalized = host.split(':')[0]?.toLowerCase();
  return normalized && !['localhost', '127.0.0.1', '0.0.0.0'].includes(normalized)
    ? normalized
    : undefined;
}

export const listPages = asyncHandler(async (req, res) => {
  const result = await websiteService.listPages(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const createPage = asyncHandler(async (req, res) => {
  const data = await websiteService.createPage(getTenantId(req), req.body);
  return created(res, data);
});

export const getPage = asyncHandler(async (req, res) => {
  const data = await websiteService.getPage(getTenantId(req), req.params.slug);
  return ok(res, data);
});

export const updatePage = asyncHandler(async (req, res) => {
  const data = await websiteService.updatePage(getTenantId(req), req.params.slug, req.body);
  return ok(res, data);
});

export const deletePage = asyncHandler(async (req, res) => {
  await websiteService.deletePage(getTenantId(req), req.params.slug);
  return noContent(res);
});

export const setPublished = asyncHandler(async (req, res) => {
  const data = await websiteService.setPublished(
    getTenantId(req),
    req.params.slug,
    req.body.published,
  );
  return ok(res, data);
});

// The editor needs the merged (draft-if-present-else-live) view to edit, plus
// whether there's a pending draft at all. `draft` itself is dropped from the
// response — its fields are already flattened onto the top level.
export const getSettings = asyncHandler(async (req, res) => {
  const { draft, ...settings } = await websiteService.getSettings(getTenantId(req));
  const data = {
    ...settings,
    ...(draft ?? {}),
    hasUnpublishedChanges: Boolean(draft),
  };
  return ok(res, data);
});

export const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError('No image uploaded. Send multipart/form-data with field "image".');
  }
  const data = await websiteService.uploadImage(getTenantId(req), req.file);
  return ok(res, data);
});

export const deleteImage = asyncHandler(async (req, res) => {
  await websiteService.deleteImage(getTenantId(req), req.body.storageKey);
  return noContent(res);
});

export const listMedia = asyncHandler(async (req, res) => {
  const result = await websiteService.listMedia(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const deleteMedia = asyncHandler(async (req, res) => {
  await websiteService.deleteMedia(getTenantId(req), req.params.id);
  return noContent(res);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const data = await websiteService.updateSettings(getTenantId(req), req.body);
  return ok(res, data);
});

export const publishSettings = asyncHandler(async (req, res) => {
  const data = await websiteService.publishSettings(getTenantId(req));
  return ok(res, data);
});

export const discardDraft = asyncHandler(async (req, res) => {
  const { draft, ...settings } = await websiteService.discardDraft(getTenantId(req));
  return ok(res, { ...settings, hasUnpublishedChanges: false });
});

export const listRevisions = asyncHandler(async (req, res) => {
  const result = await websiteService.listRevisions(getTenantId(req), req.query);
  return ok(res, result.items, result.meta);
});

export const restoreRevision = asyncHandler(async (req, res) => {
  const data = await websiteService.restoreRevision(getTenantId(req), req.params.id);
  return ok(res, data);
});

// Public, unauthenticated. Stored image URLs point here so they never expire —
// each hit redirects to a fresh short-lived signed URL. Only website-images/*
// is servable: those are storefront-public by definition. Mounted at the app
// root (see app.js), not under the API prefix, so the final path matches
// exactly what websiteService.publicAssetUrl() stores: `/assets/website-images/...`.
export const getPublicAsset = asyncHandler(async (req, res) => {
  const key = req.params[0] ? `website-images/${req.params[0]}` : '';
  if (!key || key.includes('..')) {
    throw new BadRequestError('Invalid asset key.');
  }
  const url = await websiteService.getPublicAssetUrl(key);
  res.set('Cache-Control', 'public, max-age=1800');
  return res.redirect(302, url);
});

export const getStorefront = asyncHandler(async (req, res) => {
  const tenantId = req.query.tenantId || req.headers['x-tenant-id'];
  const slug = req.query.slug;
  const domain =
    req.query.domain || normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  const data = await websiteService.getStorefront({ tenantId, slug, domain });
  // Fire-and-forget: a real visitor just loaded the storefront. Never let a
  // logging failure affect (or slow down) the actual response.
  websiteService
    .recordVisit({
      tenantId: data.tenant.id,
      // The client-supplied document.referrer, NOT req.headers.referer — that
      // header would be this fetch's own same-origin caller (the storefront
      // page itself), not the page that actually linked the visitor here.
      referrer: req.query.referrer || null,
      host: req.headers['x-forwarded-host'] || req.headers.host,
    })
    .catch(() => {});
  return ok(res, data);
});

export const getStorefrontBankDetails = asyncHandler(async (req, res) => {
  const tenantId = req.query.tenantId || req.headers['x-tenant-id'];
  const slug = req.query.slug;
  const domain =
    req.query.domain || normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
  const data = await websiteService.getStorefrontBankDetails({ tenantId, slug, domain });
  return ok(res, data);
});
