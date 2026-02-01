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

const updateDriverProfile = async (req, res) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId);
    
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check if user owns this driver profile or is admin
    if (driver.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const { vehicleNumber, vehicleType, vehicleCapacity, licenseNumber, licenseExpiry } = req.body;

    if (vehicleNumber !== undefined) driver.vehicleNumber = vehicleNumber;
    if (vehicleType !== undefined) driver.vehicleType = vehicleType;
    if (vehicleCapacity !== undefined) driver.vehicleCapacity = vehicleCapacity;
    if (licenseNumber !== undefined) driver.licenseNumber = licenseNumber;
    if (licenseExpiry !== undefined) driver.licenseExpiry = licenseExpiry;

    await driver.save();

    return res.json({ success: true, data: driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
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

module.exports = { getDriverProfile, onboarding, updateDriverProfile, updateAvailability };
