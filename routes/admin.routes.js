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
  assignDriverToBooking,
  getAllShippers,
  getDashboardStats,
  getAllTrucks,
  getTruckById,
  createDriverByAdmin,
  createShipperByAdmin,
  createTruckByAdmin
} = require('../controllers/admin.controller');

// Get all users with role=user (shippers)
router.get('/users', requireAuth, requireRole('admin'), getAllShippers);
const { getAllBookings } = require('../controllers/booking.controller');
router.get('/dashboard',getDashboardStats)
router.get('/drivers/pending', requireAuth, requireRole('admin'), getPendingDrivers);
router.get('/drivers/approved', requireAuth, requireRole('admin'), getApprovedDrivers);
router.get('/drivers/rejected', requireAuth, requireRole('admin'), getRejectedDrivers);
router.get('/trucks', requireAuth, requireRole('admin'), getAllTrucks);
router.get('/trucks/:id', requireAuth, requireRole('admin'), getTruckById);
router.post('/trucks', requireAuth, requireRole('admin'), createTruckByAdmin);
router.post('/drivers', requireAuth, requireRole('admin'), createDriverByAdmin);
router.post('/users', requireAuth, requireRole('admin'), createShipperByAdmin);
router.put('/drivers/:id/approve', requireAuth, requireRole('admin'), approveDriver);
router.put('/drivers/:id/reject', requireAuth, requireRole('admin'), rejectDriver);

// Get all bookings (admin only)
router.get('/bookings', requireAuth, requireRole('admin'), getAllBookings);


module.exports = router;
