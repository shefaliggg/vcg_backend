const Quotation = require('../models/Quotation');
const Booking = require('../models/Booking');
const Driver = require('../models/Driver');

// GET /api/quotations/for-booking/:bookingId - get all quotations for a booking
const getQuotationsForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const quotations = await Quotation.find({ bookingId }).populate('driverId', 'firstName lastName phone');
    return res.json({ quotations });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch quotations', error: err.message });
  }
};

// POST /api/quotations/:bookingId - submit a quotation for a booking
const submitQuotation = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { price, notes } = req.body;
    const driverId = req.user._id;
    if (!price || price <= 0) {
      return res.status(400).json({ message: 'Invalid price' });
    }
    // Check if booking is open for quotes
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.status !== 'OPEN_FOR_QUOTES') {
      return res.status(400).json({ message: 'Booking not open for quotations' });
    }
    // Prevent duplicate quotes from same driver
    const existing = await Quotation.findOne({ bookingId, driverId });
    if (existing) {
      return res.status(400).json({ message: 'You have already quoted for this booking' });
    }
    const quotation = new Quotation({ bookingId, driverId, price, notes, selected: false, createdAt: new Date() });
    await quotation.save();
    return res.status(201).json({ message: 'Quotation submitted', quotation });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to submit quotation', error: err.message });
  }
};

// POST /api/quotations/:id/select - select a quotation (user)
const selectQuotation = async (req, res) => {
  try {
    const { id } = req.params;
    const quotation = await Quotation.findById(id);
    if (!quotation) {
      return res.status(404).json({ message: 'Quotation not found' });
    }
    quotation.selected = true;
    await quotation.save();
    // Update booking status
    await Booking.findByIdAndUpdate(quotation.bookingId, { status: 'CONFIRMED' });
    return res.json({ message: 'Quotation selected', quotation });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to select quotation', error: err.message });
  }
};

module.exports = {
  getQuotationsForBooking,
  submitQuotation,
  selectQuotation
};
