const express = require('express');
const router = express.Router();
const { register, login, me, adminLogin,forgotPassword,verifyOtpAndResetPassword } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.get('/me', requireAuth, me);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyOtpAndResetPassword);

module.exports = router;
