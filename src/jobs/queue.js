import { boss } from '../config/pgboss.js';

const JOB_DEFAULTS = { retryLimit: 3, retryDelay: 5, retryBackoff: true };

export const mainQueue = {
  async add(name, data, opts = {}) {
    const pgOpts = { ...JOB_DEFAULTS };
    if (opts.jobId) pgOpts.singletonKey = opts.jobId;
    if (opts.attempts) pgOpts.retryLimit = opts.attempts;
    if (opts.backoff?.delay) pgOpts.retryDelay = Math.floor(opts.backoff.delay / 1000);
    // Delayed jobs: startAfter in seconds (pg-boss) or ms (passed as startAfterMs)
    if (opts.startAfterMs) pgOpts.startAfter = Math.ceil(opts.startAfterMs / 1000);
    await boss.send(name, data, pgOpts);
  },
};

export default mainQueue;
