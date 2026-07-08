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

export function createApp() {
  const app = express();

  // Trust the first proxy (Render's load balancer) so req.ip is the real client IP
  app.set('trust proxy', 1);

  app.use(helmet({
  contentSecurityPolicy: false,
}));
  app.use(cors({
  origin: [
    config.frontendUrl,
    'http://localhost:4000',
    'http://localhost:5173',
    'https://back-end-whatsapp-pro.onrender.com',
  ],
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
  if (config.env !== 'test') app.use(morgan('dev'));

  // Serve locally stored files (media) at /storage
  app.use('/storage', express.static(path.join(process.cwd(), 'storage')));

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