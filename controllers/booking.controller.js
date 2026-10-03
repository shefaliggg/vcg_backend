const { createAndSendNotification, notifyAdmins } = require('../utils/notificationService');
const { loadNumber } = require('./dashboard.controller');

// GET /api/bookings/:id/raw (debug: print raw MongoDB document)
const getBookingRaw = async (req, res) => {
  try {
    const booking = await require('../models/Booking').findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    return res.json({ raw: booking });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch raw booking', error: err.message });
  }
};
// GET /api/bookings/for-driver - confirmations awaiting the assigned driver's acknowledgment
const getDriverConfirmations = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    const driverId = driver._id;

    const bookings = await Booking.find({
      driverId: driverId,
      'rateConfirmation.status': { $in: ['awaiting_carrier_acknowledgment', 'user_signed'] }
    })
      .populate('userId', 'firstName lastName email phone')
      .populate('quotations.driverId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });

    const formatted = bookings.map(b => {
      const booking = b.toObject();

      if (Array.isArray(booking.quotations)) {
        let found = null;

        // Try to match by selectedQuote.driverId
        if (booking.selectedQuote?.driverId) {
          found = booking.quotations.find(q => {
            if (!q.driverId) return false;

            const qDriverId = q.driverId._id
              ? q.driverId._id.toString()
              : q.driverId.toString();

            return qDriverId === booking.selectedQuote.driverId.toString();
          });
        }

        // Fallback to selected flag
        if (!found) {
          found = booking.quotations.find(q => q.selected === true);
        }

        if (found) {
          booking.selectedQuote = found;
        }
      }

      return booking;
    });

    return res.json(formatted);

  } catch (err) {
    console.error('[getDriverConfirmations] ERROR:', err);
    return res.status(500).json({
      message: 'Failed to fetch driver confirmations',
      error: err.message
    });
  }
};

// ...existing code...
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Booking = require('../models/Booking');
const Counter = require('../models/Counter');
const User = require('../models/User');
const Driver = require('../models/Driver');

const nextLoadNumber = async () => {
  const counter = await Counter.findOneAndUpdate(
    { _id: 'load-number' },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `CP-${String(counter.sequence).padStart(5, '0')}`;
};


const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getAdminProfile = async () => {
  const adminUser = await User.findOne({ role: 'admin', 'adminProfile.dispatcherEmail': { $exists: true } });
  return adminUser?.adminProfile || null;
};



// Admin approval workflow: a posted load should not become visible to drivers until
// an admin approves it. Pending reviews are kept out of the driver-facing feed.
const approveBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.isDraft) {
      return res.status(400).json({ message: 'Draft loads cannot be approved for bidding' });
    }
    if (!['PENDING_APPROVAL', 'pending_approval'].includes(booking.status)) {
      return res.status(409).json({ message: 'Only loads pending admin review can be approved' });
    }

    booking.$locals.statusActor = {
      role: 'Admin',
      name: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || undefined,
    };
    booking.status = 'OPEN_FOR_QUOTES';
    await booking.save();
    return res.json({ message: 'Load approved and is now live for bidding', booking });
  } catch (err) {
    console.error('[approveBooking] ERROR:', err);
    return res.status(500).json({ message: 'Failed to approve booking', error: err.message });
  }
};

const rejectBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.isDraft) {
      return res.status(400).json({ message: 'Draft loads cannot be rejected' });
    }

    booking.$locals.statusActor = {
      role: 'Admin',
      name: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || undefined,
    };
    booking.status = 'REJECTED';
    await booking.save();
    return res.json({ message: 'Load rejected by admin', booking });
  } catch (err) {
    console.error('[rejectBooking] ERROR:', err);
    return res.status(500).json({ message: 'Failed to reject booking', error: err.message });
  }
};

// Get all bookings (admin only)
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('userId', 'firstName lastName email phone')
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName email phone' }
      })
      .populate('truckId', 'registrationNumber truckType capacity status')
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch bookings', error: err.message });
  }
};

// Get available bookings for drivers to quote


const getAvailableBookings = async (req, res) => {
  try {
    // Find driver using logged-in user
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    const driverId = driver._id;

    // Open loads, including ones this driver already quoted (flagged via myQuote so the
    // app can show "Quote Submitted"). Other drivers' quotes are never sent to the client.
    const docs = await Booking.find({
      status: { $in: ['OPEN_FOR_QUOTES', 'open_for_quotes'] },
      isDraft: { $ne: true },
    }).sort({ createdAt: -1 });

    const bookings = docs.map((doc) => {
      const obj = doc.toObject();
      const mine = (obj.quotations || []).find(
        (q) => q.driverId && String(q.driverId) === String(driverId)
      );
      delete obj.quotations;
      obj.myQuote = mine
        ? { price: mine.price, notes: mine.notes, createdAt: mine.createdAt }
        : null;
      return obj;
    });

    return res.json(bookings);

  } catch (err) {
    return res.status(500).json({
      message: 'Failed to fetch available bookings',
      error: err.message
    });
  }
};

