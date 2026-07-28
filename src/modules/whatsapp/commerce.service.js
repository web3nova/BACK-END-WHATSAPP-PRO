import { prisma } from '../../config/prisma.js';
import { BadRequestError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';
import { decryptSecret } from '../../common/utils/encryption.js';

const GRAPH_BASE = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}`;

// A system-user token (from our own business) that holds catalog_management +
// business_management. The tenant's WhatsApp embedded-signup token can NEVER
// carry catalog_management — Meta's WhatsApp login config doesn't offer that
// permission — so all catalog-scoped Graph calls (create catalog, write items,
// read catalog products) must use this system-user token instead. Each tenant
// shares their catalog with our app during signup, so one system-user token
// manages every tenant's catalog. WABA/messaging calls still use the tenant
// token. Falls back to the tenant token when not configured (e.g. local dev).
const CATALOG_SYSTEM_TOKEN = process.env.META_CATALOG_SYSTEM_TOKEN || null;
function catalogToken(account) {
  return CATALOG_SYSTEM_TOKEN || account?.accessToken;
}

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
      `&filter=${encodeURIComponent(filter)}&access_token=${catalogToken(account)}`
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

  // vertical: 'commerce' makes it an E-Commerce catalog. WhatsApp only links
  // E-Commerce catalogs to a WABA — a catalog created without a vertical
  // defaults to a generic type and Meta rejects the link with
  // UNSUPPORTED_PRODUCT_CATALOGUE_TYPE.
  const res = await fetch(
    `${GRAPH_BASE}/${businessManagerId}/product_catalogs?access_token=${catalogToken(account)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: catalogName, vertical: 'commerce' }),
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

  // Linking a catalog to a WABA needs BOTH whatsapp_business_management (the
  // WABA) and catalog_management (to validate the catalog) — only the system
  // token has catalog_management, so use it here. The tenant WhatsApp token
  // can't see the catalog and Meta rejects the link as INVALID_PRODUCT_CATALOGUE_ID.
  const linkToken = catalogToken(account);

  // If this catalog is already connected to the WABA (e.g. Meta linked it
  // during embedded signup), don't POST again — Meta allows only one catalog
  // per WABA and re-connecting can error. Treat "already connected" as success.
  const currentRes = await fetch(
    `${GRAPH_BASE}/${account.wabaId}/product_catalogs?fields=id&access_token=${linkToken}`,
  );
  const currentJson = await currentRes.json().catch(() => ({}));
  const alreadyConnectedId = currentRes.ok && Array.isArray(currentJson.data) && currentJson.data.length
    ? currentJson.data[0].id
    : null;
  if (alreadyConnectedId === commerce.catalogId) {
    await prisma.whatsappCommerce.update({
      where: { tenantId },
      data: { commerceEnabled: true, meta: { ...commerce.meta, wabaCatalogConnected: true } },
    });
    logger.info({ tenantId, catalogId: commerce.catalogId }, '[commerce] catalog already connected to WABA — skipping connect');
    return { success: true };
  }

  const res = await fetch(
    `${GRAPH_BASE}/${account.wabaId}/product_catalogs?access_token=${linkToken}`,
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

// Record the exact catalog Meta linked (e.g. one created during embedded
// signup, whose id arrives in the FINISH event) instead of creating our own.
// Upsert-with-update so a reconnect overwrites any wrong id we stored earlier.
export async function linkCatalog(tenantId, catalogId, businessManagerId) {
  if (!hasCommerceModel()) throw new BadRequestError('Commerce models not available');
  return prisma.whatsappCommerce.upsert({
    where: { tenantId },
    update: { catalogId, ...(businessManagerId ? { businessManagerId } : {}) },
    create: { tenantId, catalogId, businessManagerId },
  });
}

// Turn on cart + catalog visibility for the phone number. Settings are per
// business phone number, not per WABA — Meta's endpoint is
// /{phoneNumberId}/whatsapp_commerce_settings with query-string params, not a
// JSON body. is_catalog_visible defaults to false, so it must be set explicitly
// or the storefront icon stays hidden even with the cart enabled.
export async function setCommerceSettings(tenantId) {
  const account = await getWabaToken(tenantId);
  if (!account.phoneNumberId) throw new BadRequestError('No phone number ID found');

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

export async function enableCommerce(tenantId) {
  const account = await getWabaToken(tenantId);
  if (!account.wabaId) throw new BadRequestError('No WABA ID found');

  await connectCatalogToWABA(tenantId);
  return setCommerceSettings(tenantId);
}

// Find the catalog this token is actually allowed to manage. When a business
// grants the Catalog asset during embedded signup, Meta scopes catalog_management
// to that specific catalog and records it in the token's granular_scopes. This
// is the only catalog we can write to — a catalog we create ourselves via the
// API is NOT writable by this token (Meta error 100 / subcode 33).
async function resolveManageableCatalogId(account, businessManagerId) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  // 1. Ask Meta which catalog this token is scoped to manage. debug_token must
  // be called with an APP access token (APP_ID|APP_SECRET), not the user token.
  if (appId && appSecret) {
    try {
      const res = await fetch(
        `${GRAPH_BASE}/debug_token?input_token=${catalogToken(account)}&access_token=${appId}|${appSecret}`,
      );
      const json = await res.json().catch(() => ({}));
      const data = json?.data || {};
      logger.info({ scopes: data.scopes, granular_scopes: data.granular_scopes, metaError: json?.error }, '[commerce] token scopes');
      const cat = (data.granular_scopes || []).find((s) => s.scope === 'catalog_management');
      if (cat?.target_ids?.[0]) return cat.target_ids[0];
    } catch (e) {
      logger.warn({ err: e.message }, '[commerce] debug_token error');
    }
  }

  // 2. Fallback: list the catalogs owned by the business and log them so we can
  // see what exists / pick the right one.
  if (businessManagerId) {
    try {
      const res = await fetch(
        `${GRAPH_BASE}/${businessManagerId}/owned_product_catalogs?fields=id,name&access_token=${catalogToken(account)}`,
      );
      const json = await res.json().catch(() => ({}));
      logger.info({ ownedCatalogs: json?.data, metaError: json?.error }, '[commerce] business owned catalogs');
      if (Array.isArray(json.data) && json.data.length) return json.data[0].id;
    } catch (e) {
      logger.warn({ err: e.message }, '[commerce] owned_product_catalogs error');
    }
  }

  return null;
}

// Self-heal: make our stored catalogId the one we can actually use. Prefers a
// catalog already connected to the WABA; if none is connected, finds the
// token-manageable catalog (granted via the Catalog asset at signup) and
// connects it to the WABA. Best-effort — returns the usable catalog id.
export async function reconcileConnectedCatalog(tenantId) {
  if (!hasCommerceModel()) return null;
  try {
    const account = await getWabaToken(tenantId);
    if (!account.wabaId) return null;
    const linkToken = catalogToken(account);
    const res = await fetch(
      `${GRAPH_BASE}/${account.wabaId}/product_catalogs?fields=id,name&access_token=${linkToken}`,
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ tenantId, metaError: json?.error }, '[commerce] reconcile: could not list WABA catalogs');
    }
    const catalogs = res.ok && Array.isArray(json.data) ? json.data : [];
    logger.info({ tenantId, wabaId: account.wabaId, catalogs }, '[commerce] catalogs connected to WABA');
    let actualId = catalogs.length ? catalogs[0].id : null;

    const local = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });

    // Nothing connected to the WABA yet. Connect the catalog WE ALREADY HAVE
    // stored (captured from the signup catalog_ids) — do NOT grab some other
    // owned catalog and overwrite it (that's how a stale generic catalog kept
    // clobbering the freshly-created commerce one). Only discover a catalog if
    // we have nothing stored at all.
    if (!actualId) {
      const candidate = local?.catalogId
        || await resolveManageableCatalogId(account, local?.businessManagerId);
      if (candidate) {
        const connectRes = await fetch(
          `${GRAPH_BASE}/${account.wabaId}/product_catalogs?access_token=${linkToken}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ catalog_id: candidate }) },
        );
        const connectJson = await connectRes.json().catch(() => ({}));
        if (!connectRes.ok) {
          logger.warn({ tenantId, candidate, metaError: connectJson?.error }, '[commerce] failed to connect catalog to WABA');
        } else {
          logger.info({ tenantId, candidate }, '[commerce] connected catalog to WABA');
        }
        actualId = candidate;
      }
    }
    if (!actualId) return null;

    if (!local || local.catalogId !== actualId) {
      await prisma.whatsappCommerce.upsert({
        where: { tenantId },
        update: { catalogId: actualId },
        create: { tenantId, catalogId: actualId, commerceEnabled: true },
      });
      logger.info({ tenantId, actualId, was: local?.catalogId }, '[commerce] reconciled stored catalog to the usable one');
    }
    return actualId;
  } catch (e) {
    logger.warn({ tenantId, err: e.message }, '[commerce] reconcileConnectedCatalog error');
    return null;
  }
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
  } else if (commerce.catalogId) {
    // Self-heal any drift between our stored id and the catalog actually
    // connected to the WABA (e.g. a duplicate created before this fix).
    const reconciled = await reconcileConnectedCatalog(tenantId);
    if (reconciled && reconciled !== commerce.catalogId) {
      commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
    }
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

// Build one Meta catalog item for the /items_batch API. Field names/format
// follow Meta's spec: the retailer id goes in `id`, product name in `title`,
// links in `link`/`image_link`, price as "<amount> <ISO currency>" (e.g.
// "12.34 NGN"); availability + condition are REQUIRED.
function buildCatalogItem(p, { customPriceMinor, customImageUrl, sectionName, tenantSlug } = {}) {
  const priceMinor = customPriceMinor ?? p.priceMinor ?? 0;
  const currency = p.currency || 'NGN';
  const rawImage = customImageUrl ?? p.imageUrl ?? '';
  const imageUrl = rawImage.startsWith('http')
    ? rawImage
    : (rawImage ? `${process.env.APP_URL || 'https://biziq.online'}${rawImage}` : '');
  // trackStock is opt-in and defaults to false, with `stock` itself defaulting
  // to 0 for every product (see schema comment) — so a business that has never
  // turned on stock tracking still has stock: 0 on every product. Checking
  // stock alone (the old logic) marked their entire catalog "out of stock" on
  // Meta regardless of real availability. Only actually enforce the count when
  // the business opted into tracking it.
  const inStock = !p.trackStock || p.stock > 0;
  const base = process.env.FRONTEND_URL || 'https://biziq.online';
  // The real public storefront route is /b/:slug/product/:id (or
  // /storefront/:tenantId/product/:id without a slug) — /products/:id doesn't
  // exist as a public route at all, so every "View" tap from the WhatsApp
  // catalog was landing customers on the generic marketing homepage instead
  // of the actual product.
  const link = tenantSlug
    ? `${base}/b/${tenantSlug}/product/${p.id}`
    : `${base}/storefront/${p.tenantId}/product/${p.id}`;
  return {
    id: p.sku || p.id,
    title: p.name,
    description: p.description || p.name,
    availability: inStock ? 'in stock' : 'out of stock',
    condition: 'new',
    price: `${(priceMinor / 100).toFixed(2)} ${currency}`,
    link,
    ...(imageUrl ? { image_link: imageUrl } : {}),
    ...(p.brand ? { brand: p.brand } : {}),
    ...(sectionName ? { custom_label_0: sectionName } : {}),
  };
}

// Upsert catalog items to Meta via the /items_batch endpoint (the current
// catalog write API — the legacy /batch edge isn't supported on catalogs
// created through the newer WhatsApp/commerce flows). UPDATE upserts by `id`.
// Surfaces Meta's actual rejection reason as a 400 instead of an opaque 500.
async function batchUpsertToCatalog(catalogId, accessToken, items) {
  const batchSize = 50;
  let synced = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await fetch(
      `${GRAPH_BASE}/${catalogId}/items_batch?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'PRODUCT_ITEM',
          requests: batch.map(item => ({ method: 'UPDATE', data: item })),
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ catalogId, status: res.status, metaError: json?.error, sampleItem: batch[0] }, '[commerce] catalog items_batch rejected by Meta');
      const msg = json?.error?.error_user_msg || json?.error?.message || JSON.stringify(json);
      throw new BadRequestError(`Meta rejected the catalog sync: ${msg}`);
    }
    synced += batch.length;
  }
  return synced;
}

