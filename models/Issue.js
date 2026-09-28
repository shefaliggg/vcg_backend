const mongoose = require('mongoose');

const IssueSchema = new mongoose.Schema(
  {
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    category: {
      type: String,
      enum: ['vehicle_breakdown', 'accident', 'delay', 'load_issue', 'facility_issue', 'other'],
      required: true,
    },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'in_review', 'resolved'], default: 'open' },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Issue', IssueSchema);
