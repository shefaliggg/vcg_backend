const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');
const {
  getMyBookings,
  getAllBookings,
  getAvailableBookings,
  createBooking,
  submitQuote,
  selectQuote,
  approveRateConfirmation,
  userSignRateConfirmation,
  driverAcceptRateConfirmation,
  driverAcknowledgeRateConfirmation,
  addBookingDocument,
  getBookingById,
  debugBooking,
  getDriverConfirmations,
  getBookingRaw,
  approveBooking,
  rejectBooking,
} = require('../controllers/booking.controller');
// Debug: get raw MongoDB document for a booking
router.get('/:id/raw', getBookingRaw);
// GET /api/bookings/for-driver - confirmations awaiting the logged-in driver's acknowledgment
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

// Admin uploads a document directly onto a load.
router.post('/:id/documents', requireAuth, requireRole('admin'), upload.single('bookingDocument'), addBookingDocument);

// Admin approval workflow for posted loads
router.put('/:id/approve', requireAuth, requireRole('admin'), approveBooking);
router.put('/:id/reject', requireAuth, requireRole('admin'), rejectBooking);

// POST /api/bookings/:id/rate-confirmation/user-sign - user signs
router.post('/:id/rate-confirmation/user-sign', requireAuth, userSignRateConfirmation);

// Admin issues the rate confirmation after reviewing the selected quote.
router.post('/:id/rate-confirmation/approve', requireAuth, requireRole('admin'), approveRateConfirmation);

// The selected carrier acknowledges the already-agreed quote.
router.post('/:id/rate-confirmation/acknowledge', requireAuth, driverAcknowledgeRateConfirmation);

// Legacy route retained for older app builds.
router.post('/:id/rate-confirmation/driver-accept', requireAuth, driverAcceptRateConfirmation);

module.exports = router;