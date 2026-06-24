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

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
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

  // Mount the API gateway under the configured prefix.
  app.use(config.apiPrefix, routes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export default createApp;
