import dotenv from 'dotenv';

dotenv.config();

const required = [
  // Core
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',

  // Redis / BullMQ (Upstash)
  'REDIS_URL',

  // Vector DB (Qdrant Cloud)
  'QDRANT_URL',
  'QDRANT_API_KEY',

  // AI — chat provider (Anthropic) + embeddings (OpenAI)
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',

  // WhatsApp Cloud API
  'META_APP_ID',
  'META_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',

  // Payment gateway (Paystack)
  'PAYMENT_SECRET_KEY',

  // Monnify (subscription billing)
  'MONNIFY_API_KEY',
  'MONNIFY_SECRET_KEY',
  'MONNIFY_CONTRACT_CODE',

  // Email (Nodemailer)
  'EMAIL_USER',
  'EMAIL_PASSWORD',

  // Object storage (S3-compatible)
  'STORAGE_ENDPOINT',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[config] Missing required env var: ${key}. Set it in .env or your deployment environment.`);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  appUrl: process.env.APP_URL || 'http://localhost:4000',

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '10m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,

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
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
  },

  monnify: {
    apiKey: process.env.MONNIFY_API_KEY,
    secretKey: process.env.MONNIFY_SECRET_KEY,
    contractCode: process.env.MONNIFY_CONTRACT_CODE,
    baseUrl: process.env.MONNIFY_BASE_URL || 'https://api.monnify.com',
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'paystack',
    secretKey: process.env.PAYMENT_SECRET_KEY,
    publicKey: process.env.PAYMENT_PUBLIC_KEY,
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_SECRET_KEY,
  },

  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'no-reply@whatsapppro.com',
  },

  frontendUrl: process.env.FRONTEND_URL,

  superAdmin: {
    email:    process.env.SUPERADMIN_EMAIL,
    password: process.env.SUPERADMIN_PASSWORD,
  },
};

export default config;
