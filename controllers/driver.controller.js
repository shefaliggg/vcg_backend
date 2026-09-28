const Driver = require('../models/Driver');
const Truck = require('../models/Truck');
const Document = require('../models/Document');
const User = require('../models/User');

const getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id }).populate('truckId');
    if (!driver) {
      return res.status(404).json({ message: 'Driver record not found' });
    }
    const documents = await Document.find({ driverId: driver._id });
    return res.json({ success: true, data: { ...driver.toObject(), documents } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getDriverDocuments = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });
    const documents = await Document.find({ driverId: driver._id });
    return res.json({ success: true, data: documents });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const relativeUploadPath = (file) => (file ? `uploads/drivers/${file.filename}` : null);

const upsertDocument = async (driverId, ownerType, docType, file, extra = {}) => {
  if (!file) return;
  await Document.findOneAndUpdate(
    { driverId, docType },
    {
      driverId,
      ownerType,
      docType,
      fileUrl: relativeUploadPath(file),
      fileName: file.originalname,
      status: 'pending',
      rejectionReason: undefined,
      reviewedAt: undefined,
      reviewedBy: undefined,
      ...extra,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const advanceOnboardingStep = (driver, fromStep, toStep) => {
  if (driver.onboardingStep === fromStep) {
    driver.onboardingStep = toStep;
  }
};

const submitDriverInfo = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    const { firstName, lastName, dateOfBirth, address } = req.body;
    if (!firstName || !lastName || !dateOfBirth) {
      return res.status(400).json({ message: 'First name, last name, and date of birth are required' });
    }
    if (!address || !address.line1 || !address.city || !address.state || !address.zip) {
      return res.status(400).json({ message: 'Full address (line1, city, state, zip) is required' });
    }

    await User.findByIdAndUpdate(req.user._id, { firstName, lastName });

    driver.dateOfBirth = dateOfBirth;
    driver.address = { line1: address.line1, city: address.city, state: address.state, zip: address.zip };
    advanceOnboardingStep(driver, 'driver_info', 'cdl_info');
    await driver.save();

    return res.status(200).json({ success: true, data: driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const submitCdlInfo = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    const { licenseNumber, cdlState, cdlClass, endorsements, licenseExpiry } = req.body;
    if (!licenseNumber || !cdlState || !cdlClass || !licenseExpiry) {
      return res.status(400).json({ message: 'CDL number, issuing state, class, and expiration date are required' });
    }

    driver.licenseNumber = licenseNumber.trim();
    driver.cdlState = cdlState.trim();
    driver.cdlClass = cdlClass;
    driver.licenseExpiry = licenseExpiry;
    if (endorsements) {
      driver.endorsements = Array.isArray(endorsements) ? endorsements : [endorsements];
    }

    const cdlFile = req.file || req.files?.cdlDocument?.[0];
    await upsertDocument(driver._id, 'driver', 'cdl', cdlFile, { expiresAt: licenseExpiry });

    advanceOnboardingStep(driver, 'cdl_info', 'qualification');
    await driver.save();

    return res.status(200).json({ success: true, data: driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const submitQualification = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    let qualification = req.body.qualification;
    if (typeof qualification === 'string') {
      try { qualification = JSON.parse(qualification); } catch { qualification = {}; }
    }
    qualification = qualification || {};

    driver.qualification = {
      yearsCdlExperience: qualification.yearsCdlExperience ?? driver.qualification?.yearsCdlExperience,
      medicalCertStatus: qualification.medicalCertStatus ?? driver.qualification?.medicalCertStatus,
      medicalCertExpiry: qualification.medicalCertExpiry ?? driver.qualification?.medicalCertExpiry,
      mvrConsentGiven: !!qualification.mvrConsentGiven,
      mvrConsentAt: qualification.mvrConsentGiven && !driver.qualification?.mvrConsentGiven
        ? new Date()
        : driver.qualification?.mvrConsentAt,
      roadTestStatus: qualification.roadTestStatus ?? driver.qualification?.roadTestStatus ?? 'not_completed',
      roadTestNotes: qualification.roadTestNotes ?? driver.qualification?.roadTestNotes,
    };

    const medicalCertFile = req.file || req.files?.medicalCertDocument?.[0];
    await upsertDocument(driver._id, 'driver', 'medical_cert', medicalCertFile, {
      expiresAt: driver.qualification.medicalCertExpiry,
    });

    advanceOnboardingStep(driver, 'qualification', 'truck_info');
    await driver.save();

    return res.status(200).json({ success: true, data: driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const submitTruckInfo = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    const { unitNumber, vin, plateNumber, plateState, truckType, make, model, year } = req.body;
    if (!vin || !plateNumber || !plateState || !truckType || !make || !model || !year) {
      return res.status(400).json({ message: 'VIN, plate number/state, truck type, make, model, and year are required' });
    }

    const truckFields = { unitNumber, vin: vin.trim().toUpperCase(), plateNumber, plateState, truckType, make, model, year };

    let truck;
    if (driver.truckId) {
      truck = await Truck.findByIdAndUpdate(driver.truckId, truckFields, { new: true });
    } else {
      truck = await Truck.create({ driverId: driver._id, ...truckFields });
      driver.truckId = truck._id;
    }

    // Deprecated mirror fields for truck-admin-web compatibility
    driver.vehicleNumber = plateNumber;
    driver.vehicleType = truckType;

    advanceOnboardingStep(driver, 'truck_info', 'truck_documents');
    await driver.save();

    return res.status(200).json({ success: true, data: { driver, truck } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const TRUCK_DOC_FIELD_TO_TYPE = {
  registration: 'vehicle_registration',
  insurance: 'insurance',
  inspection: 'inspection',
  operatingAuthority: 'operating_authority',
};

const submitTruckDocuments = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    for (const [field, docType] of Object.entries(TRUCK_DOC_FIELD_TO_TYPE)) {
      const file = req.files?.[field]?.[0];
      if (file) {
        await upsertDocument(driver._id, 'truck', docType, file);
      }
    }

    advanceOnboardingStep(driver, 'truck_documents', 'agreements');
    await driver.save();

    const documents = await Document.find({ driverId: driver._id });
    return res.status(200).json({ success: true, data: { driver, documents } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const submitAgreements = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    const { tos, privacyPolicy, driverAgreement, mvrConsent } = req.body;
    if (!tos || !privacyPolicy || !driverAgreement || !mvrConsent) {
      return res.status(400).json({ message: 'All agreements must be accepted to submit for verification' });
    }

    const now = new Date();
    driver.agreements = {
      tos: { accepted: true, acceptedAt: now, version: driver.agreements?.tos?.version || 'v1' },
      privacyPolicy: { accepted: true, acceptedAt: now, version: driver.agreements?.privacyPolicy?.version || 'v1' },
      driverAgreement: { accepted: true, acceptedAt: now, version: driver.agreements?.driverAgreement?.version || 'v1' },
      mvrConsent: { accepted: true, acceptedAt: now, version: driver.agreements?.mvrConsent?.version || 'v1' },
    };

    const documents = await Document.find({ driverId: driver._id });
    const hasDocType = (docType) => documents.some((d) => d.docType === docType);

    const missing = [];
    if (!driver.licenseNumber || !driver.cdlClass) missing.push('cdlInfo');
    if (!hasDocType('cdl')) missing.push('cdlDocument');
    if (!driver.truckId) missing.push('truckInfo');
    if (!hasDocType('vehicle_registration')) missing.push('vehicleRegistrationDocument');
    if (!hasDocType('insurance')) missing.push('insuranceDocument');

    if (missing.length) {
      return res.status(400).json({ message: 'Onboarding is incomplete', missing });
    }

    driver.approvalStatus = 'pending';
    driver.onboardingStep = 'submitted';
    await driver.save();

    return res.status(200).json({ success: true, message: 'Onboarding submitted. Await admin review.', data: driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const onboarding = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver record not found' });

    // Store only the relative path from uploads directory
    const licenseImageUrl = req.files?.license?.[0]?.path
      ? `uploads/drivers/${req.files.license[0].filename}`
      : null;
    const rcImageUrl = req.files?.rc?.[0]?.path
      ? `uploads/drivers/${req.files.rc[0].filename}`
      : null;

    const { vehicleNumber, vehicleType, vehicleCapacity, licenseNumber, licenseExpiry } = req.body;

    if (!licenseNumber || !licenseNumber.trim()) {
      return res.status(400).json({ message: 'License number is required' });
    }
    if (!licenseExpiry || !licenseExpiry.trim()) {
      return res.status(400).json({ message: 'License expiry date is required' });
    }
    if (!vehicleNumber || !vehicleNumber.trim()) {
      return res.status(400).json({ message: 'Vehicle number is required' });
    }
    if (!vehicleType || !vehicleType.trim()) {
      return res.status(400).json({ message: 'Vehicle type is required' });
    }
    if (!vehicleCapacity || !vehicleCapacity.trim()) {
      return res.status(400).json({ message: 'Vehicle capacity is required' });
    }
    if (!licenseImageUrl) {
      return res.status(400).json({ message: 'License image is required' });
    }
    if (!rcImageUrl) {
      return res.status(400).json({ message: 'RC image is required' });
    }

    driver.licenseNumber = licenseNumber.trim();
    driver.licenseExpiry = licenseExpiry.trim();
    driver.licenseImageUrl = licenseImageUrl;
    driver.rcImageUrl = rcImageUrl;
    driver.vehicleNumber = vehicleNumber.trim();
    driver.vehicleType = vehicleType.trim();
    driver.vehicleCapacity = vehicleCapacity.trim();
    driver.approvalStatus = 'pending';
    await driver.save();

    return res.status(200).json({ message: 'Onboarding submitted. Await admin review.', driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const updateLicenseInfo = async (req, res) => {
  try {
    const userId = req.user._id;

    const { licenseNumber, licenseExpiry } = req.body;

    const driver = await Driver.findOne({ userId });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'Driver profile not found'
      });
    }

    driver.licenseNumber = licenseNumber ?? driver.licenseNumber;
    driver.licenseExpiry = licenseExpiry ?? driver.licenseExpiry;

    await driver.save();

    res.status(200).json({
      success: true,
      driver
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Failed to update license'
    });
  }
};


const updateAvailability = async (req, res) => {
  try {
    const { driverId } = req.params;
    // New clients send `status`; legacy clients send a boolean `isOnline`.
    const VALID_STATUSES = ['online', 'offline', 'busy'];
    const status = req.body.status !== undefined
      ? req.body.status
      : (req.body.isOnline ? 'online' : 'offline');
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid availability status' });
    }

    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check if user owns this driver profile
    if (driver.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    driver.availabilityStatus = status;
    driver.isOnline = status === 'online';
    await driver.save();

    return res.json({ success: true, data: driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const updateBankDetails = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver)
      return res.status(404).json({ message: "Driver not found" });

    driver.bankDetails = {
      accountHolderName: req.body.accountHolderName,
      bankName: req.body.bankName,
      accountNumber: req.body.accountNumber,
      routingNumber: req.body.routingNumber,
      isVerified: false
    };

    await driver.save();

    res.json({ message: "Bank details updated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update bank details" });
  }
};

const verifyBank = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    driver.bankDetails.isVerified = true;
    await driver.save();

    res.json({ success: true, message: "Bank verified successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Verification failed" });
  }
};


const updateDriverProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log("JWT USER ID:", req.user.id);
    console.log("Driver in DB:", await Driver.find());

    const {
      firstName,
      lastName,
      phone,
      vehicleNumber,
      vehicleType,
      vehicleCapacity,
    } = req.body;

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, phone },
      { new: true }
    );

    // 🔥 Use findOne FIRST
    let driver = await Driver.findOne({ userId: userId });

    console.log("USER ID:", userId);
    console.log("Driver found:", driver);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found"
      });
    }

    driver.vehicleNumber = vehicleNumber ?? driver.vehicleNumber;
    driver.vehicleType = vehicleType ?? driver.vehicleType;
    driver.vehicleCapacity = vehicleCapacity ?? driver.vehicleCapacity;

    await driver.save();

    res.json({
      success: true,
      driver,
      user: updatedUser
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Update failed"
    });
  }
};

module.exports = {
  getDriverProfile,
  getDriverDocuments,
  onboarding,
  updateDriverProfile,
  updateAvailability,
  updateBankDetails,
  verifyBank,
  updateLicenseInfo,
  submitDriverInfo,
  submitCdlInfo,
  submitQualification,
  submitTruckInfo,
  submitTruckDocuments,
  submitAgreements,
};
