import { BadRequestError } from '../../../common/errors/index.js';
import { config } from '../../../config/index.js';
import { createPaystackProvider } from './paystack.provider.js';

const providers = {
  paystack: createPaystackProvider(),
};

export const normalizeProviderName = (providerName) =>
  String(providerName || config.payment.provider || 'paystack').trim().toLowerCase();

export const getPaymentProvider = (providerName) => {
  const normalized = normalizeProviderName(providerName);
  const provider = providers[normalized];

  if (!provider) {
    throw new BadRequestError(`Unsupported payment provider: ${providerName}`);
  }

  return provider;
};

export const supportedPaymentProviders = Object.freeze(Object.keys(providers));
