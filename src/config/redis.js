import IORedis from 'ioredis';
import { config } from './index.js';

// maxRetriesPerRequest must be null for BullMQ connections.
export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

export default redis;
