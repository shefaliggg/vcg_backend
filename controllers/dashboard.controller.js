const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const Settlement = require('../models/Settlement');
const Issue = require('../models/Issue');

const HOUR = 60 * 60 * 1000;
const PICKUP_SOON_HOURS = 48;

const ON_TRIP_STATUSES = ['accepted', 'going_to_pickup', 'arrived_at_pickup', 'loading', 'loaded', 'in_transit', 'arrived_at_drop'];
const ACTIVE_STAGES = ['assigned', 'at_pickup', 'in_transit', 'at_delivery'];
const NOT_PICKED_UP_STAGES = ['posted', 'awaiting_driver', 'assigned'];

const STAGE_BY_TRIP_STATUS = {
  assigned: 'assigned',
  accepted: 'assigned',
  going_to_pickup: 'assigned',
  arrived_at_pickup: 'at_pickup',
  loading: 'at_pickup',
  loaded: 'at_pickup',
  in_transit: 'in_transit',
  arrived_at_drop: 'at_delivery',
  delivered: 'delivered',
  completed: 'delivered',
  pod_uploaded: 'delivered',
  pod_approved: 'delivered',
  pod_rejected: 'delivered',
};

// Attention flags in priority order (most urgent first).
const FLAG_PRIORITY = ['driver_declined', 'delayed', 'delivery_issue', 'unassigned', 'pickup_soon', 'missing_docs'];
const EXCEPTION_FLAGS = ['driver_declined', 'delayed', 'delivery_issue'];

const fullName = (user) => (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '') || null;

const loadNumber = (booking) => booking.loadNumber || booking.referenceNumber || `#${String(booking._id).slice(-6)}`;
const idOf = (value) => String(value?._id || value);

// Booking.status is written inconsistently (upper and lower case), so the stage is derived
// from the driver assignment and the latest trip instead of trusting booking.status alone.
const deriveStage = (booking, trip, hasQuotes, wasDeclined) => {
  if (['completed', 'DELIVERED'].includes(booking.status)) return 'delivered';
  if (!booking.driverId) return hasQuotes || wasDeclined ? 'awaiting_driver' : 'posted';
  if (!trip) return 'assigned';
  return STAGE_BY_TRIP_STATUS[trip.status] || 'assigned';
};

// Shared by the dashboard and the Loads pages so both derive stage identically.
// bookingTrips: every trip for this booking, newest first.
const resolveStage = (booking, bookingTrips) => {
  const wasDeclined = !booking.driverId && bookingTrips.some((t) => t.status === 'rejected');
  const trip = booking.driverId
    ? bookingTrips.find((t) => t.status !== 'rejected' && idOf(t.driverId) === idOf(booking.driverId))
    : null;
  const stage = deriveStage(booking, trip, (booking.quotations || []).length > 0, wasDeclined);
  return { trip, wasDeclined, stage };
};

