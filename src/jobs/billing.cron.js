// src/jobs/billing.cron.js
// Run this file with node-cron or a scheduler like Render Cron Jobs.
// It checks daily for trial reminders and upcoming renewals.

import cron from 'node-cron';
import { sendTrialReminders, sendMonthlyBillingReminders } from '../modules/billing/billing.service.js';

// Runs every day at 8:00 AM
cron.schedule('0 8 * * *', async () => {
  console.log('[cron] Running trial reminder check...');
  try {
    const result = await sendTrialReminders();
    console.log(`[cron] Trial reminders sent — day3: ${result.day3}, day5: ${result.day5}`);
  } catch (err) {
    console.error('[cron] Trial reminder error:', err.message);
  }
});

// Runs every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('[cron] Running monthly billing reminder check...');
  try {
    const result = await sendMonthlyBillingReminders();
    console.log(`[cron] Monthly billing reminders sent: ${result.sent}`);
  } catch (err) {
    console.error('[cron] Monthly billing reminder error:', err.message);
  }
});

console.log('[cron] Billing cron jobs scheduled.');