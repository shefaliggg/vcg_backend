const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { getBookingMessages, getConversations, getUnreadCount } = require('../controllers/message.controller');

router.get('/conversations', requireAuth, getConversations);
router.get('/unread-count', requireAuth, getUnreadCount);
router.get('/booking/:bookingId', requireAuth, requireRole('admin'), getBookingMessages);

module.exports = router;
