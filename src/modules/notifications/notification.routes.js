import { Router } from 'express';
import { sendNotification, listNotifications, markAllNotificationsRead, markOneNotificationRead } from './notification.controller.js';

const router = Router();

router.post('/send', sendNotification);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markOneNotificationRead);

export default router;
