const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  getPendingDrivers,
  getIncompleteDrivers,
  getApprovedDrivers,
  getRejectedDrivers,
  approveDriver, 
  rejectDriver,
  assignDriverToBooking,
  getAllShippers,
  getIncompleteShippers,
  getPendingShippers,
  getApprovedShippers,
  getRejectedShippers,
  getShipperById,
  approveShipper,
  rejectShipper,
  getDashboardStats,
  getAllTrucks,
  getTruckById,
  createDriverByAdmin,
  inviteDriver,
  createShipperByAdmin,
  inviteShipper,
  createTruckByAdmin
} = require('../controllers/admin.controller');

const { getAllBookings, approveBooking, rejectBooking } = require('../controllers/booking.controller');

// Get all users with role=user (shippers)
router.get('/users', requireAuth, requireRole('admin'), getAllShippers);
const { getDashboardOverview, assignDriverToBooking: assignDriver } = require('../controllers/dashboard.controller');
const { getAllLoads, getLoadById } = require('../controllers/loads.controller');
router.get('/dashboard/overview', requireAuth, requireRole('admin'), getDashboardOverview);
router.get('/loads', requireAuth, requireRole('admin'), getAllLoads);
router.get('/loads/:id', requireAuth, requireRole('admin'), getLoadById);
router.post('/bookings/:id/assign', requireAuth, requireRole('admin'), assignDriver);
router.get('/dashboard',getDashboardStats)
router.get('/drivers/pending', requireAuth, requireRole('admin'), getPendingDrivers);
router.get('/drivers/incomplete', requireAuth, requireRole('admin'), getIncompleteDrivers);
router.get('/drivers/approved', requireAuth, requireRole('admin'), getApprovedDrivers);
router.get('/drivers/rejected', requireAuth, requireRole('admin'), getRejectedDrivers);
router.get('/trucks', requireAuth, requireRole('admin'), getAllTrucks);
router.get('/trucks/:id', requireAuth, requireRole('admin'), getTruckById);
router.post('/trucks', requireAuth, requireRole('admin'), createTruckByAdmin);
router.post('/drivers', requireAuth, requireRole('admin'), createDriverByAdmin);
router.post('/drivers/invite', requireAuth, requireRole('admin'), inviteDriver);
router.post('/users', requireAuth, requireRole('admin'), createShipperByAdmin);
router.post('/users/invite', requireAuth, requireRole('admin'), inviteShipper);
router.put('/drivers/:id/approve', requireAuth, requireRole('admin'), approveDriver);
router.put('/drivers/:id/reject', requireAuth, requireRole('admin'), rejectDriver);

// CP Shipper (US) onboarding — mandatory admin review
router.get('/shippers/incomplete', requireAuth, requireRole('admin'), getIncompleteShippers);
router.get('/shippers/pending', requireAuth, requireRole('admin'), getPendingShippers);
router.get('/shippers/approved', requireAuth, requireRole('admin'), getApprovedShippers);
router.get('/shippers/rejected', requireAuth, requireRole('admin'), getRejectedShippers);
router.get('/shippers/:id', requireAuth, requireRole('admin'), getShipperById);
router.put('/shippers/:id/approve', requireAuth, requireRole('admin'), approveShipper);
router.put('/shippers/:id/reject', requireAuth, requireRole('admin'), rejectShipper);

// Get all bookings (admin only)
router.get('/bookings', requireAuth, requireRole('admin'), getAllBookings);
router.put('/bookings/:id/approve', requireAuth, requireRole('admin'), approveBooking);
router.put('/bookings/:id/reject', requireAuth, requireRole('admin'), rejectBooking);

module.exports = router;
