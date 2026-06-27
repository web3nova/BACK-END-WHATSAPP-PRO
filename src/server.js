import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './config/logger.js';
import './jobs/billing.cron.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`API listening on http://localhost:${config.port}${config.apiPrefix}`);
});

const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