const getDashboardOverview = async (req, res) => {
  try {
    const now = new Date();

    const bookings = await Booking.find({ isDraft: { $ne: true } })
      .populate('userId', 'firstName lastName companyProfile.companyName')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .sort({ createdAt: -1 })
      .lean();

    const bookingIds = bookings.map((b) => b._id);
    const trips = await Trip.find({ bookingId: { $in: bookingIds } }).sort({ createdAt: -1 }).lean();

    const tripsByBooking = new Map();
    const bookingIdByTrip = new Map();
    trips.forEach((trip) => {
      const key = String(trip.bookingId);
      if (!tripsByBooking.has(key)) tripsByBooking.set(key, []);
      tripsByBooking.get(key).push(trip);
      bookingIdByTrip.set(String(trip._id), key);
    });

    const openIssues = await Issue.find({ status: { $in: ['open', 'in_review'] } }).lean();
    const issueBookingIds = new Set();
    openIssues.forEach((issue) => {
      const key = issue.tripId && bookingIdByTrip.get(String(issue.tripId));
      if (key) issueBookingIds.add(key);
    });

    const stageCounts = { posted: 0, awaiting_driver: 0, assigned: 0, at_pickup: 0, in_transit: 0, at_delivery: 0, delivered: 0, cancelled: 0 };
    const flagCounts = Object.fromEntries(FLAG_PRIORITY.map((flag) => [flag, 0]));
    const attention = [];
    const activeLoads = [];
    const activeShipperIds = new Set();
    let exceptions = 0;

    bookings.forEach((booking) => {
      const key = String(booking._id);
      const bookingTrips = tripsByBooking.get(key) || [];
      const { trip, wasDeclined, stage } = resolveStage(booking, bookingTrips);
      stageCounts[stage] += 1;

      if (stage !== 'delivered' && booking.userId?._id) activeShipperIds.add(String(booking.userId._id));

      const pickupDate = booking.pickupDate ? new Date(booking.pickupDate) : null;
      const deliveryDate = booking.deliveryDate ? new Date(booking.deliveryDate) : null;
      const notPickedUp = NOT_PICKED_UP_STAGES.includes(stage);

      const delayed = Boolean(
        (pickupDate && pickupDate < now && notPickedUp) ||
        (deliveryDate && deliveryDate < now && stage !== 'delivered')
      );

      const flags = [];
      if (wasDeclined) flags.push('driver_declined');
      if (delayed) flags.push('delayed');
      if (issueBookingIds.has(key)) flags.push('delivery_issue');
      if (stage === 'posted' || stage === 'awaiting_driver') flags.push('unassigned');
      if (pickupDate && notPickedUp && !delayed && pickupDate >= now && pickupDate - now <= PICKUP_SOON_HOURS * HOUR) flags.push('pickup_soon');
      if (['at_pickup', 'in_transit', 'at_delivery'].includes(stage) && !(booking.documents || []).some((d) => d.docType === 'bol')) {
        flags.push('missing_docs');
      }

      flags.forEach((flag) => { flagCounts[flag] += 1; });
      if (flags.some((flag) => EXCEPTION_FLAGS.includes(flag))) exceptions += 1;

      const row = {
        id: booking._id,
        tripId: trip?._id || null,
        loadNumber: loadNumber(booking),
        shipper: booking.userId?.companyProfile?.companyName || fullName(booking.userId) || 'Unknown',
        driver: fullName(booking.driverId?.userId),
        pickup: booking.pickupLocation?.address || null,
        delivery: booking.deliveryLocation?.address || null,
        pickupDate: booking.pickupDate || null,
        deliveryDate: booking.deliveryDate || null,
        stage,
        flags,
      };

      if (flags.length) attention.push(row);
      if (ACTIVE_STAGES.includes(stage)) activeLoads.push(row);
    });

    attention.sort((a, b) => {
      const rank = (row) => Math.min(...row.flags.map((flag) => FLAG_PRIORITY.indexOf(flag)));
      return rank(a) - rank(b) || new Date(a.pickupDate || 0) - new Date(b.pickupDate || 0);
    });
    activeLoads.sort((a, b) => new Date(a.pickupDate || 0) - new Date(b.pickupDate || 0));

    // ---- Drivers ----
    const drivers = await Driver.find().select('approvalStatus availabilityStatus isOnline').lean();
    const onTripDriverIds = new Set(
      trips.filter((t) => ON_TRIP_STATUSES.includes(t.status)).map((t) => String(t.driverId))
    );
    const approved = drivers.filter((d) => d.approvalStatus === 'approved');
    const isOnline = (d) => (d.availabilityStatus ? d.availabilityStatus === 'online' : Boolean(d.isOnline));
    const driverOverview = {
      online: approved.filter(isOnline).length,
      offline: approved.filter((d) => !isOnline(d) && !onTripDriverIds.has(String(d._id))).length,
      onTrip: approved.filter((d) => onTripDriverIds.has(String(d._id))).length,
      available: approved.filter((d) => isOnline(d) && !onTripDriverIds.has(String(d._id))).length,
      inactive: drivers.length - approved.length,
      pendingApproval: drivers.filter((d) => d.approvalStatus === 'pending').length,
    };

    // ---- Shippers ----
    const shippers = await User.find({ role: 'user' })
      .select('firstName lastName email createdAt shipperOnboardingStep')
      .sort({ createdAt: -1 })
      .lean();
    const shipperOverview = {
      total: shippers.length,
      active: shippers.filter((s) => activeShipperIds.has(String(s._id))).length,
      pendingOnboarding: shippers.filter((s) => s.shipperOnboardingStep && s.shipperOnboardingStep !== 'complete').length,
      recent: shippers.slice(0, 5).map((s) => ({
        id: s._id,
        name: fullName(s) || s.email,
        email: s.email,
        createdAt: s.createdAt,
      })),
    };

    // ---- Financials ----
    const [invoiceTotals, settlementTotals] = await Promise.all([
      Invoice.aggregate([{ $group: { _id: '$status', total: { $sum: '$totalAmount' } } }]),
      Settlement.aggregate([{ $group: { _id: '$status', total: { $sum: '$totalDriverPayout' } } }]),
    ]);
    const invoiceTotal = (statuses) => invoiceTotals.filter((r) => statuses.includes(r._id)).reduce((sum, r) => sum + r.total, 0);
    const settlementTotal = (statuses) => settlementTotals.filter((r) => statuses.includes(r._id)).reduce((sum, r) => sum + r.total, 0);
    const financial = {
      totalRevenue: invoiceTotal(['paid']),
      pendingPayments: invoiceTotal(['pending_payment', 'payment_processing', 'awaiting_bank_transfer']),
      driverPayouts: settlementTotal(['paid']),
      shipperCharges: invoiceTotal(['pending_payment', 'payment_processing', 'awaiting_bank_transfer', 'paid']),
      outstandingAmounts: settlementTotal(['pending', 'approved']),
    };

    // ---- Recent activity (derived from record timestamps; there is no event log) ----
    const bookingById = new Map(bookings.map((b) => [String(b._id), b]));
    const activity = [];
    const push = (type, at, text, loadId) => { if (at) activity.push({ type, at, text, loadId }); };

    bookings.forEach((b) => {
      const label = loadNumber(b);
      const shipper = b.userId?.companyProfile?.companyName || fullName(b.userId) || 'A shipper';
      push('load_posted', b.createdAt, `New load ${label} posted by ${shipper}`, b._id);
      push('load_accepted', b.rateConfirmation?.driverAcceptedAt, `Load ${label} accepted by driver`, b._id);
      (b.documents || []).forEach((doc) => push('document_uploaded', doc.uploadedAt, `Document (${doc.docType}) uploaded for ${label}`, b._id));
    });
    trips.forEach((t) => {
      const b = bookingById.get(String(t.bookingId));
      if (!b) return;
      const label = loadNumber(b);
      if (t.status !== 'rejected') push('driver_assigned', t.createdAt, `Driver assigned to ${label}`, b._id);
      push('pickup_completed', t.startedAt, `Pickup completed for ${label}`, b._id);
      push('delivery_completed', t.completedAt, `Delivery completed for ${label}`, b._id);
    });
    openIssues.forEach((issue) => {
      const b = bookingById.get(bookingIdByTrip.get(String(issue.tripId)));
      push('issue_reported', issue.createdAt, `Issue reported${b ? ` on ${loadNumber(b)}` : ''}: ${String(issue.category).replace(/_/g, ' ')}`, b?._id);
    });
    activity.sort((a, b) => new Date(b.at) - new Date(a.at));

    // ---- 14-day trend: loads posted vs delivered per day ----
    const TREND_DAYS = 14;
    const dayKey = (date) => new Date(date).toISOString().slice(0, 10);
    const trendMap = new Map();
    for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
      trendMap.set(dayKey(new Date(now.getTime() - i * 24 * HOUR)), { posted: 0, delivered: 0 });
    }
    bookings.forEach((b) => { const bucket = trendMap.get(dayKey(b.createdAt)); if (bucket) bucket.posted += 1; });
    trips.forEach((t) => {
      if (!t.completedAt) return;
      const bucket = trendMap.get(dayKey(t.completedAt));
      if (bucket) bucket.delivered += 1;
    });
    const trend = [...trendMap.entries()].map(([date, counts]) => ({ date, ...counts }));

    return res.json({
      generatedAt: now,
      kpis: {
        totalLoads: bookings.length,
        activeLoads: activeLoads.length,
        unassignedLoads: stageCounts.posted + stageCounts.awaiting_driver,
        inTransit: stageCounts.in_transit,
        delivered: stageCounts.delivered,
        exceptions,
      },
      attention: { counts: flagCounts, loads: attention.slice(0, 20) },
      activeLoads: activeLoads.slice(0, 20),
      stageCounts,
      trend,
      drivers: driverOverview,
      shippers: shipperOverview,
      activity: activity.slice(0, 15),
      financial,
    });
  } catch (err) {
    console.error('[getDashboardOverview] Error:', err);
    return res.status(500).json({ message: 'Dashboard fetch failed' });
  }
};

