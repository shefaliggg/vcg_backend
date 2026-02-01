// GET /api/bookings/for-driver - bookings for the logged-in driver where user has signed
const getDriverConfirmations = async (req, res) => {
  try {
    const driverId = req.user._id;
    const bookings = await Booking.find({
      'selectedQuote.driverId': driverId,
      'rateConfirmation.status': 'user_signed'
    })
      .populate('userId', 'firstName lastName email phone')
      .populate('selectedQuote.driverId', 'firstName lastName email phone')
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch driver confirmations', error: err.message });
  }
};
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

const buildRateConfirmationPdf = async ({ booking, user, adminProfile, driver, selectedQuote }) => {
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'rate-confirmations');
  ensureDir(uploadsDir);

  const fileName = `rate-confirmation-${booking._id}.pdf`;
  const filePath = path.join(uploadsDir, fileName);
  const fileUrl = `/uploads/rate-confirmations/${fileName}`;

  const doc = new PDFDocument({ margin: 36 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  const addSectionTitle = (title) => {
    doc.moveDown(0.5).fontSize(13).fillColor('#111').text(title, { underline: true });
    doc.moveDown(0.2);
  };

  const textRow = (label, value) => {
    doc.fontSize(11).fillColor('#000').text(`${label}: `, { continued: true, width: 540 }).font('Helvetica-Bold').text(value || 'N/A');
    doc.font('Helvetica');
  };

  doc.font('Helvetica-Bold').fontSize(16).text('Rate Confirmation', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Booking ID: ${booking._id}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown(0.5);

  addSectionTitle('Customer');
  const cp = user.companyProfile || {};
  textRow('Company', cp.companyName || `${user.firstName} ${user.lastName}`);
  textRow('Billing Address', cp.billingAddress || '');
  textRow('Email', cp.email || user.email);
  textRow('Phone', cp.phone || user.phone);
  if (cp.taxId) textRow('Tax ID', cp.taxId);

  addSectionTitle('Shipper');
  textRow('Name', booking.shipper?.name);
  textRow('Phone', booking.shipper?.phone);

  addSectionTitle('Consignee');
  textRow('Name', booking.consignee?.name);
  textRow('Phone', booking.consignee?.phone);

  addSectionTitle('Dispatcher / Sales');
  textRow('Dispatcher', adminProfile?.dispatcherName || '');
  textRow('Dispatcher Email', adminProfile?.dispatcherEmail || '');
  textRow('Dispatcher Phone', adminProfile?.dispatcherPhone || '');
  if (adminProfile?.salespersonName) textRow('Salesperson', adminProfile.salespersonName);
  if (adminProfile?.salespersonEmail) textRow('Salesperson Email', adminProfile.salespersonEmail);
  if (adminProfile?.salespersonPhone) textRow('Salesperson Phone', adminProfile.salespersonPhone);

  addSectionTitle('Driver & Equipment');
  if (driver) {
    textRow('Driver', driver.userId ? `${driver.userId.firstName} ${driver.userId.lastName}` : '');
    textRow('Driver Phone', driver.userId?.phone || '');
    textRow('Vehicle Number', driver.vehicleNumber || '');
    textRow('Truck Type', driver.vehicleType || booking.truckType || '');
  } else {
    textRow('Driver', 'Unassigned');
  }

  addSectionTitle('Route');
  textRow('Pickup', booking.pickupLocation?.address);
  textRow('Drop', booking.deliveryLocation?.address);
  textRow('Pickup Date', booking.pickupDate ? new Date(booking.pickupDate).toDateString() : '');
  if (booking.deliveryDate) textRow('Delivery Date', new Date(booking.deliveryDate).toDateString());

  addSectionTitle('Rate');
  if (selectedQuote) {
    textRow('Amount', `${selectedQuote.amount} ${selectedQuote.currency || 'INR'}`);
    textRow('Quoted By', selectedQuote.quotedBy || '');
    if (selectedQuote.notes) textRow('Notes', selectedQuote.notes);
  }

  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  return { filePath, fileUrl };
};

const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ userId: req.user._id }).populate('userId', 'firstName lastName email phone').sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch bookings', error: err.message });
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
    const bookings = await Booking.find({ status: 'pending' })
      .select('-quotations')
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch available bookings', error: err.message });
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
      status: 'pending',
      quotations: [],
      rateConfirmation: { status: 'not_generated' }
    });
    await booking.save();
    return res.status(201).json({ bookingId: booking._id, status: 'pending' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create booking', error: err.message });
  }
};

