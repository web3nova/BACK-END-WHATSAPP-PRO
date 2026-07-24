import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';

function hasModels() {
  return typeof prisma.catalogArrangement?.findMany === 'function';
}

function requireModels() {
  if (!hasModels()) throw new BadRequestError('Catalog arrangement models not available — Prisma client needs regeneration');
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

// ── Arrangements ──────────────────────────────────────────────

export async function listArrangements(tenantId) {
  requireModels();
  return prisma.catalogArrangement.findMany({
    where: { tenantId },
    include: {
      _count: { select: { sections: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getArrangement(tenantId, id) {
  const arrangement = await prisma.catalogArrangement.findFirst({
    where: { id, tenantId },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            include: {
              product: {
                select: {
                  id: true, name: true, slug: true, sku: true,
                  priceMinor: true, currency: true, imageUrl: true,
                  imageStorageKey: true, isActive: true, stock: true,
                  category: true, brand: true,
                },
              },
            },
          },
          _count: { select: { items: true } },
        },
      },
    },
  });
  if (!arrangement) throw new NotFoundError('Arrangement not found');
  return arrangement;
}

export async function createArrangement(tenantId, data) {
  requireModels();
  const commerce = await prisma.whatsappCommerce.findUnique({ where: { tenantId } });
  if (!commerce) throw new BadRequestError('WhatsApp commerce not initialized. Setup commerce first.');

  let slug = data.slug || slugify(data.name);
  const existing = await prisma.catalogArrangement.findUnique({ where: { tenantId_slug: { tenantId, slug } } });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  const arrangement = await prisma.catalogArrangement.create({
    data: {
      commerceId: commerce.id,
      tenantId,
      name: data.name,
      slug,
      description: data.description,
      isDefault: data.isDefault ?? false,
      customerSegment: data.customerSegment,
    },
  });

  if (data.isDefault) {
    await prisma.catalogArrangement.updateMany({
      where: { tenantId, id: { not: arrangement.id }, isDefault: true },
      data: { isDefault: false },
    });
  }

  return arrangement;
}

export async function updateArrangement(tenantId, id, data) {
  const existing = await prisma.catalogArrangement.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Arrangement not found');

  const updateData = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.customerSegment !== undefined) updateData.customerSegment = data.customerSegment;

  const arrangement = await prisma.catalogArrangement.update({ where: { id }, data: updateData });

  if (data.isDefault) {
    await prisma.catalogArrangement.updateMany({
      where: { tenantId, id: { not: id }, isDefault: true },
      data: { isDefault: false },
    });
  }

  return arrangement;
}

export async function deleteArrangement(tenantId, id) {
  const existing = await prisma.catalogArrangement.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Arrangement not found');
  await prisma.catalogArrangement.delete({ where: { id } });
}

export async function setDefaultArrangement(tenantId, id) {
  const existing = await prisma.catalogArrangement.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Arrangement not found');

  await prisma.catalogArrangement.updateMany({
    where: { tenantId },
    data: { isDefault: false },
  });
  return prisma.catalogArrangement.update({ where: { id }, data: { isDefault: true } });
}

// ── Sections ──────────────────────────────────────────────────

export async function listSections(tenantId, arrangementId) {
  return prisma.catalogSection.findMany({
    where: { arrangementId, tenantId },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function createSection(tenantId, data) {
  const arrangement = await prisma.catalogArrangement.findFirst({
    where: { id: data.arrangementId, tenantId },
  });
  if (!arrangement) throw new NotFoundError('Arrangement not found');

  const maxOrder = await prisma.catalogSection.aggregate({
    where: { arrangementId: data.arrangementId },
    _max: { sortOrder: true },
  });

  return prisma.catalogSection.create({
    data: {
      arrangementId: data.arrangementId,
      tenantId,
      name: data.name,
      description: data.description,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateSection(tenantId, id, data) {
  const existing = await prisma.catalogSection.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Section not found');

  return prisma.catalogSection.update({ where: { id }, data });
}

export async function deleteSection(tenantId, id) {
  const existing = await prisma.catalogSection.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Section not found');
  await prisma.catalogSection.delete({ where: { id } });
}

export async function reorderSections(tenantId, items) {
  for (const item of items) {
    await prisma.catalogSection.updateMany({
      where: { id: item.id, tenantId },
      data: { sortOrder: item.sortOrder },
    });
  }
}

// ── Section Items ─────────────────────────────────────────────

export async function listItems(tenantId, sectionId) {
  return prisma.catalogSectionItem.findMany({
    where: { sectionId, tenantId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      product: {
        select: {
          id: true, name: true, slug: true, sku: true,
          priceMinor: true, currency: true, imageUrl: true,
          imageStorageKey: true, isActive: true, stock: true,
          category: true, brand: true,
        },
      },
    },
  });
}

export async function addItemToSection(tenantId, data) {
  const section = await prisma.catalogSection.findFirst({
    where: { id: data.sectionId, tenantId },
  });
  if (!section) throw new NotFoundError('Section not found');

  const product = await prisma.product.findFirst({
    where: { id: data.productId, tenantId },
  });
  if (!product) throw new NotFoundError('Product not found');

  const existing = await prisma.catalogSectionItem.findUnique({
    where: { sectionId_productId: { sectionId: data.sectionId, productId: data.productId } },
  });
  if (existing) {
    await prisma.catalogSectionItem.update({
      where: { id: existing.id },
      data: { isActive: true, sortOrder: existing.sortOrder },
    });
    return existing;
  }

  const maxOrder = await prisma.catalogSectionItem.aggregate({
    where: { sectionId: data.sectionId },
    _max: { sortOrder: true },
  });

  return prisma.catalogSectionItem.create({
    data: {
      sectionId: data.sectionId,
      productId: data.productId,
      tenantId,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      customPriceMinor: data.customPriceMinor,
      customImageUrl: data.customImageUrl,
    },
  });
}

export async function removeItemFromSection(tenantId, id) {
  const existing = await prisma.catalogSectionItem.findFirst({ where: { id, tenantId } });
  if (!existing) throw new NotFoundError('Item not found');
  await prisma.catalogSectionItem.delete({ where: { id } });
}

export async function reorderItems(tenantId, items) {
  for (const item of items) {
    await prisma.catalogSectionItem.updateMany({
      where: { id: item.id, tenantId },
      data: { sortOrder: item.sortOrder },
    });
  }
}

// ── For Customers ─────────────────────────────────────────────

export async function getArrangementForCustomer(tenantId, customerPhone) {
  if (!hasModels()) return { sections: [], arrangement: null };
  let arrangement;

  if (customerPhone) {
    arrangement = await prisma.catalogArrangement.findFirst({
      where: { tenantId, isActive: true, customerSegment: { not: null } },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                product: {
                  select: {
                    id: true, name: true, slug: true, sku: true,
                    priceMinor: true, currency: true, imageUrl: true,
                    imageStorageKey: true, stock: true,
                    category: true, brand: true, description: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  if (!arrangement) {
    arrangement = await prisma.catalogArrangement.findFirst({
      where: { tenantId, isActive: true, isDefault: true },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            items: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                product: {
                  select: {
                    id: true, name: true, slug: true, sku: true,
                    priceMinor: true, currency: true, imageUrl: true,
                    imageStorageKey: true, stock: true,
                    category: true, brand: true, description: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  if (!arrangement) {
    return { sections: [], arrangement: null };
  }

  const sections = arrangement.sections.map(section => ({
    id: section.id,
    name: section.name,
    description: section.description,
    items: section.items.map(item => ({
      id: item.id,
      productId: item.product.id,
      name: item.product.name,
      description: item.product.description,
      priceMinor: item.customPriceMinor ?? item.product.priceMinor,
      currency: item.product.currency,
      imageUrl: item.customImageUrl ?? item.product.imageUrl,
      sku: item.product.sku,
      category: item.product.category,
      brand: item.product.brand,
      stock: item.product.stock,
    })),
  }));

  return { arrangement: { id: arrangement.id, name: arrangement.name }, sections };
}

export default {
  listArrangements, getArrangement, createArrangement,
  updateArrangement, deleteArrangement, setDefaultArrangement,
  listSections, createSection, updateSection, deleteSection, reorderSections,
  listItems, addItemToSection, removeItemFromSection, reorderItems,
  getArrangementForCustomer,
};
