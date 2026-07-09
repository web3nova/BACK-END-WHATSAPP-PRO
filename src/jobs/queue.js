import { boss } from '../config/pgboss.js';

const JOB_DEFAULTS = { retryLimit: 3, retryDelay: 5, retryBackoff: true };

// Thin wrappers that match the BullMQ queue.add() call shape used by the rest of the app.
// pg-boss job IDs (singletonKey) prevent duplicate jobs for the same message.
export const mainQueue = {
  async add(name, data, opts = {}) {
    const pgOpts = { ...JOB_DEFAULTS };
    if (opts.jobId) pgOpts.singletonKey = opts.jobId;
    if (opts.attempts) pgOpts.retryLimit = opts.attempts;
    if (opts.backoff?.delay) pgOpts.retryDelay = Math.floor(opts.backoff.delay / 1000);
    await boss.send(name, data, pgOpts);
  },
};

export default mainQueue;
