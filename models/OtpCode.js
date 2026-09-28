const mongoose = require('mongoose');

const OtpCodeSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, index: true }, // lowercased email, or E.164 phone
    channel: { type: String, enum: ['email', 'phone'], required: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['signup_login'], default: 'signup_login' },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

OtpCodeSchema.index({ identifier: 1, channel: 1 });

module.exports = mongoose.model('OtpCode', OtpCodeSchema);