// Remove a product from the Meta catalog when it's deleted locally. Sync only
// ever pushed creates/updates — nothing told Meta to drop an item once the
// underlying product was gone, so the catalog silently accumulated stale
// entries. A customer could then order a product that no longer existed
// (the order tools then failed to verify it — see orderTools.js), and the
// WhatsApp catalog kept showing products that were no longer for sale.
// Best-effort: a tenant with no catalog set up, or a Meta error, must never
// block the actual product deletion — log and move on.
export async function deleteCatalogItem(tenantId, retailerId) {
  if (!hasCommerceModel() || !retailerId) return;
  try {
    const commerce = await getCommerce(tenantId);
    if (!commerce?.catalogId) return;
    const account = await getWabaToken(tenantId);
    const res = await fetch(
      `${GRAPH_BASE}/${commerce.catalogId}/items_batch?access_token=${catalogToken(account)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'PRODUCT_ITEM',
          requests: [{ method: 'DELETE', data: { id: retailerId } }],
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ tenantId, retailerId, metaError: json?.error }, '[commerce] failed to delete catalog item from Meta');
    } else {
      logger.info({ tenantId, retailerId }, '[commerce] deleted catalog item from Meta');
    }
  } catch (e) {
    logger.warn({ tenantId, retailerId, err: e.message }, '[commerce] deleteCatalogItem error');
  }
}

async function getTenantSlug(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return tenant?.slug || null;
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
  const tenantSlug = await getTenantSlug(tenantId);

  const items = [];
  for (const section of arrangement.sections) {
    for (const item of section.items) {
      items.push(buildCatalogItem(item.product, {
        customPriceMinor: item.customPriceMinor,
        customImageUrl: item.customImageUrl,
        sectionName: section.name,
        tenantSlug,
      }));
    }
  }

  if (!items.length) {
    return { synced: 0, message: 'No products in this arrangement to sync' };
  }

  const synced = await batchUpsertToCatalog(commerce.catalogId, catalogToken(account), items);
  logger.info({ tenantId, arrangementId: arrangement.id, synced }, '[commerce] arrangement synced to Facebook catalog');
  return { synced };
}

// One-click "put everything on WhatsApp": push every active product straight
// to the Meta catalog, no arrangement/section curation required. For businesses
// that just want their whole inventory shoppable on WhatsApp.
export async function syncAllProducts(tenantId) {
  // Always target the catalog actually connected to the WABA (which our token
  // provably has access to), not a possibly-stale/unwritable stored id.
  await reconcileConnectedCatalog(tenantId);
  const commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  if (!commerce?.catalogId) throw new BadRequestError('No catalog. Run setup first.');

  const account = await getWabaToken(tenantId);
  const products = await prisma.product.findMany({ where: { tenantId, isActive: true } });
  if (!products.length) {
    return { synced: 0, message: 'No active products to sync' };
  }
  const tenantSlug = await getTenantSlug(tenantId);

  const items = products.map((p) => buildCatalogItem(p, { tenantSlug, sectionName: categoryLabel(p.category) }));
  const synced = await batchUpsertToCatalog(commerce.catalogId, catalogToken(account), items);
  logger.info({ tenantId, synced }, '[commerce] all products synced to Facebook catalog');

  // Mirror the sync into a local "All Products" section so the dashboard's
  // Catalog Arrangements view shows the same products that are actually live
  // on Meta — previously "Sync all products" only wrote to Facebook, so a
  // tenant looking at their arrangement/section page saw it empty even though
  // the sync had succeeded, with no visual confirmation of what's really on
  // WhatsApp. Best-effort: sync to Meta above already succeeded either way.
  try {
    await mirrorAllProductsSection(tenantId, commerce.id, products);
  } catch (e) {
    logger.warn({ tenantId, err: e.message }, '[commerce] failed to mirror synced products into a local section');
  }

  // Two-way sync: remove anything Meta still has that no longer matches a
  // current active local product. Sync only ever pushed creates/updates, so
  // products deleted (or deactivated) before the per-delete Meta cleanup was
  // added — or from earlier test syncs — stayed live on WhatsApp/Commerce
  // Manager forever with no way to remove them from our dashboard, since our
  // UI only has a delete action for products that still exist locally.
  let removed = 0;
  try {
    const currentRetailerIds = new Set(products.map((p) => p.sku || p.id));
    const metaRetailerIds = await listCatalogRetailerIds(commerce.catalogId, catalogToken(account));
    const orphaned = metaRetailerIds.filter((id) => !currentRetailerIds.has(id));
    if (orphaned.length) {
      removed = await batchDeleteFromCatalog(commerce.catalogId, catalogToken(account), orphaned);
      logger.info({ tenantId, removed }, '[commerce] removed orphaned items from Facebook catalog');
    }
  } catch (e) {
    logger.warn({ tenantId, err: e.message }, '[commerce] failed to clean up orphaned catalog items');
  }

  return { synced, removed };
}

// Page through every retailer_id currently in the Meta catalog. Used to find
// items with no matching local product (see syncAllProducts cleanup above).
async function listCatalogRetailerIds(catalogId, accessToken) {
  const ids = [];
  let url = `${GRAPH_BASE}/${catalogId}/products?fields=retailer_id&limit=200&access_token=${accessToken}`;
  while (url) {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) break;
    for (const item of json.data || []) {
      if (item.retailer_id) ids.push(item.retailer_id);
    }
    url = json.paging?.next || null;
  }
  return ids;
}

// Batch-delete catalog items by retailer_id (in batches of 50, matching
// batchUpsertToCatalog's limit).
async function batchDeleteFromCatalog(catalogId, accessToken, retailerIds) {
  const batchSize = 50;
  let removed = 0;
  for (let i = 0; i < retailerIds.length; i += batchSize) {
    const batch = retailerIds.slice(i, i + batchSize);
    const res = await fetch(
      `${GRAPH_BASE}/${catalogId}/items_batch?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'PRODUCT_ITEM',
          requests: batch.map((id) => ({ method: 'DELETE', data: { id } })),
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ catalogId, status: res.status, metaError: json?.error }, '[commerce] orphan cleanup batch delete rejected by Meta');
      continue;
    }
    removed += batch.length;
  }
  return removed;
}

