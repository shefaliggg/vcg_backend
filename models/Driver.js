const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    licenseNumber: { type: String },
    licenseExpiry: { type: Date },
    licenseImageUrl: { type: String },
    rcImageUrl: { type: String },
    vehicleNumber: { type: String },
    vehicleType: { type: String },
    vehicleCapacity: { type: String },
    approvalStatus: { type: String, enum: ['incomplete', 'pending', 'approved', 'rejected'], default: 'incomplete' },
    isOnline: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('Driver', DriverSchema);
