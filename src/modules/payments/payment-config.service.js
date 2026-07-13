import { prisma } from '../../config/prisma.js';

export async function getConfig(tenantId) {
  const config = await prisma.paymentConfig.findUnique({ where: { tenantId } });
  if (!config) {
    return {
      tenantId,
      data: {
        manual: { isActive: false, bankAccount: null },
        paystack: { isActive: false, publicKey: '', secretKey: '' },
        monnify: { isActive: false, apiKey: '', secretKey: '', contractCode: '' },
        blockradar: { isActive: false, apiKey: '', secretKey: '', walletId: '', webhookUrl: '' },
        otherProviders: [],
        preferredProvider: 'manual',
      },
    };
  }
  return config;
}

export async function upsertConfig(tenantId, data) {
  const existing = await getConfig(tenantId);
  const merged = {
    ...existing.data,
    ...data,
    manual: { ...existing.data?.manual, ...data.manual },
    paystack: { ...existing.data?.paystack, ...data.paystack },
    monnify: { ...existing.data?.monnify, ...data.monnify },
    blockradar: { ...existing.data?.blockradar, ...data.blockradar },
  };
  if (data.otherProviders) merged.otherProviders = data.otherProviders;

  return prisma.paymentConfig.upsert({
    where: { tenantId },
    create: { tenantId, data: merged },
    update: { data: merged },
  });
}
