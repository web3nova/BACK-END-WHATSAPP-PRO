import dotenv from 'dotenv';

dotenv.config();

// Hard required — server cannot function without these
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[config] Missing required env var: ${key}. Set it in .env or your deployment environment.`);
  }
}

// Soft required — warn but don't crash; individual features will fail gracefully
const softRequired = [
  'QDRANT_URL', 'QDRANT_API_KEY',
  'META_APP_ID', 'META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN',
  'PAYMENT_SECRET_KEY',
  'MONNIFY_API_KEY', 'MONNIFY_SECRET_KEY', 'MONNIFY_CONTRACT_CODE',
  'LENCO_API_KEY',
  'RESEND_API_KEY',
  'STORAGE_ENDPOINT', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY',
  'VERCEL_TOKEN', 'VERCEL_PROJECT_ID',
];

for (const key of softRequired) {
  if (!process.env[key]) {
    console.warn(`[config] Warning: optional env var "${key}" is not set — related features will be unavailable.`);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  appUrl: process.env.APP_URL || 'http://localhost:4000',

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  databaseUrl: process.env.DATABASE_URL,

  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    rpId: process.env.RP_ID || 'localhost',
    passkeyAllowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,https://front-end-whatsapp-pro.vercel.app').split(','),
  },

  checkout: {
    deliveryOptions: [
      {
        id: 'standard',
        name: 'Standard Delivery',
        time: '2-3 business days',
        price: 0,
        description: 'Reliable delivery within business hours',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
      {
        id: 'express',
        name: 'Express Delivery',
        time: '1-2 business days',
        price: 2000,
        description: 'Faster delivery for urgent orders',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
      {
        id: 'same-day',
        name: 'Same Day Delivery',
        time: 'Within 8 hours',
        price: 4000,
        description: 'Delivery within 8 hours (if available)',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        rushOrder: true,
      },
    ],
    taxRate: 0.075,
    freeShippingThreshold: 10000,
  },

  paymentProviders: {
    paystack: {
      name: 'Paystack',
      apiKey: process.env.PAYSTACK_SECRET_KEY || 'pk_test_abc123',
      publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_xyz789',
      baseUrl: 'https://api.paystack.co',
      callbackUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/payments/callback`,
    },
    monnify: {
      name: 'Monnify',
      apiKey: process.env.MONNIFY_API_KEY,
      secretKey: process.env.MONNIFY_SECRET_KEY,
      contractCode: process.env.MONNIFY_CONTRACT_CODE,
      baseUrl: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com',
      callbackUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/payments/callback`,
    },
    payphill: {
      name: 'Payphill',
      apiKey: process.env.PAYPHILL_API_KEY,
      baseUrl: 'https://api.payphill.co',
    },
    flutterwave: {
      name: 'Flutterwave',
      apiKey: process.env.FLUTTERWAVE_SECRET_KEY,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
      baseUrl: 'https://api.flutterwave.co/v3',
    },
  },

  delivery: {
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    businessHours: {
      start: '09:00',
      end: '18:00',
    },
    timeSlots: [
      { id: 'morning', label: 'Morning (9:00 - 12:00)', start: '09:00', end: '12:00' },
      { id: 'afternoon', label: 'Afternoon (12:00 - 17:00)', start: '12:00', end: '17:00' },
      { id: 'evening', label: 'Evening (17:00 - 20:00)', start: '17:00', end: '20:00' },
    ],
    deliveryRegions: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Enugu', 'Kaduna'],
    weightCategories: [
      { id: 'light', name: 'Light (under 2kg)', maxWeight: 2 },
      { id: 'medium', name: 'Medium (2-5kg)', maxWeight: 5 },
      { id: 'heavy', name: 'Heavy (5-10kg)', maxWeight: 10 },
      { id: 'oversize', name: 'Oversize (10kg+)', maxWeight: 50 },
    ],
  },

  webhooks: {
    payment: {
      paystack: process.env.PAYSTACK_WEBHOOK_SECRET || '',
      monnify: process.env.MONNIFY_WEBHOOK_SECRET || '',
    },
    delivery: {
      endpoint: `${process.env.APP_URL || 'http://localhost:4000'}/api/v1/webhooks/delivery`,
    },
  },

  thirdParty: {
    monnify: {
      enabled: !!process.env.MONNIFY_API_KEY,
      apiKey: process.env.MONNIFY_API_KEY,
      secretKey: process.env.MONNIFY_SECRET_KEY,
    },
    lenco: {
      enabled: !!process.env.LENCO_API_KEY,
      apiKey: process.env.LENCO_API_KEY,
    },
    payphone: {
      enabled: !!process.env.PAYPHONE_API_KEY,
      apiKey: process.env.PAYPHONE_API_KEY,
    },
    flutterwave: {
      enabled: !!process.env.FLUTTERWAVE_PUBLIC_KEY,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    },
  },

  qdrant: {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    collection: process.env.QDRANT_COLLECTION || 'knowledge',
  },

  ai: {
    chatProvider: process.env.AI_CHAT_PROVIDER || 'anthropic',
    embeddingProvider: process.env.AI_EMBEDDING_PROVIDER || 'openai',
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      chatModel: process.env.ANTHROPIC_CHAT_MODEL || 'claude-opus-4-8',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      chatModel: process.env.OPENROUTER_CHAT_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    },
    jina: {
      apiKey: process.env.JINA_API_KEY,
      embedModel: process.env.JINA_EMBED_MODEL || 'jina-embeddings-v3',
    },
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT,
    bucket: process.env.STORAGE_BUCKET,
    accessKey: process.env.STORAGE_ACCESS_KEY,
    secretKey: process.env.STORAGE_SECRET_KEY,
    region: process.env.STORAGE_REGION || 'auto',
  },

  whatsapp: {
    metaAppId: process.env.META_APP_ID,
    metaAppSecret: process.env.META_APP_SECRET,
    metaConfigId: process.env.META_CONFIG_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,

    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
  },

  monnify: {
    apiKey: process.env.MONNIFY_API_KEY,
    secretKey: process.env.MONNIFY_SECRET_KEY,
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    baseUrl: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com',
  },

  lenco: {
    apiKey: process.env.LENCO_API_KEY,
    baseUrl: process.env.LENCO_BASE_URL || 'https://api.lenco.co/access/v1',
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'paystack',
    secretKey: process.env.PAYMENT_SECRET_KEY,
    publicKey: process.env.PAYMENT_PUBLIC_KEY,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_SECRET_KEY,
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'BizIQ <no-reply@biziq.online>',
  },

  frontendUrl: process.env.FRONTEND_URL,

  // Checkout configuration for delivery options and payment processing
  checkout: {
    deliveryOptions: [
      {
        id: 'standard',
        name: 'Standard Delivery',
        time: '2-3 business days',
        price: 0,
        description: 'Reliable delivery within business hours',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
      {
        id: 'express',
        name: 'Express Delivery',
        time: '1-2 business days',
        price: 2000,
        description: 'Faster delivery for urgent orders',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
      {
        id: 'same-day',
        name: 'Same Day Delivery',
        time: 'Within 8 hours',
        price: 4000,
        description: 'Delivery within 8 hours (if available)',
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        rushOrder: true,
      },
    ],
    taxRate: 0.075,
    freeShippingThreshold: 10000,
  },

  // Payment providers configuration
  paymentProviders: {
    paystack: {
      name: 'Paystack',
      apiKey: process.env.PAYSTACK_SECRET_KEY || 'pk_test_abc123',
      publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_xyz789',
      baseUrl: 'https://api.paystack.co',
      callbackUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/payments/callback`,
    },
    monnify: {
      name: 'Monnify',
      apiKey: process.env.MONNIFY_API_KEY,
      secretKey: process.env.MONNIFY_SECRET_KEY,
      contractCode: process.env.MONNIFY_CONTRACT_CODE,
      baseUrl: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com',
      callbackUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard/payments/callback`,
    },
    payphill: {
      name: 'Payphill',
      apiKey: process.env.PAYPHILL_API_KEY,
      baseUrl: 'https://api.payphill.co',
    },
    flutterwave: {
      name: 'Flutterwave',
      apiKey: process.env.FLUTTERWAVE_SECRET_KEY,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
      baseUrl: 'https://api.flutterwave.co/v3',
    },
  },

  // Delivery and fulfillment configuration
  delivery: {
    availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    businessHours: {
      start: '09:00',
      end: '18:00',
    },
    timeSlots: [
      { id: 'morning', label: 'Morning (9:00 - 12:00)', start: '09:00', end: '12:00' },
      { id: 'afternoon', label: 'Afternoon (12:00 - 17:00)', start: '12:00', end: '17:00' },
      { id: 'evening', label: 'Evening (17:00 - 20:00)', start: '17:00', end: '20:00' },
    ],
    deliveryRegions: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Enugu', 'Kaduna'],
    weightCategories: [
      { id: 'light', name: 'Light (under 2kg)', maxWeight: 2 },
      { id: 'medium', name: 'Medium (2-5kg)', maxWeight: 5 },
      { id: 'heavy', name: 'Heavy (5-10kg)', maxWeight: 10 },
      { id: 'oversize', name: 'Oversize (10kg+)', maxWeight: 50 },
    ],
  },

  // Webhook configuration
  webhooks: {
    payment: {
      paystack: process.env.PAYSTACK_WEBHOOK_SECRET || '',
      monnify: process.env.MONNIFY_WEBHOOK_SECRET || '',
    },
    delivery: {
      endpoint: `${process.env.APP_URL || 'http://localhost:4000'}/api/v1/webhooks/delivery`,
    },
  },

  // Third-party service integrations
  thirdParty: {
    monnify: {
      enabled: !!process.env.MONNIFY_API_KEY,
      apiKey: process.env.MONNIFY_API_KEY,
      secretKey: process.env.MONNIFY_SECRET_KEY,
    },
    lenco: {
      enabled: !!process.env.LENCO_API_KEY,
      apiKey: process.env.LENCO_API_KEY,
    },
    payphone: {
      enabled: !!process.env.PAYPHONE_API_KEY,
      apiKey: process.env.PAYPHONE_API_KEY,
    },
    flutterwave: {
      enabled: !!process.env.FLUTTERWAVE_PUBLIC_KEY,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
    },
  },

  superAdmin: {
    email:    process.env.SUPERADMIN_EMAIL,
    password: process.env.SUPERADMIN_PASSWORD,
  },
};

export default config;
