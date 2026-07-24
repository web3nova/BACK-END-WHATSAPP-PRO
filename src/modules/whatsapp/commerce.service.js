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
    `${GRAPH_BASE}/${account.wabaId}/whatsapp-business-catalog?access_token=${account.accessToken}`,
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

  await connectCatalogToWABA(tenantId);

  const res = await fetch(
    `${GRAPH_BASE}/${account.wabaId}/commerce_settings?access_token=${account.accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_cart_enabled: true }),
    }
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
      `${GRAPH_BASE}/${account.wabaId}/whatsapp-business-catalog?access_token=${account.accessToken}`,
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
      const p = item.product;
      const priceMinor = item.customPriceMinor ?? p.priceMinor;
      const priceMajor = (priceMinor / 100).toFixed(2);
      const imageUrl = item.customImageUrl ?? p.imageUrl ?? '';

      items.push({
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
        ...(section.name ? { section: section.name } : {}),
      });
    }
  }

  if (!items.length) {
    return { synced: 0, message: 'No products in this arrangement to sync' };
  }

  const batchSize = 50;
  let synced = 0;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await fetch(
      `${GRAPH_BASE}/${commerce.catalogId}/batch?access_token=${account.accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allow_upsert: true,
          requests: batch.map(item => ({
            method: 'UPSERT',
            data: item,
          })),
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Failed to sync batch ${i / batchSize + 1}: ${json?.error?.message || JSON.stringify(json)}`);
    }
    synced += batch.length;
  }

  logger.info({ tenantId, arrangementId: arrangement.id, synced }, '[commerce] arrangement synced to Facebook catalog');

  return { synced };
}

export default {
  getCommerce,
  setupCommerce,
  connectCatalogToWABA,
  enableCommerce,
  getCommerceStatus,
  syncArrangementToFacebook,
};