// POST /api/bookings
const createBooking = async (req, res) => {
  try {
    const {
      userId,
      driverId,
      truckId,
      shipper,
      consignee,
      pickupLocation,
      deliveryLocation,
      pickupDate,
      deliveryDate,
      truckType,
      loadDetails,
      pickupDetails,
      deliveryDetails,
      equipmentDetails,
      requirements,
      rate,
      documents,
      referenceNumber,
      internalNotes,
      isDraft,
    } = req.body;

    const bookingUserId = req.user?.role === 'admin' ? userId : req.user._id;

    if (!bookingUserId) {
      return res.status(400).json({ message: 'Missing required field: userId' });
    }

    // Mandatory admin verification gate: a shipper who hasn't cleared onboarding +
    // admin review yet cannot post or draft loads. Legacy password accounts and
    // admin-created shippers default to 'approved' and are unaffected.
    if (req.user?.role === 'user' && req.user.shipperApprovalStatus !== 'approved') {
      return res.status(403).json({
        message: 'Your shipper account is still under admin review. You can post loads once it is approved.',
      });
    }

    // A draft only needs an owner - everything else can be filled in later.
    // Posting live (isDraft false/absent) needs the MVP-required fields:
    // pickup, delivery, pickup/delivery date, commodity, weight, equipment type.
    // No rate: the shipper posts the load, drivers quote, the shipper accepts a quote.
    if (!isDraft) {
      if (
        !pickupLocation || !deliveryLocation || !pickupDate || !deliveryDate ||
        !truckType || !loadDetails || !loadDetails.weight || !loadDetails.type
      ) {
        return res.status(400).json({
          message: 'Missing required fields: pickupLocation, deliveryLocation, pickupDate, deliveryDate, truckType, loadDetails.weight, loadDetails.type',
        });
      }
    }

    const booking = new Booking({
      userId: bookingUserId,
      loadNumber: await nextLoadNumber(),
      driverId: driverId || undefined,
      truckId: truckId || undefined,
      shipper: shipper || { name: 'TBD', phone: 'TBD' },
      consignee: consignee || { name: 'TBD', phone: 'TBD' },
      pickupLocation,
      deliveryLocation,
      pickupDate,
      deliveryDate,
      truckType,
      loadDetails,
      pickupDetails,
      deliveryDetails,
      equipmentDetails,
      requirements,
      rate,
      documents,
      referenceNumber,
      internalNotes,
      isDraft: !!isDraft,
      status: isDraft ? 'OPEN_FOR_QUOTES' : 'PENDING_APPROVAL',
      quotations: [],
      rateConfirmation: { status: 'not_generated' }
    });
    // A draft is intentionally incomplete, so skip required-field validation for it.
    await booking.save({ validateBeforeSave: !isDraft });

    if (!isDraft) {
      await notifyAdmins({
        title: `New load awaiting review - ${loadNumber(booking)}`,
        body: `${booking.pickupLocation?.address || 'N/A'} → ${booking.deliveryLocation?.address || 'N/A'}`,
        type: 'booking_pending_approval',
        data: { bookingId: booking._id, loadNumber: loadNumber(booking) },
        io: req.app.get('io'),
      });
    }

    return res.status(201).json({
      bookingId: booking._id,
      loadNumber: booking.loadNumber,
      status: booking.status,
      isDraft: booking.isDraft,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create booking', error: err.message });
  }
};

// POST /api/bookings/:id/quote (driver or admin submits quote)
const submitQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const { price, notes, driverId } = req.body;

    if (!['driver', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ message: 'Only drivers and admins can submit quotes' });
    }

    console.log(`\n====== [submitQuote] START ======`);
    console.log(`Booking ID: ${id}`);
    console.log(`Price: ${price}, Notes: ${notes}`);
    console.log(`User ID: ${req.user?._id}, Role: ${req.user?.role}`);
    // Extra logging for debugging driverId null issue
    console.log('req.driver:', req.driver);
    console.log('req.user:', req.user);

    if (!price || price <= 0) {
      console.log('[submitQuote] Invalid price');
      return res.status(400).json({ message: 'Invalid quote price' });
    }

    const booking = await Booking.findById(id);
    console.log(`[submitQuote] Booking found:`, !!booking);
    if (!booking) {
      console.log('[submitQuote] Booking NOT found');
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (req.user.role === 'driver' && !req.driver?._id) {
      return res.status(403).json({ message: 'Driver profile not found' });
    }
    if (booking.isDraft || !['OPEN_FOR_QUOTES', 'open_for_quotes'].includes(booking.status)) {
      return res.status(409).json({ message: 'This load is not open for bidding yet' });
    }

    if (
      req.user.role === 'driver' &&
      req.driver?._id &&
      (booking.quotations || []).some((q) => q.driverId && String(q.driverId) === String(req.driver._id))
    ) {
      return res.status(400).json({ message: 'You have already submitted a quote for this load' });
    }

    // Ensure quotations is initialized as an array
    if (!Array.isArray(booking.quotations)) {
      console.log('[submitQuote] Quotations field not an array, initializing...');
      booking.quotations = [];
    }

    console.log(`[submitQuote] Before push - quotations is array?`, Array.isArray(booking.quotations));
    console.log(`[submitQuote] Before push - quotations:`, JSON.stringify(booking.quotations));

    const quotedBy = req.user.role === 'driver' ? 'driver' : 'admin';

    // Always set driverId as ObjectId
    let driverIdToUse = driverId;
    if (quotedBy === 'driver' && req.driver && req.driver._id) {
      driverIdToUse = req.driver._id;
    }
    if (driverIdToUse && typeof driverIdToUse === 'string') {
      const mongoose = require('mongoose');
      driverIdToUse = mongoose.Types.ObjectId(driverIdToUse);
    }
    const quote = {
      quotedBy,
      userId: req.user._id,
      driverId: driverIdToUse,
      price: price,
      currency: 'USD',
      notes: notes || '',
      createdAt: new Date()
    };

    console.log(`[submitQuote] Quote object:`, JSON.stringify(quote, null, 2));
    console.log(`[submitQuote] Current quotations count: ${booking.quotations.length}`);

    booking.quotations.push(quote);
    console.log(`[submitQuote] After push, quotations count: ${booking.quotations.length}`);
    console.log(`[submitQuote] After push - quotations:`, JSON.stringify(booking.quotations));

    booking.markModified('quotations');
    const savedBooking = await booking.save();
    console.log(`[submitQuote] Booking saved. Verifying...`);
    await createAndSendNotification({
      userId: booking.userId,
      title: `New Quote Received - ${loadNumber(booking)}`,
      body: `${booking.pickupLocation?.address || 'N/A'} → ${booking.deliveryLocation?.address || 'N/A'}`,
      data: {
        type: "quote_submitted",
        bookingId: booking._id,
        loadNumber: loadNumber(booking)
      }
    });

    const verify = await Booking.findById(id);
    console.log(`[submitQuote] Verified - quotations in DB: ${verify.quotations.length}`);
    console.log(`[submitQuote] All quotations:`, JSON.stringify(verify.quotations, null, 2));
    console.log(`====== [submitQuote] SUCCESS ======\n`);

    return res.status(201).json({
      message: 'Quote submitted',
      quote,
      totalQuotes: verify.quotations.length
    });
  } catch (err) {
    console.error(`====== [submitQuote] ERROR ======`);
    console.error(`Message: ${err.message}`);
    console.error(`Stack:`, err.stack);
    console.error(`====== [submitQuote] ERROR END ======\n`);
    return res.status(500).json({ message: 'Failed to submit quote', error: err.message });
  }
};

