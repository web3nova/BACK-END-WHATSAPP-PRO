import { config } from '../../config/index.js';
import { BadRequestError } from '../../common/errors/index.js';
import { logger } from '../../config/logger.js';

const headers = {
  Authorization: `Bearer ${config.lenco.apiKey}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

export async function resolveAccount(accountNumber, bankCode) {
  if (!accountNumber || !bankCode) throw new BadRequestError('accountNumber and bankCode are required.');
  if (!/^\d{10}$/.test(accountNumber)) throw new BadRequestError('Account number must be 10 digits.');

  const url = `${config.lenco.baseUrl}/resolve?accountNumber=${encodeURIComponent(accountNumber)}&bankCode=${encodeURIComponent(bankCode)}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg = body?.message || body?.responseMessage || 'Could not verify account number.';
    logger.error({ accountNumber, bankCode, status: res.status, msg }, '[bank] resolve failed');
    throw new BadRequestError(msg);
  }

  const json = await res.json();
  if (json.status === false) {
    const msg = json?.message || 'Account verification failed.';
    logger.error({ accountNumber, bankCode, msg }, '[bank] resolve unsuccessful');
    throw new BadRequestError(msg);
  }

  return {
    accountNumber: json.data.accountNumber,
    accountName: json.data.accountName,
    bankName: json.data.bankName,
  };
}

export async function listBanks() {
  try {
    const res = await fetch(`${config.lenco.baseUrl}/banks`, { headers });

    if (!res.ok) {
      logger.warn({ status: res.status }, '[bank] listBanks failed');
      return [];
    }

    const json = await res.json();
    if (json.status === false) return [];

    return json.data.map((b) => ({
      name: b.name,
      code: b.code,
    }));
  } catch (err) {
    logger.warn({ err: err.message }, '[bank] listBanks error');
    return [];
  }
}
