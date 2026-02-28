const Settlement = require('../models/Settlement');
const Invoice = require('../models/Invoice');
const Driver = require('../models/Driver');
const { calculateSettlement } = require('../utils/settlement');

const generateSettlement = async (req, res) => {
  try {
    const { driverId } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver)
      return res.status(404).json({ message: "Driver not found" });

    // Prevent duplicate settlement
    const existingSettlement = await Settlement.findOne({
      driver: driverId,
      status: { $in: ['pending', 'approved'] }
    });

    if (existingSettlement) {
      return res.status(400).json({
        message: "Existing settlement already pending or approved"
      });
    }

    const invoices = await Invoice.find({
      driver: driverId,
      status: 'paid',
      settled: false
    });

    if (invoices.length === 0) {
      return res.status(400).json({
        message: "No invoices available for settlement"
      });
    }

    let totalInvoiceAmount = 0;
    let totalPlatformFee = 0;
    let totalDriverPayout = 0;

    invoices.forEach(invoice => {
      const { platformFee, driverPayout } =
        calculateSettlement(invoice.totalAmount, driver.planPercentage);

      totalInvoiceAmount += invoice.totalAmount;
      totalPlatformFee += platformFee;
      totalDriverPayout += driverPayout;
    });

    const settlement = await Settlement.create({
      driver: driverId,
      invoices: invoices.map(inv => inv._id),
      totalInvoiceAmount,
      totalPlatformFee,
      totalDriverPayout,
      status: 'pending'
    });

    await Invoice.updateMany(
      { _id: { $in: invoices.map(inv => inv._id) } },
      { settled: true }
    );

    res.json(settlement);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Settlement generation failed" });
  }
};

const getAllSettlements = async (req, res) => {
  const settlements = await Settlement.find()
    .populate({
      path: 'driver',
      populate: { path: 'userId' }
    })
    .populate('invoices')
    .sort({ createdAt: -1 });

  res.json(settlements);
};

const approveSettlement = async (req, res) => {
  const settlement = await Settlement.findById(req.params.id);

  if (!settlement)
    return res.status(404).json({ message: "Settlement not found" });

  settlement.status = 'approved';
  await settlement.save();

  res.json(settlement);
};

const markSettlementPaid = async (req, res) => {
  const settlement = await Settlement.findById(req.params.id);

  if (!settlement)
    return res.status(404).json({ message: "Settlement not found" });

  settlement.status = 'paid';
  settlement.payoutInfo = {
    method: req.body.method || 'NEFT',
    transactionId: req.body.transactionId,
    paidAt: new Date()
  };

  await settlement.save();

  res.json(settlement);
};

const getDriverSettlements = async (req, res) => {
  try {
    // Find driver profile using logged-in user id
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver)
      return res.status(404).json({ message: "Driver profile not found" });

    const settlements = await Settlement.find({
      driver: driver._id
    })
      .populate('invoices')
      .sort({ createdAt: -1 });

    res.json(settlements);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch settlements" });
  }
};

const getDriverEarningsSummary = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const driverId = driver._id;

    // 1️⃣ Total Paid Earnings
    const paidSettlements = await Settlement.find({
      driver: driverId,
      status: 'paid'
    });

    const totalPaid = paidSettlements.reduce(
      (sum, s) => sum + s.totalDriverPayout,
      0
    );

    // 2️⃣ Pending Earnings (approved but not paid)
    const pendingSettlements = await Settlement.find({
      driver: driverId,
      status: { $in: ['pending', 'approved'] }
    });

    const pendingAmount = pendingSettlements.reduce(
      (sum, s) => sum + s.totalDriverPayout,
      0
    );

    res.json({
      totalPaid,
      pendingAmount,
      settlementCount: paidSettlements.length
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch earnings summary" });
  }
};

module.exports = {
  generateSettlement,
  getAllSettlements,
  approveSettlement,
  markSettlementPaid,
  getDriverSettlements,
  getDriverEarningsSummary
};