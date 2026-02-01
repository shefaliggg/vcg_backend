const mongoose = require('mongoose');
const Driver = require('../models/Driver');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vgc-transport';

async function checkDrivers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const drivers = await Driver.find({}).populate('userId', 'firstName lastName email');
    
    console.log(`\nTotal drivers: ${drivers.length}\n`);
    
    drivers.forEach((driver, index) => {
      console.log(`Driver ${index + 1}:`);
      console.log(`  ID: ${driver._id}`);
      console.log(`  User: ${driver.userId?.firstName} ${driver.userId?.lastName}`);
      console.log(`  Status: ${driver.approvalStatus}`);
      console.log(`  License Image: ${driver.licenseImageUrl || 'Not set'}`);
      console.log(`  RC Image: ${driver.rcImageUrl || 'Not set'}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDrivers();
