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
import { getAssetUrl } from './common/utils/uploadAsset.js';
import { BadRequestError } from './common/errors/index.js';
import { asyncHandler } from './common/utils/asyncHandler.js';
import { isAllowedOrigin } from './common/utils/allowedOrigins.js';

export function createApp() {
  const app = express();

  // Trust the first proxy (Render's load balancer) so req.ip is the real client IP
  app.set('trust proxy', 1);

  app.use(helmet({
  contentSecurityPolicy: false,
}));
  app.use(cors({
    origin(origin, callback) {
      // No Origin header (server-to-server, curl, webhooks) — allow.
      if (!origin) return callback(null, true);
      isAllowedOrigin(origin)
        .then((ok) => callback(ok ? null : new Error(`Not allowed by CORS: ${origin}`), ok))
        .catch(() => callback(new Error(`Not allowed by CORS: ${origin}`)));
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

  // Public, unauthenticated asset redirects. Registered at the app root (not
  // under config.apiPrefix). Website images use websiteService.publicAssetUrl()
  // which builds `${config.appUrl}/assets/<storageKey>`. Product images now
  // use the same pattern: the frontend proxies `/assets/product-images/*` to
  // this endpoint, which redirects to a fresh short-lived signed URL.
  app.get('/assets/website-images/:path(*)', websiteController.getPublicAsset);
  app.get('/assets/product-images/:path(*)', asyncHandler(async (req, res) => {
    const path = req.params.path || '';
    if (!path || path.includes('..')) {
      throw new BadRequestError('Invalid asset key.');
    }
    const url = await getAssetUrl(path);
    res.set('Cache-Control', 'public, max-age=1800');
    return res.redirect(302, url);
  }));

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