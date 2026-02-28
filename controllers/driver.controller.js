const Driver = require('../models/Driver');

const getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) {
      return res.status(404).json({ message: 'Driver record not found' });
    }
    return res.json({ success: true, data: driver });
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
    const { isOnline } = req.body;

    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check if user owns this driver profile
    if (driver.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    driver.isOnline = isOnline;
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
      ifscCode: req.body.ifscCode,
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


const User = require("../models/User");
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

module.exports = { getDriverProfile, onboarding, updateDriverProfile, updateAvailability, updateBankDetails, verifyBank, updateDriverProfile,updateLicenseInfo };
