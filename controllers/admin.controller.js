const User = require('../models/User');
const Invoice = require('../models/Invoice');

// Get all users with role=user (shippers) and booking stats
const getAllShippers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('-passwordHash');
    // For each user, get company name, total bookings, active bookings, registered date
    const userStats = await Promise.all(users.map(async (user) => {
      const totalBookings = await Booking.countDocuments({ userId: user._id });
      const activeBookings = await Booking.countDocuments({ userId: user._id, status: { $in: ['OPEN_FOR_QUOTES', 'CONFIRMED', 'IN_PROGRESS'] } });
      return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        companyName: user.companyProfile?.companyName || '',
        totalBookings,
        activeBookings,
        registeredDate: user.createdAt,
      };
    }));
    return res.json({ users: userStats });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getApprovedDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find({ approvalStatus: 'approved' })
      .populate('userId');

    const enrichedDrivers = await Promise.all(
      drivers.map(async (driver) => {

        const unpaidInvoices = await Invoice.find({
          driver: driver._id,
          status: 'paid',
          settled: false
        });

        const unpaidInvoiceCount = unpaidInvoices.length;

        const unsettledAmount = unpaidInvoices.reduce(
          (sum, invoice) => sum + invoice.totalAmount,
          0
        );

        return {
          ...driver.toObject(),
          unpaidInvoiceCount,
          unsettledAmount,
          planPercentage: driver.planPercentage || 0
        };
      })
    );

    res.json({ drivers: enrichedDrivers });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
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
const Truck = require('../models/Truck');

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





const getDashboardStats = async (req, res) => {
  try {

    const activeDrivers = await Driver.countDocuments({ isOnline: true });

    const activeLoads = await Booking.countDocuments({
      status: { $in: ['CONFIRMED', 'IN_PROGRESS'] }
    });

    const pendingPods = await Trip.countDocuments({
      podStatus: 'pending'
    });

    const driversAwaitingApproval =
      await Driver.countDocuments({ approvalStatus: 'pending' });

    const revenueAgg = await Invoice.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    res.json({
      stats: {
        activeDrivers,
        activeLoads,
        pendingPods,
        revenue
      },
      pendingActions: {
        driversAwaitingApproval
      }
    });

  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ message: "Dashboard fetch failed" });
  }
};

const getAllTrucks = async (req, res) => {
  try {
    const trucks = await Truck.find()
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName phone email' },
      })
      .sort({ createdAt: -1 });

    return res.json({ trucks });
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
  rejectDriver,
  getAllShippers,
  getDashboardStats,
  getAllTrucks,
};
