// One-time migration: backfill Driver.onboardingStep for drivers that existed
// before the CP Driver (US) onboarding redesign (driver-info/cdl-info/qualification/
// truck-info/truck-documents/agreements steps + Truck/Document collections).
//
// Run with: node scripts/migrate-driver-onboarding-v2.js
require('dotenv').config();
const mongoose = require('mongoose');
const Driver = require('../models/Driver');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vcg_transport');
  console.log('Connected. Migrating drivers...');

  const drivers = await Driver.find({});
  let updated = 0;

  for (const driver of drivers) {
    let step;

    if (driver.approvalStatus !== 'incomplete') {
      // Already past onboarding under the old flow - treat as fully submitted.
      step = 'submitted';
    } else if (driver.licenseNumber && driver.vehicleNumber) {
      // Old flow's single onboarding screen was completed (license + vehicle + docs).
      step = 'agreements';
    } else {
      step = 'driver_info';
    }

    if (driver.onboardingStep !== step) {
      driver.onboardingStep = step;
      await driver.save();
      updated += 1;
    }
  }

  console.log(`Done. ${updated}/${drivers.length} driver(s) updated.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
