import { Queue } from 'bullmq';
import { redisForQueue } from '../config/redis.js';

// Queue uses a separate connection with maxRetriesPerRequest: 1 so queue.add()
// fails fast when Redis is unavailable (BullMQ docs recommendation).
// checkCompatibility: false — Upstash doesn't return a standard Redis version string.
export const mainQueue = new Queue('main', { connection: redisForQueue, checkCompatibility: false });

export default mainQueue;