// POST /admin/bookings/:id/assign  { driverId }
// Mirrors booking.controller selectQuote: the driver is attached and a Trip is created, then the
// agreed carrier rate goes through admin review before the driver acknowledges the confirmation.
const assignDriverToBooking = async (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ message: 'driverId is required' });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.isDraft) return res.status(400).json({ message: 'A draft load cannot be assigned' });
    if (!['OPEN_FOR_QUOTES', 'open_for_quotes'].includes(booking.status)) {
      return res.status(409).json({ message: 'Approve this load before assigning a driver' });
    }
    if (booking.driverId) return res.status(409).json({ message: 'This load already has a driver' });

    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    if (driver.approvalStatus !== 'approved') return res.status(400).json({ message: 'Driver is not approved' });

    const quote = (booking.quotations || []).find((q) => String(q.driverId) === String(driver._id));
    const agreedRate = quote?.price ?? booking.rate?.offeredRate;
    if (!(agreedRate > 0)) {
      return res.status(400).json({ message: 'An agreed carrier rate is required before assigning a driver' });
    }

    booking.driverId = driver._id;
    booking.selectedQuote = {
      quotedBy: quote ? 'driver' : 'admin',
      driverId: driver._id,
      price: agreedRate,
      currency: 'USD',
      notes: quote?.notes,
      selectedAt: new Date(),
      selectedByRole: 'Admin',
      selectedByName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || undefined,
    };
    booking.$locals.statusActor = {
      role: 'Admin',
      name: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || undefined,
    };
    booking.status = 'CONFIRMED';
    booking.rateConfirmation = {
      status: 'awaiting_admin_approval',
      driverId: driver._id,
      amount: agreedRate,
    };
    await booking.save();

    const existingTrip = await Trip.findOne({ bookingId: booking._id, driverId: driver._id, status: { $ne: 'rejected' } });
    let trip = existingTrip;
    if (!trip) {
      trip = new Trip({ bookingId: booking._id, driverId: driver._id, status: 'assigned', currentLocation: {} });
      trip.$locals.statusActor = booking.$locals.statusActor;
      await trip.save();
    }

    return res.json({ message: 'Driver assigned', bookingId: booking._id, tripId: trip._id });
  } catch (err) {
    console.error('[assignDriverToBooking] Error:', err);
    return res.status(500).json({ message: 'Failed to assign driver' });
  }
};

module.exports = { getDashboardOverview, assignDriverToBooking, resolveStage, loadNumber, fullName };
