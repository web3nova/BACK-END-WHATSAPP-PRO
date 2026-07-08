// src/jobs/billing.cron.js
// Run this file with node-cron or a scheduler like Render Cron Jobs.
// It checks daily for trial reminders and upcoming renewals.

import cron from 'node-cron';
import { logger } from '../config/logger.js';
import { sendTrialReminders, sendMonthlyBillingReminders } from '../modules/billing/billing.service.js';
import { sendWeeklyReports } from '../modules/notifications/notification.service.js';

// Runs every day at 8:00 AM
cron.schedule('0 8 * * *', async () => {
  logger.info('[cron] running trial reminder check');
  try {
    const result = await sendTrialReminders();
    logger.info({ day3: result.day3, day5: result.day5 }, '[cron] trial reminders sent');
  } catch (err) {
    logger.error({ err: err.message }, '[cron] trial reminder error');
  }
});

// Runs every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  logger.info('[cron] running monthly billing reminder check');
  try {
    const result = await sendMonthlyBillingReminders();
    logger.info({ sent: result.sent }, '[cron] monthly billing reminders sent');
  } catch (err) {
    logger.error({ err: err.message }, '[cron] monthly billing reminder error');
  }
});

// Every Monday at 8:00 AM — weekly performance report
cron.schedule('0 8 * * 1', async () => {
  logger.info('[cron] sending weekly reports');
  try {
    const result = await sendWeeklyReports();
    logger.info({ sent: result.sent }, '[cron] weekly reports sent');
  } catch (err) {
    logger.error({ err: err.message }, '[cron] weekly report error');
  }
});

logger.info('[cron] billing + notification cron jobs scheduled');