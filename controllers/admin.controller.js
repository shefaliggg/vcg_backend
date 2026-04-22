const User = require('../models/User');
const Invoice = require('../models/Invoice');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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

const getTruckById = async (req, res) => {
  try {
    const { id } = req.params;
    const truck = await Truck.findById(id)
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName phone email' },
      });

    if (!truck) {
      return res.status(404).json({ message: 'Truck not found' });
    }

    return res.json({ truck });
  } catch (err) {
    console.error('[getTruckById] Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const createDriverByAdmin = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      planType,
      planPercentage,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      role: 'driver',
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const resolvedPlanType = ['10', '12', '17', '20'].includes(String(planType))
      ? String(planType)
      : '10';
    const resolvedPlanPercentage = [10, 12, 17, 20].includes(Number(planPercentage))
      ? Number(planPercentage)
      : Number(resolvedPlanType);

    const driver = await Driver.create({
      userId: user._id,
      approvalStatus: 'incomplete',
      isOnline: false,
      planType: resolvedPlanType,
      planPercentage: resolvedPlanPercentage,
    });

    const apiBase = process.env.API_BASE_URL || 'http://54.174.219.57:5000';
    const verificationLink = `${apiBase}/api/auth/verify-email?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: 'VCG Transport <onboarding@resend.dev>',
        to: email,
        subject: 'Verify your driver account email',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Welcome to VCG Transport</h2>
            <p>Hello ${firstName},</p>
            <p>Your driver account has been created by admin. Please verify your email address to continue.</p>
            <p>
              <a href="${verificationLink}" style="display:inline-block;padding:10px 16px;background:#2fa084;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Verify Email
              </a>
            </p>
            <p>If the button does not work, copy and paste this link in your browser:</p>
            <p>${verificationLink}</p>
            <p>This link expires in 24 hours.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.warn('[createDriverByAdmin] Verification mail failed:', mailErr.message);
    }

    return res.status(201).json({
      message: 'Driver created successfully and verification email sent',
      driver,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('[createDriverByAdmin] Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const createShipperByAdmin = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already in use' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      passwordHash,
      role: 'user',
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const apiBase = process.env.API_BASE_URL || 'http://54.174.219.57:5000';
    const verificationLink = `${apiBase}/api/auth/verify-email?token=${verificationToken}`;

    try {
      await resend.emails.send({
        from: 'VCG Transport <onboarding@resend.dev>',
        to: email,
        subject: 'Verify your shipper account email',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Welcome to VCG Transport</h2>
            <p>Hello ${firstName},</p>
            <p>Your shipper account has been created by admin. Please verify your email address to continue.</p>
            <p>
              <a href="${verificationLink}" style="display:inline-block;padding:10px 16px;background:#2fa084;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
                Verify Email
              </a>
            </p>
            <p>If the button does not work, copy and paste this link in your browser:</p>
            <p>${verificationLink}</p>
            <p>This link expires in 24 hours.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.warn('[createShipperByAdmin] Verification mail failed:', mailErr.message);
    }

    return res.status(201).json({
      message: 'Shipper created successfully and verification email sent',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('[createShipperByAdmin] Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const createTruckByAdmin = async (req, res) => {
  try {
    const {
      registrationNumber,
      truckType,
      capacity,
      status,
      driverId,
      currentLocation,
      truckImageUrl,
    } = req.body;

    if (!registrationNumber || !truckType || capacity == null) {
      return res.status(400).json({ message: 'registrationNumber, truckType and capacity are required' });
    }

    const existingTruck = await Truck.findOne({ registrationNumber: registrationNumber.trim() });
    if (existingTruck) {
      return res.status(409).json({ message: 'Truck with this registration number already exists' });
    }

    const allowedStatuses = ['available', 'assigned', 'maintenance'];
    const resolvedStatus = allowedStatuses.includes(status) ? status : 'available';

    let resolvedDriverId = undefined;
    if (driverId) {
      const driver = await Driver.findById(driverId);
      if (!driver) {
        return res.status(404).json({ message: 'Selected driver not found' });
      }
      resolvedDriverId = driver._id;
    }

    const truck = await Truck.create({
      registrationNumber: registrationNumber.trim(),
      truckType: truckType.trim(),
      capacity: Number(capacity),
      status: resolvedStatus,
      driverId: resolvedDriverId,
      truckImageUrl: truckImageUrl || undefined,
      currentLocation: {
        address: currentLocation?.address || undefined,
        lat: currentLocation?.lat != null ? Number(currentLocation.lat) : undefined,
        lng: currentLocation?.lng != null ? Number(currentLocation.lng) : undefined,
      },
    });

    const populatedTruck = await Truck.findById(truck._id)
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'firstName lastName email phone' },
      });

    return res.status(201).json({
      message: 'Truck created successfully',
      truck: populatedTruck,
    });
  } catch (err) {
    console.error('[createTruckByAdmin] Error:', err);
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
  getTruckById,
  createDriverByAdmin,
  createShipperByAdmin,
  createTruckByAdmin,
};
