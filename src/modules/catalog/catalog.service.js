import { prisma } from '../../config/prisma.js';
import { NotFoundError, BadRequestError } from '../../common/errors/index.js';
import { paginate, paginatedResponse } from '../../common/utils/pagination.js';

// Parse a CSV buffer into an array of objects using the first row as column
// headers. Exported for reuse by product.service.js's bulk CSV import —
// same parser, different destination (real Product rows instead of the
// JSONB Catalog table).
export function parseCSV(buffer) {
  const text = buffer.toString('utf8');
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += ch;
  }

  row.push(current.trim());
  if (row.some((value) => value !== '')) rows.push(row);

  if (inQuotes) {
    throw new BadRequestError('CSV contains an unterminated quoted field.');
  }

  if (rows.length < 2) {
    throw new BadRequestError('CSV must have a header row and at least one data row.');
  }

  const headers = rows[0].map((header) => header.trim()).filter(Boolean);
  if (!headers.length) {
    throw new BadRequestError('CSV header row must include at least one column name.');
  }

  return rows
    .slice(1)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
    );
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMinorUnits(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function normalizeCurrency(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined;
}

// If a "price" field exists (float), convert to priceMinor (integer minor units).
function normalizeItems(items) {
  return items.map((item) => {
    const out = { ...item };
    if (out.price !== undefined && out.priceMinor === undefined) {
      out.priceMinor = parseMinorUnits(out.price);
    }
    if (out.priceMinor !== undefined) {
      out.priceMinor = parseInteger(out.priceMinor);
    }
    if (out.stock !== undefined) {
      out.stock = parseInteger(out.stock);
    }
    const currency = normalizeCurrency(out.currency);
    if (currency) {
      out.currency = currency;
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
  const data = {
    items: normalizeItems(items),
    source: 'form',
    ingestedAt: new Date().toISOString(),
  };
  return prisma.catalog.create({ data: { tenantId, name, data } });
}

export async function remove(id, tenantId) {
  const catalog = await prisma.catalog.findFirst({ where: { id, tenantId } });
  if (!catalog) throw new NotFoundError('Catalog not found.');
  await prisma.catalog.delete({ where: { id } });
}
