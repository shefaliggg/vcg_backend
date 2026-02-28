const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { signToken } = require('../config/jwt');

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const register = async (req, res) => {
  try {
    console.log('[REGISTER] Body received:', req.body);
    console.log('[REGISTER] PlanType:', req.body.planType, 'PlanPercentage:', req.body.planPercentage);
    const { firstName, lastName, email, phone, password, role, planType, planPercentage } = req.body;
    if (!firstName || !lastName || !email || !phone || !password) {
      console.log('[REGISTER] Missing fields:', { firstName, lastName, email, phone, password });
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      console.log('[REGISTER] Email already exists:', email);
      return res.status(409).json({ message: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role === 'driver' ? 'driver' : 'user';
    console.log('[REGISTER] Creating user:', { firstName, lastName, email, phone, role: userRole });
    const user = await User.create({ firstName, lastName, email, phone, passwordHash, role: userRole });

    if (userRole === 'driver') {
      try {
        const driverData = { userId: user._id, approvalStatus: 'incomplete', isOnline: false };
        if (planType && ['10', '12', '17', '20'].includes(planType)) driverData.planType = planType;
        if (planPercentage && [10, 12, 17, 20].includes(Number(planPercentage))) driverData.planPercentage = Number(planPercentage);
        const createdDriver = await Driver.create(driverData);
        console.log('[REGISTER] Created driver record for:', user._id, 'with plan:', createdDriver.planType, createdDriver.planPercentage);
      } catch (driverErr) {
        console.warn('[REGISTER] Warning creating driver record:', driverErr.message);
        // Continue anyway - user is created
      }
    }

    const token = signToken(user);
    const safeUser = { id: user._id, firstName, lastName, email, phone, role: user.role, createdAt: user.createdAt };
    console.log('[REGISTER] Success:', email);
    return res.status(201).json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('[REGISTER] ERROR:', err.message, err.stack);
    return res.status(500).json({ message: 'Server error: ' + err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken(user);
    const safeUser = { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt };
    return res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const me = async (req, res) => {
  try {
    const user = req.user;
    const safeUser = { id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt };
    return res.json({ success: true, user: safeUser });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email, role: 'admin' });
    if (!user) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const token = signToken(user);
    const safeUser = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    };
    return res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('[ADMIN_LOGIN] Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};



const forgotPassword = async (req, res) => {
  try {
    console.log('[FORGOT_PASSWORD] Body received:', req.body);
    const { email } = req.body;
    console.log('[FORGOT_PASSWORD] Email:', email);

    const user = await User.findOne({ email });
    console.log('[FORGOT_PASSWORD] User found:', !!user);

    // Always return same response (security best practice)
    if (!user) {
      return res.json({
        message: "If an account exists, an OTP was sent."
      });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('[FORGOT_PASSWORD] Generated OTP for user:', user._id, 'OTP:', otp);

    user.resetPasswordOtp = otp;
    user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    console.log('[FORGOT_PASSWORD] Saved OTP to user record, sending email to:', email);

    // Send OTP using Resend
    const emailResponse = await resend.emails.send({
      from: "VCG Transport <onboarding@resend.dev>", // use resend default for now
      to: user.email,
      subject: "Password Reset OTP",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Password Reset Request</h2>
          <p>Your OTP code is:</p>
          <h1 style="letter-spacing: 4px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <br/>
          <small>If you did not request this, please ignore this email.</small>
        </div>
      `
    });

    console.log('[FORGOT_PASSWORD] Email sent successfully to:', emailResponse);

    res.json({
      message: "If an account exists, an OTP was sent."
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Forgot password failed" });
  }
};







const verifyOtpAndResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({
      email,
      resetPasswordOtp: otp,
      resetPasswordOtpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired OTP"
      });
    }

    // Hash new password
    user.passwordHash = await bcrypt.hash(newPassword, 10);

    // Clear OTP fields
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;

    await user.save();

    res.json({ message: "Password reset successful" });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Reset failed" });
  }
};

module.exports = { register, login, me, adminLogin, forgotPassword, verifyOtpAndResetPassword };
