import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';

// Parse a CSV buffer into an array of objects using the first row as column headers.
function parseCSV(buffer) {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    throw new BadRequestError('CSV must have a header row and at least one data row.');
  }

  // Split by comma but respect double-quoted fields.
  const splitLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

// If a "price" field exists (float), convert to priceMinor (integer minor units).
function normalizeItems(items) {
  return items.map((item) => {
    const out = { ...item };
    if (out.price !== undefined && out.priceMinor === undefined) {
      out.priceMinor = Math.round(parseFloat(out.price) * 100) || 0;
    }
    if (out.priceMinor !== undefined) {
      out.priceMinor = parseInt(out.priceMinor, 10) || 0;
    }
    if (out.stock !== undefined) {
      out.stock = parseInt(out.stock, 10) || 0;
    }
    return out;
  });
}

export async function list(tenantId, query) {
  const { page, limit, skip } = paginate(query);
  const where = { tenantId };
  const [items, total] = await Promise.all([
    prisma.catalog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, version: true, createdAt: true },
    }),
    prisma.catalog.count({ where }),
  ]);
  return paginatedResponse(items, total, page, limit);
}

export async function getById(id, tenantId) {
  const catalog = await prisma.catalog.findFirst({ where: { id, tenantId } });
  if (!catalog) throw new NotFoundError('Catalog not found.');
  return catalog;
}

export async function ingestCSV(tenantId, { name, buffer }) {
  const raw = parseCSV(buffer);
  if (!raw.length) throw new BadRequestError('CSV produced no rows after parsing.');
  const data = { items: normalizeItems(raw), source: 'csv', ingestedAt: new Date().toISOString() };
  return prisma.catalog.create({ data: { tenantId, name, data } });
}

export async function ingestForm(tenantId, { name, items }) {
  if (!Array.isArray(items) || !items.length) {
    throw new BadRequestError('items must be a non-empty array.');
  }
  const data = { items: normalizeItems(items), source: 'form', ingestedAt: new Date().toISOString() };
  return prisma.catalog.create({ data: { tenantId, name, data } });
}

export async function remove(id, tenantId) {
  const catalog = await prisma.catalog.findFirst({ where: { id, tenantId } });
  if (!catalog) throw new NotFoundError('Catalog not found.');
  await prisma.catalog.delete({ where: { id } });
}