// Product.category is a small fixed enum (see product.validation.js) — used
// here purely as the grouping key for auto-sections, independent of Meta's
// own category taxonomy (buildCatalogItem deliberately does not send it as
// Meta's "category" field — see its comment).
const CATEGORY_LABELS = {
  'best-selling': 'Best Selling',
  'new-arrival': 'New Arrival',
  featured: 'Featured',
  discount: 'Discount',
  regular: 'Regular',
  others: 'Others',
};
function categoryLabel(category) {
  return CATEGORY_LABELS[category] || 'Regular';
}

// Upsert (create-if-missing) the tenant's "All Products" arrangement, with one
// Section per product category (Best Selling, New Arrival, Featured, etc.) —
// matching the section label each item is actually synced to Meta under (see
// buildCatalogItem's sectionName above) — instead of dumping every product
// into a single flat section. Keeps items in lockstep with whatever set of
// products was just pushed via syncAllProducts: added ones appear under their
// category's section, ones no longer active are marked inactive rather than
// deleted (keeps sort order stable if a product is reactivated later), and a
// product whose category changed is moved to the new section and cleared from
// the old one. Deliberately NOT isDefault: true — it's purely a visual mirror
// of "what did the last sync-all push to Meta", not a claim on being the
// tenant's default customer-facing arrangement (createArrangement's
// unset-other-defaults logic isn't invoked here, so setting it here could
// leave two arrangements both flagged default).
async function mirrorAllProductsSection(tenantId, commerceId, products) {
  let arrangement = await prisma.catalogArrangement.findFirst({
    where: { tenantId, slug: 'all-products' },
  });
  if (!arrangement) {
    arrangement = await prisma.catalogArrangement.create({
      data: { tenantId, commerceId, name: 'All Products', slug: 'all-products' },
    });
  }

  const byCategory = new Map();
  for (const p of products) {
    const label = categoryLabel(p.category);
    if (!byCategory.has(label)) byCategory.set(label, []);
    byCategory.get(label).push(p);
  }

  const existingSections = await prisma.catalogSection.findMany({
    where: { tenantId, arrangementId: arrangement.id },
  });
  const sectionByName = new Map(existingSections.map((s) => [s.name, s]));

  const keptItemIds = [];
  let sortOrder = existingSections.length;
  for (const [label, categoryProducts] of byCategory) {
    let section = sectionByName.get(label);
    if (!section) {
      section = await prisma.catalogSection.create({
        data: { tenantId, arrangementId: arrangement.id, name: label, sortOrder: sortOrder++ },
      });
      sectionByName.set(label, section);
    }
    for (let i = 0; i < categoryProducts.length; i++) {
      const item = await prisma.catalogSectionItem.upsert({
        where: { sectionId_productId: { sectionId: section.id, productId: categoryProducts[i].id } },
        update: { isActive: true },
        create: { tenantId, sectionId: section.id, productId: categoryProducts[i].id, sortOrder: i, isActive: true },
      });
      keptItemIds.push(item.id);
    }
  }

  // Deactivate items that are no longer part of this sync — either the
  // product is inactive/deleted, or it moved to a different category's
  // section (its item under the OLD section should no longer show as active).
  await prisma.catalogSectionItem.updateMany({
    where: {
      tenantId,
      isActive: true,
      id: { notIn: keptItemIds },
      section: { arrangementId: arrangement.id },
    },
    data: { isActive: false },
  });
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
  linkCatalog,
  setCommerceSettings,
  reconcileConnectedCatalog,
  connectCatalogToWABA,
  enableCommerce,
  getCommerceStatus,
  syncArrangementToFacebook,
  syncAllProducts,
  deleteCatalogItem,
};
