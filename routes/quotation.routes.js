const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const {
  getQuotationsForBooking,
  submitQuotation,
  selectQuotation
} = require('../controllers/quotation.controller');
const router = express.Router();

// GET /api/quotations/for-booking/:bookingId
router.get('/for-booking/:bookingId', requireAuth, getQuotationsForBooking);

// POST /api/quotations/:bookingId
router.post('/:bookingId', requireAuth, submitQuotation);

// POST /api/quotations/:id/select
router.post('/:id/select', requireAuth, selectQuotation);

module.exports = router;