// POST /api/bookings/:id/select-quote (user selects quote)
const selectQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const { quoteIndex } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (req.user?.role !== 'admin' && (req.user?.role !== 'user' || String(booking.userId) !== String(req.user._id))) {
      return res.status(403).json({ message: 'Only the owning shipper or an admin can select a quote' });
    }
    if (booking.isDraft || !['OPEN_FOR_QUOTES', 'open_for_quotes'].includes(booking.status)) {
      return res.status(409).json({ message: 'This load is not open for quote selection yet' });
    }

    if (!Array.isArray(booking.quotations) || quoteIndex < 0 || quoteIndex >= booking.quotations.length) {
      return res.status(400).json({ message: 'Invalid quote index' });
    }

    // Mark selected quote
    booking.quotations.forEach((q, i) => {
      q.selected = i === quoteIndex;
    });
    booking.markModified('quotations');

    let selectedQuote = booking.quotations[quoteIndex];

    const mongoose = require('mongoose');

    // Ensure driverId is ObjectId
    if (selectedQuote.driverId && typeof selectedQuote.driverId === 'string') {
      selectedQuote.driverId = mongoose.Types.ObjectId(selectedQuote.driverId);
    } else if (selectedQuote.driverId && selectedQuote.driverId._id) {
      selectedQuote.driverId = selectedQuote.driverId._id;
    }

    // Ensure price exists
    if (!selectedQuote.price || selectedQuote.price === 0) {
      const orig = booking.quotations[quoteIndex];
      if (orig && orig.price) selectedQuote.price = orig.price;
    }

    // Save selectedQuote for backward compatibility
    booking.selectedQuote = {
      quotedBy: selectedQuote.quotedBy,
      driverId: selectedQuote.driverId,
      price: selectedQuote.price,
      currency: selectedQuote.currency || 'USD',
      notes: selectedQuote.notes,
      selectedAt: new Date(),
      selectedByRole: req.user?.role === 'admin' ? 'Admin' : 'Shipper',
      selectedByName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || undefined,
    };

    booking.driverId = selectedQuote.driverId;
    booking.$locals.statusActor = {
      role: booking.selectedQuote.selectedByRole,
      name: booking.selectedQuote.selectedByName,
    };
    booking.status = 'CONFIRMED';

    // 🔥 IMPORTANT: DO NOT GENERATE PDF HERE
    booking.rateConfirmation = {
      status: 'awaiting_admin_approval',
      driverId: selectedQuote.driverId,
      amount: selectedQuote.price,
    };

    await booking.save();

    await notifyAdmins({
      title: `Rate Confirmation Review - ${loadNumber(booking)}`,
      body: `Review the accepted carrier quote of ${selectedQuote.price} USD before issuing the confirmation.`,
      type: 'rate_confirmation_pending_approval',
      data: { bookingId: booking._id, loadNumber: loadNumber(booking) },
      io: req.app.get('io'),
    });

    // -------------------------
    // Ensure Trip exists
    // -------------------------
    const Trip = require('../models/Trip');

    if (!booking.driverId || !booking._id) {
      return res.status(500).json({
        message: 'Cannot create trip: missing driverId or bookingId'
      });
    }

    let trip = await Trip.findOne({
      bookingId: booking._id,
      driverId: booking.driverId
    });

    if (!trip) {
      trip = await Trip.create({
        bookingId: booking._id,
        driverId: booking.driverId,
        status: 'assigned',
        currentLocation: {},
      });
    }

    // -------------------------
    // Re-fetch populated booking
    // -------------------------
    let updatedBooking = await Booking.findById(id)
      .populate('userId', 'firstName lastName email phone companyProfile adminProfile')
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName email phone' }
      })
      .populate('quotations.driverId', 'firstName lastName email phone')
      .populate('truckId', 'registrationNumber truckType capacity')
      .lean();

    // Attach selectedQuote properly
    if (booking.selectedQuote && Array.isArray(updatedBooking.quotations)) {
      const found = updatedBooking.quotations.find(q => {
        if (!q.driverId || !booking.selectedQuote.driverId) return false;

        const qId = q.driverId._id
          ? q.driverId._id.toString()
          : q.driverId.toString();

        return qId === booking.selectedQuote.driverId.toString();
      });

      updatedBooking.selectedQuote = found || booking.selectedQuote;
    }

    return res.json(updatedBooking);

  } catch (err) {
    console.error('[selectQuote] ERROR:', err);
    return res.status(500).json({
      message: 'Failed to select quote',
      error: err.message
    });
  }
};

