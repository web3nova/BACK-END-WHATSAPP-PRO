import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
        url: `${config.appUrl}${config.apiPrefix}`,
        description: 'Current server',
      },
      {
        url: `https://back-end-whatsapp-pro.onrender.com${config.apiPrefix}`,
        description: 'Production server (Render)',
      },
      {
        url: `http://localhost:4000${config.apiPrefix}`,
        description: 'Local development server',
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
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    join(__dirname, '../modules/auth/auth.routes.js'),
    join(__dirname, '../modules/users/user.routes.js'),
    join(__dirname, '../modules/rbac/rbac.routes.js'),
    join(__dirname, '../modules/tenants/tenant.routes.js'),
    join(__dirname, '../modules/billing/billing.routes.js'),
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
  ],
};

export const swaggerSpec = swaggerJsdoc(options);