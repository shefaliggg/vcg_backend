const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const User = require('../models/User');
const Driver = require('../models/Driver');

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token missing' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: 'Invalid token' });
    req.user = user;
    console.log(`[Auth] User: ${user.firstName} ${user.lastName}, Role: ${user.role}`);
    if (user.role === 'driver') {
      const driver = await Driver.findOne({ userId: user._id });
      req.driver = driver;
      console.log(`[Auth] Driver found: ${driver?._id}`);
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { requireAuth };
