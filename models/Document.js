const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    ownerType: { type: String, enum: ['driver', 'truck'], required: true },
    docType: {
      type: String,
      enum: ['cdl', 'medical_cert', 'vehicle_registration', 'insurance', 'inspection', 'operating_authority'],
      required: true,
    },
    fileUrl: { type: String, required: true },
    fileName: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: { type: String },
    expiresAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

DocumentSchema.index({ driverId: 1, docType: 1 }, { unique: true });

module.exports = mongoose.model('Document', DocumentSchema);
