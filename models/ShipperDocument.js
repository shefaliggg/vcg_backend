const mongoose = require('mongoose');

// Required Documents step of CP Shipper (US) onboarding. Mirrors models/Document.js
// (driver documents) but keyed by userId instead of driverId, since a shipper has no
// Driver record - kept as a separate model rather than widening Document's required
// driverId + its {driverId, docType} unique index.
const ShipperDocumentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    docType: {
      type: String,
      enum: ['business_license', 'insurance_coi', 'w9', 'other'],
      required: true,
    },
    fileUrl: { type: String, required: true },
    fileName: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ShipperDocumentSchema.index({ userId: 1, docType: 1 }, { unique: true });

module.exports = mongoose.model('ShipperDocument', ShipperDocumentSchema);
