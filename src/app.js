import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { notFoundMiddleware } from './middleware/notFound.middleware.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (config.env !== 'test') app.use(morgan('dev'));

  // Mount the API gateway under the configured prefix.
  app.use(config.apiPrefix, routes);
  app.use(`${config.apiPrefix}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export default createApp;
