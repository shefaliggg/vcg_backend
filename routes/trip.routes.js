const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  getAssignedTrips,
  acceptTrip,
  rejectTrip,
  updateTripStatus,
  getTrackingInfo,
  getTripByBooking,
  getAllTrips
} = require('../controllers/trip.controller');

// Driver routes
router.get('/driver/assigned', requireAuth, requireRole('driver'), getAssignedTrips);
router.post('/:tripId/accept', requireAuth, requireRole('driver'), acceptTrip);
router.post('/:tripId/reject', requireAuth, requireRole('driver'), rejectTrip);
router.put('/:tripId/status', requireAuth, requireRole('driver'), updateTripStatus);

// Tracking routes (user and admin)
router.get('/:tripId/track', requireAuth, getTrackingInfo);
router.get('/booking/:bookingId', requireAuth, getTripByBooking);

// Admin routes
router.get('/', requireAuth, requireRole('admin'), getAllTrips);

module.exports = router;
