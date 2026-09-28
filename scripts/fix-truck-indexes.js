// Fixes trucks.registrationNumber_1 / trucks.vin_1 being unique-but-not-sparse in the
// live database even though models/Truck.js declares them `unique: true, sparse: true`.
// Mongoose's autoIndex never retroactively changes an existing index's options, so once
// that index was created without `sparse` (e.g. before this field existed on every
// truck), every Truck saved without a registrationNumber/vin indexes as the same
// `null` and the second one throws E11000 - which is exactly the
// "PUT /api/drivers/me/truck-info 500" duplicate-key error CP Driver onboarding hits.
//
// Run once: node scripts/fix-truck-indexes.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vcg_transport';

const FIELDS_TO_FIX = ['registrationNumber', 'vin'];

async function fixTruckIndexes() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB (db: ${mongoose.connection.name})`);

  const collection = mongoose.connection.db.collection('trucks');
  const existingIndexes = await collection.indexes();

  for (const field of FIELDS_TO_FIX) {
    const indexName = `${field}_1`;
    const existing = existingIndexes.find((idx) => idx.name === indexName);

    if (existing && existing.sparse) {
      console.log(`[skip] ${indexName} is already sparse.`);
      continue;
    }

    if (existing) {
      console.log(`[fix] Dropping non-sparse ${indexName}...`);
      await collection.dropIndex(indexName);
    } else {
      console.log(`[fix] ${indexName} does not exist yet, will create it sparse.`);
    }

    // Clear the field on documents where it's explicitly null (not just absent) -
    // a sparse index still collides on explicit nulls, only a truly missing field
    // is skipped.
    const nulled = await collection.updateMany({ [field]: null }, { $unset: { [field]: '' } });
    if (nulled.modifiedCount) {
      console.log(`[fix] Unset ${field} on ${nulled.modifiedCount} truck(s) that had it explicitly null.`);
    }

    await collection.createIndex({ [field]: 1 }, { unique: true, sparse: true, name: indexName });
    console.log(`[fix] Recreated ${indexName} as unique+sparse.`);
  }

  console.log('Done.');
  await mongoose.disconnect();
}

fixTruckIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fix-truck-indexes failed:', err);
    process.exit(1);
  });
