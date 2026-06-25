import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

// The main queue for all background jobs (e.g. aiReply, sendNotification)
export const mainQueue = new Queue('main', { connection: redis });

export default mainQueue;
