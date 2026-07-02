import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BUSINESS_CATEGORIES } from '../common/constants/businessProfile.js';
import { DELIVERY_STRUCTURES, DAYS } from '../modules/business/business.validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Shared field definitions for the Business resource, kept in one place so
// create/update/response schemas can't drift out of sync with each other or
// with the actual zod validation (businessShape in business.validation.js).
const businessWritableProperties = {
  displayName: { type: 'string', example: "Ada's Fashion House" },
  category: { type: 'string', enum: BUSINESS_CATEGORIES },
  categoryOther: { type: 'string', description: 'Required when category is "others"' },
  tagline: { type: 'string' },
  description: { type: 'string' },
  email: { type: 'string', format: 'email' },
  phone: { type: 'string', example: '+2348012345678' },
  location: { type: 'string', example: 'Ikeja, Lagos' },
  whatsappNumber: { type: 'string' },
  logoUrl: { type: 'string', format: 'uri' },
  settings: { type: 'object' },
  cacNumber: { type: 'string', example: 'RC 1124322' },
  tin: { type: 'string', example: '1234567-0001' },
  activeClients: { type: 'integer', minimum: 0, example: 244 },
  staffCount: { type: 'integer', minimum: 0, example: 22 },
  monthlyRevenue: { type: 'integer', minimum: 0, description: 'Amount in Naira', example: 2524555 },
  deliveryStructure: { type: 'string', enum: DELIVERY_STRUCTURES },
  instagram: { type: 'string', example: '@yourbusiness' },
  twitter: { type: 'string', example: '@yourbusiness' },
  facebook: { type: 'string', example: 'facebook.com/yourbusiness' },
  tiktok: { type: 'string', example: '@yourbusiness' },
  availableDays: { type: 'array', items: { type: 'string', enum: DAYS } },
  openingTime: { type: 'string', example: '08:00', description: 'HH:MM, 24-hour' },
  closingTime: { type: 'string', example: '18:00', description: 'HH:MM, 24-hour' },
};

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BACK-END-WHATSAPP-PRO API',
      version: '1.0.0',
      description: 'AI-powered multi-tenant B2B commerce platform API',
    },
    servers: [
      {
        url: `http://localhost:4000${config.apiPrefix}`,
        description: 'Local',
      },
      {
        url: `https://back-end-whatsapp-pro.onrender.com${config.apiPrefix}`,
        description: 'Production (Render)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Business: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            tenantId: { type: 'string', format: 'uuid', readOnly: true },
            logoStorageKey: { type: 'string', readOnly: true, nullable: true },
            ...businessWritableProperties,
          },
        },
        BusinessCreateInput: {
          type: 'object',
          required: ['displayName', 'phone', 'location'],
          properties: businessWritableProperties,
        },
        BusinessUpdateInput: {
          type: 'object',
          properties: businessWritableProperties,
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    join(__dirname, '../modules/auth/auth.routes.js'),
    join(__dirname, '../modules/users/user.routes.js'),
    join(__dirname, '../modules/rbac/rbac.routes.js'),
    join(__dirname, '../modules/tenants/tenant.routes.js'),
    join(__dirname, '../modules/billing/billing.routes.js'),
    join(__dirname, '../modules/billing/billing.public.routes.js'),
    join(__dirname, '../modules/superadmin/admin.routes.js'),
    join(__dirname, '../modules/ai/ai.routes.js'),
    join(__dirname, '../modules/knowledge/knowledge.routes.js'),
    join(__dirname, '../modules/business/business.routes.js'),
    join(__dirname, '../modules/products/product.routes.js'),
    join(__dirname, '../modules/inventory/inventory.routes.js'),
    join(__dirname, '../modules/catalog/catalog.routes.js'),
    join(__dirname, '../modules/website/website.routes.js'),
    join(__dirname, '../modules/whatsapp/whatsapp.routes.js'),
    join(__dirname, '../modules/conversations/conversation.routes.js'),
    join(__dirname, '../modules/customers/customer.routes.js'),
    join(__dirname, '../modules/orders/order.routes.js'),
    join(__dirname, '../modules/quotes/quote.routes.js'),
    join(__dirname, '../modules/payments/payment.routes.js'),
    join(__dirname, '../modules/notifications/notification.routes.js'),
    join(__dirname, '../modules/onboarding/onboarding.routes.js'),
  ],
};

export const swaggerSpec = swaggerJsdoc(options);