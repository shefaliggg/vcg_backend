const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const { resolveStage, loadNumber, fullName } = require('./dashboard.controller');

// Loads-page tabs. Several dashboard stages fold into one tab so the admin gets a small,
// workflow-shaped set: Posted -> Bidding -> Assigned -> In Transit -> Delivered.
const TAB_BY_STAGE = {
  posted: 'posted',
  awaiting_driver: 'bidding',
  assigned: 'assigned',
  at_pickup: 'assigned',
  in_transit: 'in_transit',
  at_delivery: 'in_transit',
  delivered: 'delivered',
};

const groupTrips = (trips) => {
  const byBooking = new Map();
  trips.forEach((trip) => {
    const key = String(trip.bookingId);
    if (!byBooking.has(key)) byBooking.set(key, []);
    byBooking.get(key).push(trip);
  });
  return byBooking;
};

// GET /admin/loads - every non-draft load with stage, tab and quote summary.
const getAllLoads = async (req, res) => {
  try {
    const bookings = await Booking.find({ isDraft: { $ne: true } })
      .populate('userId', 'firstName lastName email phone companyProfile.companyName')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .sort({ createdAt: -1 })
      .lean();

    const trips = await Trip.find({ bookingId: { $in: bookings.map((b) => b._id) } }).sort({ createdAt: -1 }).lean();
    const tripsByBooking = groupTrips(trips);

    const tabCounts = { all: bookings.length, posted: 0, bidding: 0, assigned: 0, in_transit: 0, delivered: 0 };

    const loads = bookings.map((booking) => {
      const { trip, stage } = resolveStage(booking, tripsByBooking.get(String(booking._id)) || []);
      const tab = TAB_BY_STAGE[stage];
      tabCounts[tab] += 1;

      const quotes = booking.quotations || [];
      const prices = quotes.map((q) => q.price).filter((p) => typeof p === 'number');
      const latestQuoteAt = quotes.reduce((latest, q) => (q.createdAt && (!latest || q.createdAt > latest) ? q.createdAt : latest), null);

      return {
        id: booking._id,
        tripId: trip?._id || null,
        loadNumber: loadNumber(booking),
        shipper: booking.userId?.companyProfile?.companyName || fullName(booking.userId) || 'Unknown',
        pickup: booking.pickupLocation?.address || null,
        delivery: booking.deliveryLocation?.address || null,
        pickupDate: booking.pickupDate || null,
        truckType: booking.truckType || null,
        driver: fullName(booking.driverId?.userId),
        quoteCount: quotes.length,
        lowestQuote: prices.length ? Math.min(...prices) : null,
        latestQuoteAt,
        stage,
        tab,
        createdAt: booking.createdAt,
      };
    });

    return res.json({ loads, tabCounts });
  } catch (err) {
    console.error('[getAllLoads] Error:', err);
    return res.status(500).json({ message: 'Failed to fetch loads' });
  }
};

// GET /admin/loads/:id - full detail for the admin, including every quote with carrier info.
const getLoadById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('userId', 'firstName lastName email phone companyProfile')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName email phone' } })
      .populate({
        path: 'quotations.driverId',
        populate: [
          { path: 'userId', model: 'User', select: 'firstName lastName email phone' },
          { path: 'truckId', model: 'Truck', select: 'truckType make model year plateNumber registrationNumber' },
        ],
      })
      .populate('truckId', 'registrationNumber truckType capacity');

    if (!booking) return res.status(404).json({ message: 'Load not found' });

    const trips = await Trip.find({ bookingId: booking._id }).sort({ createdAt: -1 }).lean();
    const { trip, stage } = resolveStage(booking.toObject(), trips);

    return res.json({
      ...booking.toObject(),
      loadNumber: loadNumber(booking),
      stage,
      tab: TAB_BY_STAGE[stage],
      tripId: trip?._id || null,
      tripStatus: trip?.status || null,
      // Quotes can only be picked (by the admin or the shipper) while no driver is attached.
      canSelectQuote: !booking.driverId && !booking.isDraft,
    });
  } catch (err) {
    console.error('[getLoadById] Error:', err);
    return res.status(500).json({ message: 'Failed to fetch load' });
  }
};

module.exports = { getAllLoads, getLoadById };
