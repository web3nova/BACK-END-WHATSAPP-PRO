import { Router } from 'express';
import { sendNotification, listNotifications, markAllNotificationsRead, markOneNotificationRead, getPreferences, patchPreferences } from './notification.controller.js';

const router = Router();

router.post('/send', sendNotification);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.get('/preferences', getPreferences);
router.patch('/preferences', patchPreferences);
router.patch('/:id/read', markOneNotificationRead);

export default router;
