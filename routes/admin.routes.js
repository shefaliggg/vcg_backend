const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { 
  getPendingDrivers, 
  getApprovedDrivers, 
  getRejectedDrivers, 
  approveDriver, 
  rejectDriver,
  assignDriverToBooking
} = require('../controllers/admin.controller');
const { getAllBookings } = require('../controllers/booking.controller');

router.get('/drivers/pending', requireAuth, requireRole('admin'), getPendingDrivers);
router.get('/drivers/approved', requireAuth, requireRole('admin'), getApprovedDrivers);
router.get('/drivers/rejected', requireAuth, requireRole('admin'), getRejectedDrivers);
router.put('/drivers/:id/approve', requireAuth, requireRole('admin'), approveDriver);
router.put('/drivers/:id/reject', requireAuth, requireRole('admin'), rejectDriver);

// Get all bookings (admin only)
router.get('/bookings', requireAuth, requireRole('admin'), getAllBookings);


module.exports = router;