const buildRateConfirmationPdf = async ({
  booking,
  user,
  adminProfile,
  driver,
  selectedQuote,
  acknowledgment = null
}) => {

  const uploadsDir = path.join(__dirname, '..', 'uploads', 'rate-confirmations');
  ensureDir(uploadsDir);

  const fileName = `rate-confirmation-${booking._id}.pdf`;
  const filePath = path.join(uploadsDir, fileName);
  const fileUrl = `/rate-confirmations/${fileName}`;

  const doc = new PDFDocument({ margin: 40 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const primary = '#111';
  const grey = '#666';
  const shipper = user?.companyProfile || {};
  const driverUser = driver?.userId || {};
  const carrierName = driver?.carrierProfile?.legalName || driverUser.companyProfile?.companyName
    || `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim();
  const loadNumberValue = loadNumber(booking);
  const formatDate = (value) => value ? new Date(value).toLocaleDateString() : 'N/A';
  const formatAddress = (location) => location?.address || 'N/A';
  const section = (title) => {
    doc.moveDown(0.6).fontSize(13).font('Helvetica-Bold').fillColor(primary).text(title.toUpperCase());
    doc.moveDown(0.25);
  };
  const field = (label, value) => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(grey).text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor(primary).text(value || 'N/A');
  };

  doc.fontSize(19).font('Helvetica-Bold').fillColor(primary).text('VCG TRANSPORT', { align: 'center' });
  doc.fontSize(17).text('RATE CONFIRMATION', { align: 'center' });
  doc.moveDown(0.4).fontSize(10).font('Helvetica').fillColor(primary)
    .text(`Rate Confirmation #: RC-${loadNumberValue}`, { align: 'center' })
    .text(`Load #: ${loadNumberValue}  |  Issue date: ${formatDate(booking.rateConfirmation?.generatedAt)}`, { align: 'center' })
    .text(`Status: ${acknowledgment ? 'Carrier Acknowledged' : 'Awaiting Carrier Acknowledgment'}`, { align: 'center' });
  doc.moveDown(0.4).moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#bbb').stroke();

  section('Broker Information');
  field('Broker', 'VCG Transport');
  field('Address', adminProfile?.address || process.env.VCG_TRANSPORT_ADDRESS);
  field('Phone', adminProfile?.dispatcherPhone || process.env.VCG_TRANSPORT_PHONE);
  field('Email', adminProfile?.dispatcherEmail || process.env.VCG_TRANSPORT_EMAIL);
  field('MC / DOT', adminProfile?.mcNumber || adminProfile?.dotNumber || process.env.VCG_TRANSPORT_MC_DOT);

  section('Carrier / Driver Information');
  field('Carrier legal name', carrierName);
  field('DBA', driver?.carrierProfile?.dba);
  field('Driver', `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim());
  field('Phone', driverUser.phone);
  field('MC / DOT', [driver?.carrierProfile?.mcNumber, driver?.carrierProfile?.dotNumber].filter(Boolean).join(' / '));

  section('Shipper Information');
  field('Company', shipper.companyName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim());
  field('Pickup contact', booking.shipper?.name);
  field('Phone', booking.shipper?.phone || shipper.phone || user?.phone);
  field('Email', shipper.email || user?.email);

  section('Load Information');
  field('Commodity', booking.loadDetails?.type || booking.loadDetails?.description);
  field('Equipment type', booking.truckType);
  field('Weight', booking.loadDetails?.weight ? `${booking.loadDetails.weight} lb` : null);
  field('Pieces / pallets', booking.loadDetails?.pieces || booking.loadDetails?.totalQuantity);
  const dimensions = booking.loadDetails?.dimensions;
  field('Dimensions', dimensions && [dimensions.length, dimensions.width, dimensions.height].some(Boolean)
    ? `${dimensions.length || '?'} x ${dimensions.width || '?'} x ${dimensions.height || '?'}` : null);
  field('Temperature', booking.equipmentDetails?.temperatureRequirements);
  field('Hazmat', booking.requirements?.hazmat ? 'Yes' : 'No');
  field('Special handling', [booking.equipmentDetails?.specialEquipment, booking.requirements?.otherRequirements].filter(Boolean).join('; '));

  section('Pickup Details');
  field('Company', booking.shipper?.name);
  field('Address', formatAddress(booking.pickupLocation));
  field('Date', formatDate(booking.pickupDate));
  field('Time / window', booking.pickupDetails?.time || [booking.pickupDetails?.windowStart, booking.pickupDetails?.windowEnd].filter(Boolean).join(' - '));
  field('Appointment #', booking.pickupDetails?.appointmentNumber);
  field('Contact', booking.pickupDetails?.contactName);
  field('Phone', booking.pickupDetails?.contactPhone || booking.shipper?.phone);
  field('Instructions', booking.pickupDetails?.instructions);

  section('Delivery Details');
  field('Company', booking.consignee?.name);
  field('Address', formatAddress(booking.deliveryLocation));
  field('Date', formatDate(booking.deliveryDate));
  field('Time / window', booking.deliveryDetails?.time || [booking.deliveryDetails?.windowStart, booking.deliveryDetails?.windowEnd].filter(Boolean).join(' - '));
  field('Appointment #', booking.deliveryDetails?.appointmentNumber);
  field('Contact', booking.deliveryDetails?.contactName);
  field('Phone', booking.deliveryDetails?.contactPhone || booking.consignee?.phone);
  field('Instructions', booking.deliveryDetails?.instructions);

  section('Agreed Carrier Rate');
  field('Carrier rate / linehaul', `${selectedQuote?.price || booking.rateConfirmation?.amount || 0} ${selectedQuote?.currency || 'USD'}`);
  field('Approved accessorials', 'Detention: As agreed; Layover: As agreed');
  field('Total carrier pay', `${selectedQuote?.price || booking.rateConfirmation?.amount || 0} ${selectedQuote?.currency || 'USD'}`);
  if (selectedQuote?.notes) field('Rate notes', selectedQuote.notes);

  section('Special Terms & Instructions');
  field('Tracking', booking.requirements?.trackingRequirements || 'Maintain shipment tracking as required by VCG Transport.');
  field('Appointments', 'Follow all pickup and delivery appointment requirements shown above.');
  field('Accessorials / cancellation', [booking.requirements?.cancellationTerms, booking.rate?.paymentTerms, 'Detention and layover must be agreed with VCG Transport.'].filter(Boolean).join('; '));
  field('Other instructions', [booking.loadDetails?.description, booking.requirements?.driverRequirements, booking.requirements?.insuranceRequirements, booking.requirements?.otherRequirements].filter(Boolean).join('; '));

  section('Document Requirements');
  field('Required documents', booking.requirements?.documentRequirements || 'Signed BOL, proof of delivery, and delivery receipt. Provide photos when required for this load.');

  section('Carrier Acknowledgment');
  doc.fontSize(9).font('Helvetica').fillColor(primary).text(
    'I acknowledge receipt of this Rate Confirmation and the load details, carrier rate, pickup and delivery information, and applicable instructions.'
  );
  doc.moveDown(0.3);
  field('Acknowledged by', acknowledgment?.name);
  field('Date / time', acknowledgment?.at ? new Date(acknowledgment.at).toLocaleString() : 'Awaiting carrier acknowledgment');

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileUrl };
};

const approveRateConfirmation = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.rateConfirmation?.status !== 'awaiting_admin_approval') {
      return res.status(409).json({ message: 'Rate confirmation is not awaiting admin approval' });
    }
    if (!booking.selectedQuote || !booking.driverId) {
      return res.status(400).json({ message: 'An accepted carrier quote is required before issuing a rate confirmation' });
    }

    const user = await User.findById(booking.userId);
    const adminProfile = await getAdminProfile();
    const driver = await Driver.findById(booking.driverId).populate('userId', 'firstName lastName email phone companyProfile');
    if (!driver?.userId) return res.status(400).json({ message: 'Assigned carrier account was not found' });

    const generatedAt = new Date();
    booking.rateConfirmation.generatedAt = generatedAt;
    const { fileUrl: pdfUrl } = await buildRateConfirmationPdf({
      booking,
      user,
      adminProfile,
      driver,
      selectedQuote: booking.selectedQuote,
    });
    booking.rateConfirmation.status = 'awaiting_carrier_acknowledgment';
    booking.rateConfirmation.pdfUrl = pdfUrl;
    booking.rateConfirmation.approvedAt = generatedAt;
    booking.rateConfirmation.approvedBy = req.user._id;
    await booking.save();

    await createAndSendNotification({
      userId: driver.userId._id,
      title: `Rate Confirmation Ready - ${loadNumber(booking)}`,
      body: 'Review the issued Rate Confirmation and acknowledge receipt to begin this load.',
      data: { type: 'rate_confirmation_ready', bookingId: booking._id, loadNumber: loadNumber(booking) },
    });

    return res.json({
      message: 'Rate confirmation approved and sent to the carrier',
      status: booking.rateConfirmation.status,
      pdfUrl,
    });
  } catch (err) {
    console.error('[approveRateConfirmation] ERROR:', err);
    return res.status(500).json({ message: 'Failed to approve rate confirmation', error: err.message });
  }
};

// POST /api/bookings/:id/rate-confirmation/user-sign (user signs)
const userSignRateConfirmation = async (req, res) => {
  try {
    const { id } = req.params;
    const { signature } = req.body; // base64 string

    if (!signature) {
      return res.status(400).json({ message: "Signature required" });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.rateConfirmation.status !== "awaiting_user_signature") {
      return res.status(400).json({
        message: `Invalid status: ${booking.rateConfirmation.status}`
      });
    }

    /* ================= SAVE SIGNATURE FILE ================= */

    const signaturesDir = path.join(__dirname, "..", "uploads", "signatures");
    ensureDir(signaturesDir);

    const base64Data = signature.replace(/^data:image\/png;base64,/, "");
    const fileName = `user-sign-${booking._id}.png`;
    const filePath = path.join(signaturesDir, fileName);

    fs.writeFileSync(filePath, base64Data, "base64");

    const fileUrl = `/uploads/signatures/${fileName}`;

    /* ================= GENERATE FINAL PDF ================= */

    const user = await User.findById(booking.userId);
    const adminProfile = await getAdminProfile();
    const driver = await Driver.findById(booking.driverId).populate("userId");

    const { fileUrl: pdfUrl } = await buildRateConfirmationPdf({
      booking,
      user,
      adminProfile,
      driver,
      selectedQuote: booking.selectedQuote,
      userSignaturePath: filePath
    });

    /* ================= UPDATE BOOKING ================= */

    booking.rateConfirmation.status = "user_signed";
    booking.rateConfirmation.userSignatureUrl = fileUrl;
    booking.rateConfirmation.userSignedAt = new Date();
    booking.rateConfirmation.pdfUrl = pdfUrl;

    await booking.save();

    /* ================= NOTIFY DRIVER ================= */

    await createAndSendNotification({
      userId: driver.userId._id,
      title: "Rate Confirmation Signed",
      body: "User signed the rate confirmation. Please review and accept.",
      data: {
        type: "rate_signed",
        bookingId: booking._id
      }
    });

    await notifyAdmins({
      title: `Rate Confirmation signed - ${loadNumber(booking)}`,
      body: `${user?.firstName || 'Shipper'} signed the rate confirmation`,
      type: 'rate_confirmation_signed',
      data: { bookingId: booking._id, loadNumber: loadNumber(booking) },
      io: req.app.get('io'),
    });

    return res.json({
      message: "Signed successfully",
      status: booking.rateConfirmation.status,
      pdfUrl
    });

  } catch (err) {
    console.error("Signature error:", err);
    return res.status(500).json({
      message: "Failed to sign",
      error: err.message
    });
  }
};

// POST /api/bookings/:id/rate-confirmation/acknowledge
const driverAcknowledgeRateConfirmation = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const assignedDriver = await Driver.findOne({ userId: req.user._id });
    if (!assignedDriver || String(assignedDriver._id) !== String(booking.driverId)) {
      return res.status(403).json({ message: 'Only the assigned carrier account can acknowledge this rate confirmation' });
    }
    const previousStatus = booking.rateConfirmation?.status;
    if (!['awaiting_carrier_acknowledgment', 'user_signed'].includes(previousStatus)) {
      return res.status(409).json({ message: 'Rate confirmation is not awaiting carrier acknowledgment' });
    }

    const acknowledgedAt = new Date();
    const driverName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
    booking.rateConfirmation.status = previousStatus === 'user_signed' ? 'driver_accepted' : 'carrier_acknowledged';
    booking.rateConfirmation.acknowledgedBy = req.user._id;
    booking.rateConfirmation.acknowledgedByName = driverName || undefined;
    booking.rateConfirmation.acknowledgedAt = acknowledgedAt;
    booking.rateConfirmation.driverAcceptedAt = acknowledgedAt;
    booking.rateConfirmation.acknowledgmentAudit = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      device: req.get('x-device-info'),
    };

    const user = await User.findById(booking.userId);
    const adminProfile = await getAdminProfile();
    const driver = await Driver.findById(booking.driverId).populate('userId', 'firstName lastName email phone companyProfile');
    const { fileUrl: pdfUrl } = await buildRateConfirmationPdf({
      booking,
      user,
      adminProfile,
      driver,
      selectedQuote: booking.selectedQuote,
      acknowledgment: { name: driverName, at: acknowledgedAt },
    });
    booking.rateConfirmation.pdfUrl = pdfUrl;
    booking.status = 'ACCEPTED';
    await booking.save();

    // The quote is already agreed; acknowledgment is the only carrier action required.
    await createAndSendNotification({
      userId: booking.userId,
      title: 'Rate Confirmation Acknowledged',
      body: 'The assigned carrier acknowledged the agreed rate and load details.',
      data: {
        type: 'rate_confirmation_acknowledged',
        bookingId: booking._id
      }
    });
    const Trip = require('../models/Trip');
    const trip = await Trip.findOne({ bookingId: booking._id, driverId: booking.driverId });
    if (trip) {
      trip.$locals.statusActor = { role: 'Driver', name: driverName || undefined };
      trip.status = 'accepted';
      await trip.save();
    }
    return res.json({ message: 'Rate confirmation acknowledged; load is ready to execute', status: booking.rateConfirmation.status, pdfUrl });
  } catch (err) {
    console.error('[driverAcknowledgeRateConfirmation] ERROR:', err);
    return res.status(500).json({ message: 'Failed to acknowledge rate confirmation', error: err.message });
  }
};

const driverAcceptRateConfirmation = driverAcknowledgeRateConfirmation;

const addBookingDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a PDF or image to upload' });
    const docType = req.body.docType || 'other';
    if (!['bol', 'rate_confirmation', 'other'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.documents.push({
      docType,
      fileUrl: `/uploads/booking-docs/${req.file.filename}`,
      fileName: req.file.originalname,
      uploadedAt: new Date(),
    });
    await booking.save();

    return res.status(201).json({
      message: 'Document attached to load',
      document: booking.documents[booking.documents.length - 1].toObject(),
    });
  } catch (err) {
    console.error('[addBookingDocument] ERROR:', err);
    return res.status(500).json({ message: 'Failed to attach document to load', error: err.message });
  }
};

// GET /api/bookings/:id (get single booking)
const getBookingById = async (req, res) => {
  try {
    console.log(`\n====== [getBookingById] START ======`);
    console.log(`Booking ID: ${req.params.id}`);

    const booking = await Booking.findById(req.params.id)
      .populate('userId', 'firstName lastName email phone companyProfile adminProfile')
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName email phone' }
      })
      // Shipper-facing quote cards: only public profile fields, never bank/licence/DOB.
      .populate({
        path: 'quotations.driverId',
        select: 'userId averageRating totalRatings cdlClass endorsements qualification.yearsCdlExperience vehicleType',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'firstName lastName'
        }
      })
      .populate('truckId', 'registrationNumber truckType capacity');

    console.log(`[getBookingById] Booking found:`, !!booking);

    if (!booking) {
      console.log(`[getBookingById] Booking NOT found`);
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Extra debug: log raw booking object and quotations
    console.log(`[getBookingById] Raw booking object:`, JSON.stringify(booking, null, 2));
    if (booking.quotations) {
      booking.quotations.forEach((q, i) => {
        console.log(`[getBookingById] Quote #${i}:`, JSON.stringify(q, null, 2));
      });
    }
    console.log(`[getBookingById] Raw booking object keys:`, Object.keys(booking.toObject()));
    console.log(`====== [getBookingById] SUCCESS ======\n`);

    // Ensure selectedQuote is always present in the response and fully populated
    const bookingObj = booking.toObject();
    if (Array.isArray(bookingObj.quotations)) {
      let found = null;
      // If selectedQuote exists, try to match it in quotations by driverId or _id
      if (bookingObj.selectedQuote && bookingObj.selectedQuote.driverId) {
        found = bookingObj.quotations.find(q => {
          if (q.driverId && bookingObj.selectedQuote.driverId) {
            if (typeof q.driverId === 'object' && q.driverId._id && typeof bookingObj.selectedQuote.driverId === 'object' && bookingObj.selectedQuote.driverId._id) {
              return q.driverId._id.toString() === bookingObj.selectedQuote.driverId._id.toString();
            } else if (typeof q.driverId === 'string' && typeof bookingObj.selectedQuote.driverId === 'string') {
              return q.driverId === bookingObj.selectedQuote.driverId;
            }
          }
          // fallback: match by _id if present
          if (q._id && bookingObj.selectedQuote._id) {
            return q._id.toString() === bookingObj.selectedQuote._id.toString();
          }
          return false;
        });
      }
      // If not found, try to infer as before
      if (!found && bookingObj.status === 'CONFIRMED') {
        found = bookingObj.quotations.find(q => q.selected);
        if (!found && bookingObj.driverId) {
          found = bookingObj.quotations.find(q => {
            if (q.driverId && bookingObj.driverId) {
              if (typeof q.driverId === 'object' && q.driverId._id && typeof bookingObj.driverId === 'object' && bookingObj.driverId._id) {
                return q.driverId._id.toString() === bookingObj.driverId._id.toString();
              } else if (typeof q.driverId === 'string' && typeof bookingObj.driverId === 'string') {
                return q.driverId === bookingObj.driverId;
              }
            }
            return false;
          });
        }
        if (!found && bookingObj.quotations.length === 1) {
          found = bookingObj.quotations[0];
        }
      }
      if (found) bookingObj.selectedQuote = found;
    }
    return res.json(bookingObj);
  } catch (err) {
    console.error(`[getBookingById] Error:`, err.message);
    return res.status(500).json({ message: 'Failed to fetch booking', error: err.message });
  }
};

