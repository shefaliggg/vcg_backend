#!/usr/bin/env node

/**
 * Usage: node scripts/create-admin.js <email> <password> [firstName] [lastName]
 * Example: node scripts/create-admin.js admin@vgc.com password123 Admin User
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/vcg_transport', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
};

const createAdmin = async () => {
  try {
    const [, , email, password, firstName = 'Admin', lastName = 'User'] = process.argv;

    if (!email || !password) {
      console.error('Usage: node scripts/create-admin.js <email> <password> [firstName] [lastName]');
      process.exit(1);
    }

    // Check if admin already exists
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`Admin with email ${email} already exists`);
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await User.create({
      firstName,
      lastName,
      email,
      phone: '1234567890', // Dummy phone
      passwordHash,
      role: 'admin',
    });

    console.log(`✓ Admin user created successfully`);
    console.log(`  Email: ${email}`);
    console.log(`  Name: ${firstName} ${lastName}`);
    console.log(`  ID: ${admin._id}`);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
};

connectDB().then(createAdmin);
