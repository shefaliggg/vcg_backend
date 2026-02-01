const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { getMyInvoices } = require('../controllers/invoice.controller');

const router = express.Router();

// GET /api/invoices/my
router.get('/my', requireAuth, getMyInvoices);

module.exports = router;