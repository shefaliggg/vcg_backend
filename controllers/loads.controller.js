const Booking = require('../models/Booking');
const Trip = require('../models/Trip');
const Issue = require('../models/Issue');
const Invoice = require('../models/Invoice');
const Settlement = require('../models/Settlement');
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
const TAB_BY_STATUS = {
  PENDING_APPROVAL: 'pending_review',
  pending_approval: 'pending_review',
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

const TRIP_EVENT_LABELS = {
  assigned: 'Driver Assigned',
  accepted: 'Driver Accepted',
  rejected: 'Driver Cancelled',
  going_to_pickup: 'En Route to Pickup',
  arrived_at_pickup: 'At Pickup',
  loading: 'Loading',
  loaded: 'Picked Up',
  in_transit: 'In Transit',
  arrived_at_drop: 'At Delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  pod_uploaded: 'POD Submitted',
  pod_approved: 'Documents Verified',
  pod_rejected: 'POD Rejected',
};

const LOAD_EVENT_LABELS = {
  PENDING_APPROVAL: 'Pending Admin Review',
  pending_approval: 'Pending Admin Review',
  OPEN_FOR_QUOTES: 'Open for Bids',
  open_for_quotes: 'Open for Bids',
  CONFIRMED: 'Quote Accepted',
  confirmed: 'Quote Accepted',
  ACCEPTED: 'Rate Confirmed',
  accepted: 'Rate Confirmed',
  IN_PROGRESS: 'In Transit',
  in_progress: 'In Transit',
  DELIVERED: 'Delivered',
  completed: 'Completed',
  REJECTED: 'Load Rejected',
  rejected: 'Load Rejected',
};

const toEventName = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const eventActor = (role, name) => ({ role, name: name || null });
const formatCurrency = (value) => (typeof value === 'number' ? `$${value.toLocaleString()}` : 'Rate unavailable');

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

    const tabCounts = { all: bookings.length, pending_review: 0, posted: 0, bidding: 0, assigned: 0, in_transit: 0, delivered: 0 };

    const loads = bookings.map((booking) => {
      const { trip, stage } = resolveStage(booking, tripsByBooking.get(String(booking._id)) || []);
      const tab = TAB_BY_STATUS[booking.status] || TAB_BY_STAGE[stage];
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
        status: booking.status,
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
      .populate({ path: 'rateConfirmation.approvedBy', select: 'firstName lastName' })
      .populate({
        path: 'quotations.driverId',
        populate: [
          { path: 'userId', model: 'User', select: 'firstName lastName email phone' },
          { path: 'truckId', model: 'Truck', select: 'truckType make model year plateNumber registrationNumber' },
        ],
      })
      .populate('truckId', 'registrationNumber truckType capacity');

    if (!booking) return res.status(404).json({ message: 'Load not found' });

    const trips = await Trip.find({ bookingId: booking._id })
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .sort({ createdAt: -1 })
      .lean();
    const { trip, stage } = resolveStage(booking.toObject(), trips);
    const tripIds = trips.map((item) => item._id);
    const [issues, invoices] = await Promise.all([
      Issue.find({ tripId: { $in: tripIds } })
        .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
        .lean(),
      Invoice.find({ trip: { $in: tripIds } }).lean(),
    ]);
    const invoiceIds = invoices.map((invoice) => invoice._id);
    const settlements = invoiceIds.length
      ? await Settlement.find({ invoices: { $in: invoiceIds } }).populate({
        path: 'driver',
        populate: { path: 'userId', select: 'firstName lastName' },
      }).lean()
      : [];
    const timeline = [];
    const pushEvent = (event) => {
      if (event.changedAt) timeline.push({ automatic: false, ...event });
    };
    const loadLabel = loadNumber(booking);
    const pickup = booking.pickupLocation?.address || null;
    const delivery = booking.deliveryLocation?.address || null;
    const shipperName = fullName(booking.userId) || booking.userId?.companyProfile?.companyName || null;
    const documentRecords = (booking.documents || []).map((document) => ({
      ...document.toObject(),
      relatedTo: 'load',
    }));
    const rateConfirmationDocument = booking.rateConfirmation?.pdfUrl
      && !documentRecords.some((document) => document.fileUrl === booking.rateConfirmation.pdfUrl)
      ? [{
        docType: 'rate_confirmation',
        fileUrl: booking.rateConfirmation.pdfUrl,
        fileName: 'Rate Confirmation.pdf',
        uploadedAt: booking.rateConfirmation.generatedAt,
        relatedTo: 'load',
      }]
      : [];

    pushEvent({
      id: `load-created-${booking._id}`,
      category: 'milestone',
      status: 'created',
      title: 'Load Created',
      details: `Shipper created Load ${loadLabel}`,
      changedAt: booking.createdAt,
      performedBy: eventActor('Shipper', shipperName),
      location: pickup,
      destination: delivery,
      automatic: false,
    });

    const bookingStatusHistory = booking.statusHistory?.length
      ? booking.statusHistory
      : [{ status: booking.status, changedAt: booking.updatedAt || booking.createdAt }];
    bookingStatusHistory.forEach((entry, index) => {
      if (['IN_PROGRESS', 'in_progress'].includes(entry.status)) return;
      const label = LOAD_EVENT_LABELS[entry.status] || toEventName(entry.status);
      pushEvent({
        id: `load-status-${booking._id}-${index}`,
        category: entry.status === 'REJECTED' || entry.status === 'rejected' ? 'exception' : 'milestone',
        status: entry.status,
        title: label,
        details: entry.note
          || (label === 'Open for Bids' ? 'Load published to drivers; bidding opened.' : null)
          || (label === 'Quote Accepted' && booking.selectedQuote?.price ? `Accepted rate ${formatCurrency(booking.selectedQuote.price)}` : null),
        changedAt: entry.changedAt,
        performedBy: eventActor(
          entry.actorRole || booking.selectedQuote?.selectedByRole || 'System',
          entry.actorName || booking.selectedQuote?.selectedByName
        ),
        automatic: !entry.actorRole || entry.actorRole === 'System',
      });
    });

    (booking.quotations || []).forEach((quote, index) => {
      if (quote.selected && booking.selectedQuote?.selectedAt) return;
      const quoteDriver = quote.driverId?.userId;
      const quoteDriverName = fullName(quoteDriver);
      pushEvent({
        id: `quote-${quote._id || index}`,
        category: 'activity',
        status: quote.selected ? 'selected' : 'received',
        title: quote.selected ? 'Quote Accepted' : 'Quote Received',
        details: `${formatCurrency(quote.price)}${quote.notes ? ` · ${quote.notes}` : ''}`,
        changedAt: quote.selected && booking.selectedQuote?.selectedAt ? booking.selectedQuote.selectedAt : quote.createdAt,
        performedBy: eventActor('Driver', quoteDriverName),
        automatic: false,
        amount: quote.price,
      });
    });

    (booking.documents || []).forEach((document, index) => {
      const relatedDocument = document.toObject();
      pushEvent({
        id: `load-document-${document._id || index}`,
        category: 'activity',
        status: 'uploaded',
        title: `${toEventName(document.docType)} Uploaded`,
        details: document.fileName || null,
        changedAt: document.uploadedAt,
        performedBy: eventActor('Shipper', shipperName),
        location: null,
        relatedDocument,
        automatic: false,
      });
    });

    const tripDocuments = [];
    trips.forEach((tripRecord) => {
      const driverName = fullName(tripRecord.driverId?.userId);
      const assignmentEvent = booking.statusHistory?.find((entry) => ['CONFIRMED', 'confirmed'].includes(entry.status));
      const podDocument = tripRecord.podUrl ? {
        docType: 'pod',
        fileUrl: tripRecord.podUrl,
        fileName: 'Proof of Delivery',
        uploadedAt: tripRecord.statusHistory?.find((entry) => entry.status === 'pod_uploaded')?.changedAt || tripRecord.updatedAt,
        relatedTo: 'trip',
      } : null;
      const tripHistory = tripRecord.statusHistory?.length
        ? tripRecord.statusHistory
        : [{ status: tripRecord.status, changedAt: tripRecord.updatedAt || tripRecord.createdAt }];
      tripHistory.forEach((entry, index) => {
        const title = TRIP_EVENT_LABELS[entry.status] || toEventName(entry.status);
        const fallbackRole = entry.status === 'assigned'
          ? assignmentEvent?.actorRole || 'System'
          : ['pod_approved', 'pod_rejected'].includes(entry.status) ? 'Admin' : 'Driver';
        const actorRole = entry.actorRole && entry.actorRole !== 'System' ? entry.actorRole : fallbackRole;
        pushEvent({
          id: `trip-status-${tripRecord._id}-${index}`,
          category: ['rejected', 'pod_rejected'].includes(entry.status) ? 'exception' : 'milestone',
          status: entry.status,
          title,
          details: entry.note || (entry.status === 'going_to_pickup' ? 'Driver started trip.' : null),
          changedAt: entry.changedAt,
          performedBy: eventActor(
            actorRole,
            entry.actorName || (entry.status === 'assigned' ? assignmentEvent?.actorName : null) || (actorRole === 'Driver' ? driverName : null)
          ),
          location: ['arrived_at_pickup', 'loading', 'loaded'].includes(entry.status) ? pickup
            : ['arrived_at_drop', 'delivered', 'completed'].includes(entry.status) ? delivery : null,
          relatedDocument: entry.status === 'pod_uploaded' ? podDocument : null,
          automatic: actorRole === 'System',
        });
      });

      if (podDocument) {
        tripDocuments.push(podDocument);
      }
    });

    issues.forEach((issue) => {
      const issueDriver = fullName(issue.driverId?.userId);
      pushEvent({
        id: `issue-${issue._id}`,
        category: 'exception',
        status: issue.status,
        title: `${toEventName(issue.category)} Reported`,
        details: issue.description,
        changedAt: issue.createdAt,
        performedBy: eventActor('Driver', issueDriver),
        reason: issue.description,
        automatic: false,
      });
    });

    [
      { status: 'rate_confirmation_issued', at: booking.rateConfirmation?.generatedAt, title: 'Rate Confirmation Issued', role: 'Admin', name: fullName(booking.rateConfirmation?.approvedBy) },
      { status: 'user_signed', at: booking.rateConfirmation?.userSignedAt, title: 'Rate Confirmation Signed', role: 'Shipper', name: shipperName },
      { status: 'carrier_acknowledged', at: booking.rateConfirmation?.acknowledgedAt || booking.rateConfirmation?.driverAcceptedAt, title: 'Carrier Acknowledged Rate Confirmation', role: 'Driver', name: booking.rateConfirmation?.acknowledgedByName || fullName(booking.driverId?.userId) },
    ].forEach((entry) => {
      if (!entry.at) return;
      pushEvent({
        id: `rate-confirmation-${entry.status}`,
        category: 'milestone',
        status: entry.status,
        title: entry.title,
        details: formatCurrency(booking.rateConfirmation?.amount),
        changedAt: entry.at,
        performedBy: eventActor(entry.role, entry.name),
        amount: booking.rateConfirmation?.amount,
        automatic: entry.role === 'System',
      });
    });

    invoices.forEach((invoice) => {
      const relatedTrip = trips.find((item) => String(item._id) === String(invoice.trip));
      const driverName = fullName(relatedTrip?.driverId?.userId);
      pushEvent({
        id: `invoice-created-${invoice._id}`,
        category: 'financial',
        status: 'created',
        title: 'Invoice Created',
        details: `${formatCurrency(invoice.totalAmount)} · ${toEventName(invoice.status)}`,
        changedAt: invoice.createdAt,
        performedBy: eventActor('System'),
        amount: invoice.totalAmount,
        automatic: true,
      });
      if (invoice.status !== 'pending_payment' && invoice.updatedAt && new Date(invoice.updatedAt) > new Date(invoice.createdAt)) {
        pushEvent({
          id: `invoice-status-${invoice._id}`,
          category: invoice.status === 'cancelled' ? 'exception' : 'financial',
          status: invoice.status,
          title: `Payment ${toEventName(invoice.status)}`,
          details: formatCurrency(invoice.totalAmount),
          changedAt: invoice.updatedAt,
          performedBy: eventActor('System', driverName),
          amount: invoice.totalAmount,
          automatic: true,
        });
      }
    });

    settlements.forEach((settlement) => {
      const driverName = fullName(settlement.driver?.userId);
      pushEvent({
        id: `settlement-created-${settlement._id}`,
        category: 'financial',
        status: 'created',
        title: 'Settlement Created',
        details: `Driver payout ${formatCurrency(settlement.totalDriverPayout)}`,
        changedAt: settlement.createdAt,
        performedBy: eventActor('System'),
        amount: settlement.totalDriverPayout,
        automatic: true,
      });
      if (settlement.updatedAt && new Date(settlement.updatedAt) > new Date(settlement.createdAt)) {
        pushEvent({
          id: `settlement-status-${settlement._id}`,
          category: 'financial',
          status: settlement.status,
          title: settlement.status === 'paid' ? 'Driver Payout Completed' : `Settlement ${toEventName(settlement.status)}`,
          details: `Net payout ${formatCurrency(settlement.totalDriverPayout)}${settlement.payoutInfo?.transactionId ? ` · ${settlement.payoutInfo.transactionId}` : ''}`,
          changedAt: settlement.payoutInfo?.paidAt || settlement.updatedAt,
          performedBy: eventActor('Admin', driverName),
          amount: settlement.totalDriverPayout,
          automatic: false,
        });
      }
    });

    timeline.sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
    const financials = { invoices, settlements };

    return res.json({
      ...booking.toObject(),
      loadNumber: loadNumber(booking),
      stage,
      tab: TAB_BY_STAGE[stage],
      tripId: trip?._id || null,
      tripStatus: trip?.status || null,
      currentLocation: trip?.currentLocation || booking.currentLocation || null,
      statusTimeline: timeline,
      loadDocuments: [...documentRecords, ...rateConfirmationDocument, ...tripDocuments],
      financials,
      activity: timeline.filter((event) => event.category === 'activity' || event.category === 'exception'),
      // Quotes can only be picked (by the admin or the shipper) while no driver is attached.
      canSelectQuote: !booking.driverId && !booking.isDraft && ['OPEN_FOR_QUOTES', 'open_for_quotes'].includes(booking.status),
    });
  } catch (err) {
    console.error('[getLoadById] Error:', err);
    return res.status(500).json({ message: 'Failed to fetch load' });
  }
};

module.exports = { getAllLoads, getLoadById };
