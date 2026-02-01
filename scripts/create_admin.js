require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');

(async () => {
  try {
    await connectDB();
    const email = process.env.ADMIN_EMAIL || 'admin@vcg.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    let user = await User.findOne({ email });
    if (user) {
      if (user.role !== 'admin') {
        user.role = 'admin';
        await user.save();
        console.log(`[ADMIN] Promoted existing user to admin: ${email}`);
      } else {
        console.log(`[ADMIN] User already exists: ${email} (role=admin)`);
      }
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    user = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email,
      phone: '5555555555',
      passwordHash,
      role: 'admin',
    });
    console.log(`[ADMIN] Created admin user: ${email}`);
    process.exit(0);
  } catch (err) {
    console.error('[ADMIN] Error creating admin:', err.message);
    process.exit(1);
  }
})();
