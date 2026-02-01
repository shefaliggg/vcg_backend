const mongoose = require('mongoose');
const Driver = require('../models/Driver');
const path = require('path');

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vgc-transport';

async function fixImagePaths() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const drivers = await Driver.find({
      $or: [
        { licenseImageUrl: { $exists: true, $ne: null } },
        { rcImageUrl: { $exists: true, $ne: null } }
      ]
    });

    console.log(`Found ${drivers.length} drivers with images`);

    for (const driver of drivers) {
      let updated = false;

      // Fix license image path
      if (driver.licenseImageUrl && driver.licenseImageUrl.includes('\\')) {
        const filename = path.basename(driver.licenseImageUrl);
        driver.licenseImageUrl = `uploads/drivers/${filename}`;
        updated = true;
        console.log(`Fixed license path for driver ${driver._id}: ${driver.licenseImageUrl}`);
      }

      // Fix RC image path
      if (driver.rcImageUrl && driver.rcImageUrl.includes('\\')) {
        const filename = path.basename(driver.rcImageUrl);
        driver.rcImageUrl = `uploads/drivers/${filename}`;
        updated = true;
        console.log(`Fixed RC path for driver ${driver._id}: ${driver.rcImageUrl}`);
      }

      if (updated) {
        await driver.save();
        console.log(`Updated driver ${driver._id}`);
      }
    }

    console.log('✓ Image paths fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing image paths:', error);
    process.exit(1);
  }
}

fixImagePaths();
