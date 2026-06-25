import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';

// The main queue for all background jobs (e.g. aiReply, sendNotification)
// checkCompatibility: false — Upstash doesn't return a standard Redis version string;
// this prevents BullMQ from printing "Unable to check client-server compatibility" on every start.
export const mainQueue = new Queue('main', { connection: redis, checkCompatibility: false });

export default mainQueue;
