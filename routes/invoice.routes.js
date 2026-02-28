const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { getAllInvoices,getMyInvoices,selectPaymentMethod,payInvoice,confirmBankTransfer } = require('../controllers/invoice.controller');

const { requireRole } = require('../middlewares/role.middleware');
const router = express.Router();

// GET /api/invoices/my
router.get('/', requireAuth, requireRole('admin'), getAllInvoices);
router.get('/my', requireAuth, getMyInvoices);

router.put('/:id/payment-method', requireAuth, selectPaymentMethod);
router.post('/:id/pay', requireAuth, payInvoice);
router.put("/:id/confirm-bank-transfer",requireAuth, requireRole("admin"), confirmBankTransfer);
module.exports = router;