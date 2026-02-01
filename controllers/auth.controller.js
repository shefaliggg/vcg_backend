const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { signToken } = require('../config/jwt');

const register = async (req, res) => {
  try {
    console.log('[REGISTER] Body received:', req.body);
    const { firstName, lastName, email, phone, password, role } = req.body;
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
        await Driver.create({ userId: user._id, approvalStatus: 'incomplete', isOnline: false });
        console.log('[REGISTER] Created driver record for:', user._id);
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

module.exports = { register, login, me, adminLogin };
