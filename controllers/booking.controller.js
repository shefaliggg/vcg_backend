const { createAndSendNotification } = require('../utils/notificationService');

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
// GET /api/bookings/for-driver - bookings for the logged-in driver where user has signed
const getDriverConfirmations = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    const driverId = driver._id;

    const bookings = await Booking.find({
      driverId: driverId,
      'rateConfirmation.status': 'user_signed'
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
const User = require('../models/User');
const Driver = require('../models/Driver');


const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getAdminProfile = async () => {
  const adminUser = await User.findOne({ role: 'admin', 'adminProfile.dispatcherEmail': { $exists: true } });
  return adminUser?.adminProfile || null;
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

    const bookings = await Booking.find({
      status: 'OPEN_FOR_QUOTES',

      // Exclude bookings where this driver already quoted
      quotations: {
        $not: {
          $elemMatch: { driverId: driverId }
        }
      }
    })
      .select('-quotations')
      .sort({ createdAt: -1 });

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
    const { shipper, consignee, pickupLocation, deliveryLocation, pickupDate, deliveryDate, truckType, loadDetails } = req.body;

    // Validate required fields (shipper/consignee optional for testing)
    if (!pickupLocation || !deliveryLocation || !pickupDate || !truckType || !loadDetails || !loadDetails.weight) {
      return res.status(400).json({ message: 'Missing required fields: pickupLocation, deliveryLocation, pickupDate, truckType, loadDetails.weight' });
    }

    const booking = new Booking({
      userId: req.user._id,
      shipper: shipper || { name: 'TBD', phone: 'TBD' },
      consignee: consignee || { name: 'TBD', phone: 'TBD' },
      pickupLocation,
      deliveryLocation,
      pickupDate,
      deliveryDate,
      truckType,
      loadDetails,
      status: 'OPEN_FOR_QUOTES',
      quotations: [],
      rateConfirmation: { status: 'not_generated' }
    });
    await booking.save();
    return res.status(201).json({ bookingId: booking._id, status: 'OPEN_FOR_QUOTES' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create booking', error: err.message });
  }
};

// POST /api/bookings/:id/quote (driver or admin submits quote)
const submitQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const { price, notes, driverId } = req.body;

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
      title: "New Quote Received",
      body: "A driver has submitted a quote for your booking.",
      data: {
        type: "quote_submitted",
        bookingId: booking._id
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
    };

    booking.driverId = selectedQuote.driverId;
    booking.status = 'CONFIRMED';

    // 🔥 IMPORTANT: DO NOT GENERATE PDF HERE
    booking.rateConfirmation = {
      status: 'awaiting_user_signature',
      driverId: selectedQuote.driverId,
      amount: selectedQuote.price,
      generatedAt: new Date(),
    };

    await booking.save();

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
  userSignaturePath = null,
  driverSignaturePath = null
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

  const sectionSpacing = () => doc.moveDown(1);

  const labelValue = (label, value) => {
    doc.fontSize(10)
      .fillColor(grey)
      .text(label.toUpperCase())
      .moveDown(0.2)
      .fontSize(12)
      .fillColor(primary)
      .text(value || 'N/A')
      .moveDown(0.8);
  };

  /* ================= HEADER ================= */

  doc.fontSize(22).font('Helvetica-Bold').text('RATE CONFIRMATION', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica')
    .text(`Booking ID: ${booking._id}`, { align: 'center' })
    .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });

  sectionSpacing();

  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ddd').stroke();
  sectionSpacing();

  /* ================= CUSTOMER ================= */

  doc.fontSize(14).font('Helvetica-Bold').text('CUSTOMER INFORMATION');
  doc.moveDown(0.5);

  const cp = user.companyProfile || {};

  labelValue('Company', cp.companyName || `${user.firstName} ${user.lastName}`);
  labelValue('Email', cp.email || user.email);
  labelValue('Phone', cp.phone || user.phone);
  if (cp.billingAddress) labelValue('Billing Address', cp.billingAddress);

  sectionSpacing();

  /* ================= ROUTE ================= */

  doc.fontSize(14).font('Helvetica-Bold').text('ROUTE DETAILS');
  doc.moveDown(0.5);

  labelValue('Pickup Location', booking.pickupLocation?.address);
  labelValue('Delivery Location', booking.deliveryLocation?.address);
  labelValue('Pickup Date', booking.pickupDate ? new Date(booking.pickupDate).toDateString() : '');

  if (booking.deliveryDate) {
    labelValue('Delivery Date', new Date(booking.deliveryDate).toDateString());
  }

  sectionSpacing();

  /* ================= LOAD DETAILS ================= */

  doc.fontSize(14).font('Helvetica-Bold').text('LOAD DETAILS');
  doc.moveDown(0.5);

  labelValue('Truck Type', booking.truckType);
  labelValue('Weight', booking.loadDetails?.weight);
  labelValue('Commodity', booking.loadDetails?.commodity || 'General Freight');

  sectionSpacing();

  /* ================= DRIVER ================= */

  doc.fontSize(14).font('Helvetica-Bold').text('DRIVER INFORMATION');
  doc.moveDown(0.5);

  if (driver) {
    labelValue('Driver Name', `${driver.userId?.firstName} ${driver.userId?.lastName}`);
    labelValue('Phone', driver.userId?.phone);
    labelValue('Vehicle Number', driver.vehicleNumber);
  }

  sectionSpacing();

  /* ================= RATE ================= */

  doc.fontSize(14).font('Helvetica-Bold').text('RATE INFORMATION');
  doc.moveDown(0.5);

  if (selectedQuote) {
    labelValue('Rate', `${selectedQuote.price} ${selectedQuote.currency || 'USD'}`);
    if (selectedQuote.notes) {
      labelValue('Notes', selectedQuote.notes);
    }
  }

  sectionSpacing();
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ddd').stroke();
  sectionSpacing();

  /* ================= AGREEMENT TEXT ================= */

  doc.fontSize(10)
    .fillColor(grey)
    .text(
      'By signing below, both parties agree to the terms and conditions outlined in this rate confirmation. The carrier agrees to transport the freight as described above in compliance with all applicable regulations.',
      { align: 'left' }
    );

  sectionSpacing();
  sectionSpacing();

  /* ================= SIGNATURE SECTION ================= */

  doc.fontSize(12).fillColor(primary).font('Helvetica-Bold').text('SIGNATURES');
  doc.moveDown(1);

  const startY = doc.y;

  // USER SIGNATURE
  doc.fontSize(10).fillColor(grey).text('Customer Signature:', 40, startY);

  if (userSignaturePath && fs.existsSync(userSignaturePath)) {
    doc.image(userSignaturePath, 40, startY + 15, { width: 180 });
  } else {
    doc.moveTo(40, startY + 40).lineTo(220, startY + 40).stroke();
  }

  doc.fontSize(9).fillColor(grey)
    .text('Signed By Customer', 40, startY + 60);

  // DRIVER SIGNATURE
  doc.fontSize(10).fillColor(grey).text('Carrier Signature:', 320, startY);

  if (driverSignaturePath && fs.existsSync(driverSignaturePath)) {
    doc.image(driverSignaturePath, 320, startY + 15, { width: 180 });
  } else {
    doc.moveTo(320, startY + 40).lineTo(500, startY + 40).stroke();
  }

  doc.fontSize(9).fillColor(grey)
    .text('Signed By Carrier', 320, startY + 60);

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { filePath, fileUrl };
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

// POST /api/bookings/:id/rate-confirmation/driver-accept (driver accepts)
const driverAcceptRateConfirmation = async (req, res) => {
  console.log("🔥 DRIVER ACCEPT ROUTE HIT");
  try {
    const { id } = req.params;
    const { signatureUrl } = req.body;
    console.log('[driverAcceptRateConfirmation] bookingId:', id);
    const booking = await Booking.findById(id);
    console.log('[driverAcceptRateConfirmation] booking:', booking);
    if (booking && booking.rateConfirmation) {
      console.log('[driverAcceptRateConfirmation] booking.rateConfirmation.status:', booking.rateConfirmation.status);
    } else {
      console.log('[driverAcceptRateConfirmation] booking or booking.rateConfirmation is missing');
    }
    if (!booking) {
      console.error('[driverAcceptRateConfirmation] Booking not found');
      return res.status(404).json({ message: 'Booking not found' });
    }
    // Continue with normal logic
    if (booking.rateConfirmation.status !== 'user_signed') {
      console.error('[driverAcceptRateConfirmation] User must sign first:', booking.rateConfirmation.status);
      return res.status(400).json({ message: 'User must sign first' });
    }
    booking.rateConfirmation.status = 'driver_accepted';
    booking.rateConfirmation.driverSignatureUrl = signatureUrl || null;
    booking.rateConfirmation.driverAcceptedAt = new Date();
    booking.status = 'ACCEPTED';
    await booking.save();
    // Update Trip status to 'accepted'
    await createAndSendNotification({
      userId: booking.userId,
      title: "Driver Accepted Rate",
      body: "Driver accepted the rate confirmation. Trip is ready.",
      data: {
        type: "rate_accepted",
        bookingId: booking._id
      }
    });
    const Trip = require('../models/Trip');
    const trip = await Trip.findOne({ bookingId: booking._id, driverId: booking.driverId });
    if (trip) {
      trip.status = 'accepted';
      await trip.save();
      console.log('[driverAcceptRateConfirmation] Trip status updated to accepted:', trip._id);
    } else {
      console.error('[driverAcceptRateConfirmation] No Trip found for booking/driver when accepting rate confirmation');
    }
    console.log('[driverAcceptRateConfirmation] Booking accepted and saved');
    return res.json({ message: 'Driver accepted, booking ready for pickup', status: 'ACCEPTED' });
  } catch (err) {
    console.error('[driverAcceptRateConfirmation] ERROR:', err);
    return res.status(500).json({ message: 'Failed to accept', error: err.message });
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
      .populate({
        path: 'quotations.driverId',
        populate: {
          path: 'userId',
          model: 'User',
          select: 'firstName lastName email phone'
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
    const bookings = await Booking.find({ userId: req.user._id }).populate('userId', 'firstName lastName email phone').sort({ createdAt: -1 });
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
  userSignRateConfirmation,
  driverAcceptRateConfirmation,
  getBookingById,
  getAvailableBookings,
  debugBooking,
  getDriverConfirmations,
  getBookingRaw
};