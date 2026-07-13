import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { notFoundMiddleware } from './middleware/notFound.middleware.js';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import * as websiteController from './modules/website/website.controller.js';

export function createApp() {
  const app = express();

  // Trust the first proxy (Render's load balancer) so req.ip is the real client IP
  app.set('trust proxy', 1);

  app.use(helmet({
  contentSecurityPolicy: false,
}));
  const ALLOWED_ORIGINS = [
    config.frontendUrl,
    'http://localhost:4000',
    'http://localhost:5173',
    'http://localhost:5174', // biziq-admin dev server
    'https://back-end-whatsapp-pro.onrender.com',
    'https://biziq-admin.vercel.app',
    'https://admin.biziq.online',
  ].filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      // No Origin header (server-to-server, curl, webhooks) — allow.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      // Vercel preview deployments for our own projects, e.g.
      // biziq-admin-git-feature-x-teamname.vercel.app
      if (/^https:\/\/biziq-admin(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)) return callback(null, true);
      if (/^https:\/\/front-end-whatsapp-pro(-[a-z0-9-]+)?\.vercel\.app$/.test(origin)) return callback(null, true);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({
    limit: '5mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true }));
  if (config.env !== 'test') {
    // Redact ?token= from logged URLs so JWTs never appear in logs
    morgan.token('safe-url', (req) => {
      const url = req.originalUrl || req.url;
      return url.replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]');
    });
    app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
  }

  // Serve locally stored files (media) at /storage
  app.use('/storage', express.static(path.join(process.cwd(), 'storage')));

  // Public, unauthenticated website-image redirect. Registered at the app
  // root (not under config.apiPrefix) so the served path is exactly
  // `/assets/website-images/...` — matching websiteService.publicAssetUrl(),
  // which builds `${config.appUrl}/assets/<storageKey>` and is what gets
  // stored permanently in builder JSON (gallery, hero, About, page images).
  app.get(/^\/assets\/website-images\/(.+)$/, websiteController.getPublicAsset);

  // Swagger UI
  app.use(
  `${config.apiPrefix}/docs`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  }),
);

  // Mount the API gateway under the configured prefix.
  app.use(config.apiPrefix, routes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export default createApp;