// src/config/swagger.js
// Swagger / OpenAPI config — served at {API_PREFIX}/docs
// Picks up JSDoc @openapi blocks from each module's *.routes.js
import swaggerJSDoc from 'swagger-jsdoc';
import { config } from './index.js';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Agentic Sales API',
    version: '0.1.0',
    description: 'Multi-tenant B2B commerce platform — WhatsApp AI agent + website builder',
  },
  servers: [
    {
      url: config.apiPrefix,
      description: 'Current host',
    },
    {
      url: `${config.appUrl}${config.apiPrefix}`,
      description: 'Configured app URL',
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
};

const options = {
  swaggerDefinition,
  // Scans every routes.js file in every module for @openapi JSDoc comments
  apis: ['./src/modules/**/*.routes.js'],
};

export const swaggerSpec = swaggerJSDoc(options);

const operationMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

for (const pathItem of Object.values(swaggerSpec.paths || {})) {
  for (const method of operationMethods) {
    const operation = pathItem[method];
    if (!operation || operation.responses) continue;

    operation.responses = {
      200: {
        description: 'Successful response',
      },
      400: {
        description: 'Invalid request',
      },
      401: {
        description: 'Missing or invalid authorization',
      },
      500: {
        description: 'Server error',
      },
    };
  }
}

export default swaggerSpec;
