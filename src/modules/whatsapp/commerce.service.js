import { prisma } from '../../config/prisma.js';
import { BadRequestError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';
import { decryptSecret } from '../../common/utils/encryption.js';

const GRAPH_BASE = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}`;

function withDecryptedToken(account) {
  if (!account?.accessToken) return account;
  return { ...account, accessToken: decryptSecret(account.accessToken) };
}

async function getWabaToken(tenantId) {
  const account = withDecryptedToken(await prisma.whatsappAccount.findUnique({
    where: { tenantId },
    select: { wabaId: true, phoneNumberId: true, accessToken: true },
  }));
  if (!account?.accessToken) throw new BadRequestError('WhatsApp account not connected');
  return account;
}

function hasCommerceModel() {
  return typeof prisma.whatsappCommerce?.findUnique === 'function';
}

export async function getCommerce(tenantId) {
  if (!hasCommerceModel()) return null;
  const commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  return commerce ?? null;
}

// Given a set of retailer IDs (product.sku || product.id, matching what
// syncArrangementToFacebook uploads), return the subset that actually exists
// in the Meta catalog connected to this tenant's WABA. Used before sending
// interactive product messages: Meta rejects the whole send if any
// product_retailer_id isn't in the catalog, so callers send shoppable cards
// only for confirmed-synced products and fall back (e.g. to a plain photo)
// for the rest. Best-effort: on any error it returns an empty set so callers
// treat everything as "not confirmed" rather than sending and failing.
export async function filterSyncedRetailerIds(tenantId, retailerIds) {
  const ids = [...new Set((retailerIds || []).filter(Boolean))];
  if (!ids.length) return new Set();
  try {
    const commerce = await getCommerce(tenantId);
    if (!commerce?.catalogId) return new Set();
    const account = await getWabaToken(tenantId);
    const filter = JSON.stringify({ retailer_id: { is_any: ids } });
    const res = await fetch(
      `${GRAPH_BASE}/${commerce.catalogId}/products?fields=retailer_id&limit=${ids.length}` +
      `&filter=${encodeURIComponent(filter)}&access_token=${account.accessToken}`
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ tenantId, metaError: json?.error }, '[commerce] filterSyncedRetailerIds lookup failed');
      return new Set();
    }
    return new Set((json.data || []).map((p) => p.retailer_id).filter(Boolean));
  } catch (e) {
    logger.warn({ tenantId, err: e.message }, '[commerce] filterSyncedRetailerIds error');
    return new Set();
  }
}

export async function setupCommerce(tenantId, businessManagerId) {
  if (!hasCommerceModel()) throw new BadRequestError('Commerce models not available — Prisma client needs regeneration');
  let commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  if (commerce?.catalogId) {
    return { commerce, alreadySetup: true };
  }

  const account = await getWabaToken(tenantId);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const catalogName = `${tenant?.name || 'Business'} Catalog`;

  const res = await fetch(
    `${GRAPH_BASE}/${businessManagerId}/product_catalogs?access_token=${account.accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: catalogName }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed to create Facebook catalog: ${json?.error?.message || JSON.stringify(json)}`);
  }

  const catalogId = json.id;

  commerce = await prisma.whatsappCommerce.upsert({
    where: { tenantId },
    update: { catalogId, businessManagerId },
    create: { tenantId, catalogId, businessManagerId },
  });

  logger.info({ tenantId, catalogId }, '[commerce] Facebook catalog created');

  return { commerce };
}

export async function connectCatalogToWABA(tenantId) {
  if (!hasCommerceModel()) throw new BadRequestError('Commerce models not available');
  const commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  if (!commerce?.catalogId) throw new BadRequestError('No catalog created yet. Run setup first.');

  const account = await getWabaToken(tenantId);
  if (!account.wabaId) throw new BadRequestError('No WABA ID found');

  const res = await fetch(
    `${GRAPH_BASE}/${account.wabaId}/product_catalogs?access_token=${account.accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalog_id: commerce.catalogId }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Failed to connect catalog to WABA: ${json?.error?.message || JSON.stringify(json)}`);
  }

  await prisma.whatsappCommerce.update({
    where: { tenantId },
    data: { commerceEnabled: true, meta: { ...commerce.meta, wabaCatalogConnected: true } },
  });

  logger.info({ tenantId, wabaId: account.wabaId, catalogId: commerce.catalogId }, '[commerce] catalog connected to WABA');

  return { success: true };
}

export async function enableCommerce(tenantId) {
  const account = await getWabaToken(tenantId);
  if (!account.wabaId) throw new BadRequestError('No WABA ID found');
  if (!account.phoneNumberId) throw new BadRequestError('No phone number ID found');

  await connectCatalogToWABA(tenantId);

  // Commerce settings (cart + catalog visibility) are per business phone
  // number, not per WABA — Meta's endpoint is /{phoneNumberId}/whatsapp_commerce_settings
  // with query-string params, not a JSON body. is_catalog_visible defaults
  // to false, so it must be set explicitly or the storefront icon stays
  // hidden even with the cart enabled.
  const res = await fetch(
    `${GRAPH_BASE}/${account.phoneNumberId}/whatsapp_commerce_settings?is_cart_enabled=true&is_catalog_visible=true&access_token=${account.accessToken}`,
    { method: 'POST' }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn({ tenantId, metaError: json?.error }, '[commerce] enable commerce settings failed');
    throw new Error(`Failed to enable commerce: ${json?.error?.message || JSON.stringify(json)}`);
  }

  await prisma.whatsappCommerce.update({
    where: { tenantId },
    data: { commerceEnabled: true },
  });

  return { success: true };
}

export async function detectExistingCommerce(tenantId) {
  if (!hasCommerceModel()) return null;

  try {
    const account = await getWabaToken(tenantId);
    if (!account.wabaId) return null;

    // Check if a catalog is already connected to this WABA
    const checkRes = await fetch(
      `${GRAPH_BASE}/${account.wabaId}/product_catalogs?access_token=${account.accessToken}`,
    );
    const checkJson = await checkRes.json().catch(() => ({}));

    if (!checkRes.ok) {
      logger.info({ tenantId, metaError: checkJson?.error }, '[commerce] detect: no existing catalog found on WABA');
      return null;
    }

    const existingData = checkJson?.data;
    const catalogId = Array.isArray(existingData) && existingData.length > 0
      ? existingData[0].id
      : null;

    if (!catalogId) return null;

    // Get catalog details to find the owning Business Manager
    const detailRes = await fetch(
      `${GRAPH_BASE}/${catalogId}?fields=id,name,owner_business_info&access_token=${account.accessToken}`,
    );
    const detailJson = await detailRes.json().catch(() => ({}));

    if (!detailRes.ok) {
      logger.warn({ tenantId, catalogId }, '[commerce] detect: found catalog but could not fetch details');
      return null;
    }

    const businessManagerId = detailJson?.owner_business_info?.id || null;

    // Save to local DB
    const commerce = await prisma.whatsappCommerce.upsert({
      where: { tenantId },
      update: { catalogId, businessManagerId, commerceEnabled: true },
      create: { tenantId, catalogId, businessManagerId, commerceEnabled: true },
    });

    logger.info({ tenantId, catalogId, businessManagerId }, '[commerce] detect: existing catalog linked');

    return commerce;
  } catch (e) {
    logger.warn({ tenantId, err: e.message }, '[commerce] detect: error during auto-detection');
    return null;
  }
}

export async function getCommerceStatus(tenantId) {
  if (!hasCommerceModel()) return { status: 'not_setup', reason: 'model_unavailable' };
  let commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });

  // Auto-detect existing catalog from Meta if no local record
  if (!commerce) {
    commerce = await detectExistingCommerce(tenantId);
  }

  if (!commerce) return { status: 'not_setup' };

  const arrangements = await prisma.catalogArrangement.findMany({
    where: { tenantId, isActive: true },
    include: { _count: { select: { sections: true } } },
  });

  return {
    status: commerce.catalogId ? 'active' : 'partial',
    commerceEnabled: commerce.commerceEnabled,
    hasCatalog: !!commerce.catalogId,
    catalogId: commerce.catalogId,
    arrangements: arrangements.map(a => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      isDefault: a.isDefault,
      sectionCount: a._count.sections,
    })),
  };
}

// Build one Meta catalog batch item from a product, applying optional
// per-arrangement overrides (custom price/image) and section label.
function buildCatalogItem(p, { customPriceMinor, customImageUrl, sectionName } = {}) {
  const priceMinor = customPriceMinor ?? p.priceMinor;
  const priceMajor = (priceMinor / 100).toFixed(2);
  const imageUrl = customImageUrl ?? p.imageUrl ?? '';
  return {
    retailer_id: p.sku || p.id,
    name: p.name,
    description: p.description || '',
    price: priceMajor,
    currency: p.currency || 'NGN',
    category: p.category || 'regular',
    image_url: imageUrl.startsWith('http') ? imageUrl : `${process.env.APP_URL || 'https://biziq.online'}${imageUrl}`,
    url: `${process.env.FRONTEND_URL || 'https://biziq.online'}/products/${p.slug || p.id}`,
    brand: p.brand || '',
    ...(p.tags?.length ? { tags: p.tags.join(',') } : {}),
    additional_image_urls: Array.isArray(p.galleryImages)
      ? p.galleryImages.map(g => g.url || '').filter(Boolean).join(',')
      : '',
    ...(sectionName ? { section: sectionName } : {}),
  };
}

// Upsert catalog items to Meta in batches of 50 (Meta's batch limit).
async function batchUpsertToCatalog(catalogId, accessToken, items) {
  const batchSize = 50;
  let synced = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await fetch(
      `${GRAPH_BASE}/${catalogId}/batch?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allow_upsert: true,
          requests: batch.map(item => ({ method: 'UPSERT', data: item })),
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Failed to sync batch ${i / batchSize + 1}: ${json?.error?.message || JSON.stringify(json)}`);
    }
    synced += batch.length;
  }
  return synced;
}

export async function syncArrangementToFacebook(tenantId, arrangementId) {
  const commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  if (!commerce?.catalogId) throw new BadRequestError('No catalog. Run setup first.');

  const arrangement = await prisma.catalogArrangement.findFirst({
    where: { id: arrangementId, tenantId, isActive: true },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: { product: true },
          },
        },
      },
    },
  });
  if (!arrangement) throw new BadRequestError('Arrangement not found');

  const account = await getWabaToken(tenantId);

  const items = [];
  for (const section of arrangement.sections) {
    for (const item of section.items) {
      items.push(buildCatalogItem(item.product, {
        customPriceMinor: item.customPriceMinor,
        customImageUrl: item.customImageUrl,
        sectionName: section.name,
      }));
    }
  }

  if (!items.length) {
    return { synced: 0, message: 'No products in this arrangement to sync' };
  }

  const synced = await batchUpsertToCatalog(commerce.catalogId, account.accessToken, items);
  logger.info({ tenantId, arrangementId: arrangement.id, synced }, '[commerce] arrangement synced to Facebook catalog');
  return { synced };
}

// One-click "put everything on WhatsApp": push every active product straight
// to the Meta catalog, no arrangement/section curation required. For businesses
// that just want their whole inventory shoppable on WhatsApp.
export async function syncAllProducts(tenantId) {
  const commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  if (!commerce?.catalogId) throw new BadRequestError('No catalog. Run setup first.');

  const account = await getWabaToken(tenantId);
  const products = await prisma.product.findMany({ where: { tenantId, isActive: true } });
  if (!products.length) {
    return { synced: 0, message: 'No active products to sync' };
  }

  const items = products.map((p) => buildCatalogItem(p));
  const synced = await batchUpsertToCatalog(commerce.catalogId, account.accessToken, items);
  logger.info({ tenantId, synced }, '[commerce] all products synced to Facebook catalog');
  return { synced };
}

// Resolve the Business Manager ID that owns this tenant's WABA, so we can
// create a catalog for businesses that connected before we started capturing
// business_id at signup — without making them look the ID up by hand. Prefers
// an ID we already stored, else asks Meta for the WABA's owning/on-behalf-of
// business. Best-effort: returns null if it can't be determined.
export async function resolveBusinessManagerId(tenantId) {
  const existing = await getCommerce(tenantId);
  if (existing?.businessManagerId) return existing.businessManagerId;

  const account = await getWabaToken(tenantId);
  if (!account.wabaId) return null;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${account.wabaId}?fields=owner_business_info,on_behalf_of_business_info&access_token=${account.accessToken}`
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ tenantId, metaError: json?.error }, '[commerce] resolveBusinessManagerId lookup failed');
      return null;
    }
    return json?.owner_business_info?.id || json?.on_behalf_of_business_info?.id || null;
  } catch (e) {
    logger.warn({ tenantId, err: e.message }, '[commerce] resolveBusinessManagerId error');
    return null;
  }
}

