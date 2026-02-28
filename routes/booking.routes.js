const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  getMyBookings,
  getAllBookings,
  getAvailableBookings,
  createBooking,
  submitQuote,
  selectQuote,
  userSignRateConfirmation,
  driverAcceptRateConfirmation,
  getBookingById,
  debugBooking,
  getDriverConfirmations,
  getBookingRaw
} = require('../controllers/booking.controller');
// Debug: get raw MongoDB document for a booking
router.get('/:id/raw', getBookingRaw);
// GET /api/bookings/for-driver - bookings for the logged-in driver where user has signed
router.get('/for-driver', requireAuth, getDriverConfirmations);

// GET /api/bookings/debug/:id - debug endpoint
router.get('/debug/:id', debugBooking);

// GET /api/bookings/my - user's bookings
router.get('/my', requireAuth, getMyBookings);

// GET /api/bookings/available - available for drivers
router.get('/available', requireAuth, getAvailableBookings);

// GET /api/bookings - all bookings (admin only)
router.get('/', requireAuth, requireRole('admin'), getAllBookings);

// GET /api/bookings/:id - get single booking
router.get('/:id', requireAuth, getBookingById);

// POST /api/bookings - create booking
router.post('/', requireAuth, createBooking);

// POST /api/bookings/:id/quote - submit quote (driver or admin)
router.post('/:id/quote', requireAuth, (req, res, next) => {
  console.log(`\n[ROUTE] POST /bookings/:id/quote received`);
  console.log(`[ROUTE] Booking ID: ${req.params.id}`);
  console.log(`[ROUTE] Body:`, req.body);
  next();
}, submitQuote);

// POST /api/bookings/:id/select-quote - user selects quote
router.post('/:id/select-quote', requireAuth, selectQuote);

// POST /api/bookings/:id/rate-confirmation/user-sign - user signs
router.post('/:id/rate-confirmation/user-sign', requireAuth, userSignRateConfirmation);

// POST /api/bookings/:id/rate-confirmation/driver-accept - driver accepts
router.post('/:id/rate-confirmation/driver-accept', requireAuth, driverAcceptRateConfirmation);

module.exports = router;