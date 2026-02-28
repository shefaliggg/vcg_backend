const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const {
  generateSettlement,
  approveSettlement,
  markSettlementPaid,
  getAllSettlements,
  getDriverSettlements,
  getDriverEarningsSummary
} = require('../controllers/settlement.controller');

const router = express.Router();

// 🔹 Admin – Generate settlement for a driver
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  generateSettlement
);

// 🔹 Admin – Get all settlements
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  getAllSettlements
);

// 🔹 Admin – Approve settlement
router.put(
  '/:id/approve',
  requireAuth,
  requireRole('admin'),
  approveSettlement
);

// 🔹 Admin – Mark settlement as paid
router.put(
  '/:id/paid',
  requireAuth,
  requireRole('admin'),
  markSettlementPaid
);

// 🔹 Driver – View own settlements
router.get(
  '/driver/me',
  requireAuth,
  getDriverSettlements
);

router.get(
  '/driver/summary',
  requireAuth,
  getDriverEarningsSummary
);

module.exports = router;