// One-call "just set up my catalog" used by the dashboard: reuse an existing
// catalog if one is already linked (locally or on the WABA), otherwise create
// and enable one automatically. Only falls back to asking for a Business
// Manager ID when we genuinely can't resolve it or Meta rejects the create.
export async function autoSetupCommerce(tenantId) {
  if (!hasCommerceModel()) return { status: 'not_setup', reason: 'model_unavailable' };

  const local = await getCommerce(tenantId);
  if (local?.catalogId) return getCommerceStatus(tenantId);

  const detected = await detectExistingCommerce(tenantId);
  if (detected?.catalogId) return getCommerceStatus(tenantId);

  const businessManagerId = await resolveBusinessManagerId(tenantId);
  if (!businessManagerId) {
    return { status: 'not_setup', reason: 'needs_business_manager_id' };
  }

  try {
    await setupCommerce(tenantId, businessManagerId);
    await enableCommerce(tenantId);
  } catch (e) {
    logger.warn({ tenantId, businessManagerId, err: e.message }, '[commerce] autoSetupCommerce create failed');
    return { status: 'not_setup', reason: 'create_failed', message: e.message };
  }

  return getCommerceStatus(tenantId);
}

export default {
  getCommerce,
  filterSyncedRetailerIds,
  resolveBusinessManagerId,
  autoSetupCommerce,
  setupCommerce,
  connectCatalogToWABA,
  enableCommerce,
  getCommerceStatus,
  syncArrangementToFacebook,
  syncAllProducts,
};
