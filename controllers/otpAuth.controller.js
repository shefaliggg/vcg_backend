const crypto = require('crypto');
const User = require('../models/User');
const Driver = require('../models/Driver');
const OtpCode = require('../models/OtpCode');
const { signToken } = require('../config/jwt');

const { sendMail } = require('../utils/mailer');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex');
const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
const isValidUsPhone = (phone) => /^\+?1?\d{10}$/.test((phone || '').replace(/[\s()-]/g, ''));

const sendOtp = async (req, res) => {
  try {
    const { channel, email, phone } = req.body;

    if (channel === 'phone') {
      if (!isValidUsPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Enter a valid US phone number' });
      }
      // No SMS provider is configured yet - phone verification is UI-only for now.
      return res.status(501).json({
        success: false,
        smsAvailable: false,
        message: 'Phone verification is not available yet. Please continue with email.',
      });
    }

    if (channel !== 'email') {
      return res.status(400).json({ success: false, message: 'Invalid channel' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    const identifier = email.trim().toLowerCase();

    const recent = await OtpCode.findOne({
      identifier,
      channel: 'email',
      consumedAt: null,
      createdAt: { $gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
    });
    if (recent) {
      return res.status(429).json({ success: false, message: 'Please wait before requesting another code' });
    }

    const code = generateCode();
    await OtpCode.create({
      identifier,
      channel: 'email',
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await sendMail({
      to: identifier,
      subject: 'Your CP Driver verification code',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Verify your account</h2>
          <p>Your verification code is:</p>
          <h1 style="letter-spacing: 4px;">${code}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true, message: 'Verification code sent to your email.' });
  } catch (err) {
    console.error('[sendOtp] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { channel, email, phone, code } = req.body;
    // 'driver' (CP Driver) is the default for backward compat with the driver app,
    // which does not send a role. CP Shipper (vcg_user) passes role: 'user'.
    const role = req.body.role === 'user' ? 'user' : 'driver';

    if (channel === 'phone') {
      return res.status(501).json({ success: false, smsAvailable: false, message: 'Phone verification is not available yet.' });
    }

    if (channel !== 'email') {
      return res.status(400).json({ success: false, message: 'Invalid channel' });
    }
    if (!isValidEmail(email) || !code) {
      return res.status(400).json({ success: false, message: 'Email and code are required' });
    }
    const identifier = email.trim().toLowerCase();

    const otpRecord = await OtpCode.findOne({
      identifier,
      channel: 'email',
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Code expired or not requested. Request a new code.' });
    }
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
    }
    if (hashCode(code) !== otpRecord.codeHash) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({ success: false, message: 'Invalid code.' });
    }

    otpRecord.consumedAt = new Date();
    await otpRecord.save();

    let user = await User.findOne({ email: identifier });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        email: identifier,
        role,
        authMethod: 'email_otp',
        emailVerified: true,
        // New CP Shipper (US) signups must clear onboarding + admin review before
        // they can use the app - the User schema's 'approved' default is only for
        // legacy password accounts, which never touch this creation path.
        ...(role === 'user' ? { shipperApprovalStatus: 'incomplete' } : {}),
      });
      if (role === 'driver') {
        await Driver.create({ userId: user._id, approvalStatus: 'incomplete', onboardingStep: 'driver_info' });
      }
    } else if (user.role !== role) {
      return res.status(403).json({ success: false, message: 'This email is already registered under a different account type.' });
    } else if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    const token = signToken(user);
    const safeUser = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
    };

    if (role === 'user') {
      return res.status(200).json({
        success: true,
        token,
        user: safeUser,
        isNewUser,
        shipper: {
          shipperOnboardingStep: user.shipperOnboardingStep,
          accountType: user.accountType,
          shipperApprovalStatus: user.shipperApprovalStatus,
        },
      });
    }

    const driver = await Driver.findOne({ userId: user._id });
    return res.status(200).json({
      success: true,
      token,
      user: safeUser,
      isNewUser,
      driver: driver ? { approvalStatus: driver.approvalStatus, onboardingStep: driver.onboardingStep } : null,
    });
  } catch (err) {
    console.error('[verifyOtp] Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { sendOtp, verifyOtp };
