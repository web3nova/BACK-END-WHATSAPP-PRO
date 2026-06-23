import pino from 'pino';
import { config } from './index.js';

export const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport:
    config.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export default logger;
