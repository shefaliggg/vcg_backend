const express = require('express');
const router = express.Router();
const { register, login, me, adminLogin, changeAdminPassword, forgotPassword, verifyOtpAndResetPassword, verifyEmailByToken } = require('../controllers/auth.controller');
const { requireRole } = require('../middlewares/role.middleware');
const { sendOtp, verifyOtp } = require('../controllers/otpAuth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.put('/admin/password', requireAuth, requireRole('admin'), changeAdminPassword);
router.get('/me', requireAuth, me);
router.get('/verify-email', verifyEmailByToken);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyOtpAndResetPassword);

// CP Driver (US) passwordless signup/login
router.post('/otp/send', sendOtp);
router.post('/otp/verify', verifyOtp);

module.exports = router;
