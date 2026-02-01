const getApprovedDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ approvalStatus: 'approved' }).populate('userId', 'firstName lastName email phone role');
    return res.json({ drivers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getRejectedDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ approvalStatus: 'rejected' }).populate('userId', 'firstName lastName email phone role');
    return res.json({ drivers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const Trip = require('../models/Trip');

const getPendingDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ approvalStatus: 'pending' }).populate('userId', 'firstName lastName email phone role');
    return res.json({ drivers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const approveDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    driver.approvalStatus = 'approved';
    driver.isOnline = false;
    await driver.save();
    return res.json({ message: 'Driver approved', driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const rejectDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ message: 'Driver not found' });
    driver.approvalStatus = 'rejected';
    driver.isOnline = false;
    await driver.save();
    return res.json({ message: 'Driver rejected', driver });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { 
  getPendingDrivers, 
  getApprovedDrivers, 
  getRejectedDrivers, 
  approveDriver, 
  rejectDriver
};
