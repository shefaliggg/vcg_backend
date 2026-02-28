const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { requireAuth } = require('../middlewares/auth.middleware');

// 🔔 Get my notifications
router.get('/me', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put("/mark-read", requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );

    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/unread-count", requireAuth, async (req, res) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    isRead: false
  });

  res.json({ count });
});

module.exports = router;