// POST /api/bookings/:id/quote (driver or admin submits quote)
const submitQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes, driverId } = req.body;
    
    console.log(`\n====== [submitQuote] START ======`);
    console.log(`Booking ID: ${id}`);
    console.log(`Amount: ${amount}, Notes: ${notes}`);
    console.log(`User ID: ${req.user._id}, Role: ${req.user.role}`);
    
    if (!amount || amount <= 0) {
      console.log('[submitQuote] Invalid amount');
      return res.status(400).json({ message: 'Invalid quote amount' });
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
    const quote = {
      quotedBy,
      userId: req.user._id,
      driverId: quotedBy === 'driver' ? req.user._id : driverId,
      amount,
      currency: 'INR',
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

    if (quoteIndex < 0 || quoteIndex >= booking.quotations.length) {
      return res.status(400).json({ message: 'Invalid quote index' });
    }

    const selectedQuote = booking.quotations[quoteIndex];
    booking.selectedQuote = {
      quotedBy: selectedQuote.quotedBy,
      driverId: selectedQuote.driverId,
      amount: selectedQuote.amount,
      currency: selectedQuote.currency,
      notes: selectedQuote.notes,
      selectedAt: new Date()
    };
    booking.status = 'confirmed';

    // Generate rate confirmation PDF
    const user = await User.findById(booking.userId);
    const adminProfile = await getAdminProfile();
    const driver = selectedQuote.driverId ? await Driver.findById(selectedQuote.driverId).populate('userId') : null;

    const { fileUrl, filePath } = await buildRateConfirmationPdf({
      booking,
      user,
      adminProfile,
      driver,
      selectedQuote
    });

    booking.rateConfirmation = {
      status: 'generated',
      pdfUrl: fileUrl,
      generatedAt: new Date()
    };

    await booking.save();
    return res.json({ message: 'Quote selected, PDF generated', pdfUrl: fileUrl });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to select quote', error: err.message });
  }
};

// POST /api/bookings/:id/rate-confirmation/user-sign (user signs)
const userSignRateConfirmation = async (req, res) => {
  try {
    const { id } = req.params;
    const { signatureUrl } = req.body;

    if (!signatureUrl) {
      return res.status(400).json({ message: 'Signature URL required' });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.rateConfirmation.status !== 'generated') {
      return res.status(400).json({ message: 'Rate confirmation must be generated before signing' });
    }

    booking.rateConfirmation.status = 'user_signed';
    booking.rateConfirmation.userSignatureUrl = signatureUrl;
    booking.rateConfirmation.userSignedAt = new Date();

    await booking.save();
    return res.json({ message: 'User signature recorded', status: booking.rateConfirmation.status });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to sign', error: err.message });
  }
};

// POST /api/bookings/:id/rate-confirmation/driver-accept (driver accepts)
const driverAcceptRateConfirmation = async (req, res) => {
  try {
    const { id } = req.params;
    const { signatureUrl } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.rateConfirmation.status !== 'user_signed') {
      return res.status(400).json({ message: 'User must sign first' });
    }

    booking.rateConfirmation.status = 'driver_accepted';
    booking.rateConfirmation.driverSignatureUrl = signatureUrl || null;
    booking.rateConfirmation.driverAcceptedAt = new Date();
    booking.status = 'accepted';

    await booking.save();
    return res.json({ message: 'Driver accepted, booking ready for pickup', status: 'accepted' });
  } catch (err) {
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
      .populate('truckId', 'registrationNumber truckType capacity');
    
    console.log(`[getBookingById] Booking found:`, !!booking);
    
    if (!booking) {
      console.log(`[getBookingById] Booking NOT found`);
      return res.status(404).json({ message: 'Booking not found' });
    }
    
    console.log(`[getBookingById] Quotations count in response:`, booking?.quotations?.length || 0);
    console.log(`[getBookingById] Full quotations:`, JSON.stringify(booking?.quotations, null, 2));
    console.log(`[getBookingById] Raw booking object keys:`, Object.keys(booking.toObject()));
    console.log(`====== [getBookingById] SUCCESS ======\n`);
    
    return res.json(booking);
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
  getDriverConfirmations
};