// Diagnostic: GET /api/bookings/:id/debug (get booking with full logging)
const debugBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).lean();
    console.log(`[DEBUG] Raw booking from DB:`, JSON.stringify(booking, null, 2));
    return res.json({
      message: 'Debug info',
      bookingId: booking?._id,
      status: booking?.status,
      quotationsCount: booking?.quotations?.length || 0,
      quotations: booking?.quotations || [],
      rateConfirmationStatus: booking?.rateConfirmation?.status
    });
  } catch (err) {
    console.error(`[DEBUG] Error:`, err.message);
    return res.status(500).json({ message: 'Debug error', error: err.message });
  }
};

const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id })
      .populate('userId', 'firstName lastName email phone')
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName phone' },
      })
      .populate('truckId', 'registrationNumber truckType capacity')
      .sort({ createdAt: -1 });
    // console.log(`getMyBookings] `User ${req.user._id}` - `found  `${bookings.length} bookings``);
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch bookings', error: err.message });
  }
};

module.exports = {
  getMyBookings,
  getAllBookings,
  createBooking,
  submitQuote,
  selectQuote,
  approveRateConfirmation,
  userSignRateConfirmation,
  driverAcceptRateConfirmation,
  driverAcknowledgeRateConfirmation,
  addBookingDocument,
  getBookingById,
  getAvailableBookings,
  debugBooking,
  getDriverConfirmations,
  getBookingRaw,
  approveBooking,
  rejectBooking,
};