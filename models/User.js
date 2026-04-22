const mongoose = require('mongoose');

const { getStructTreeRoot } = require('pdfkit');

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    email: { type: String, trim: true, unique: true, required: true },
    phone: { type: String, trim: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'driver', 'admin'], default: 'user', required: true },
    companyProfile: {
      companyName: { type: String },
      billingAddress: { type: String },
      email: { type: String },
      phone: { type: String },
      taxId: { type: String },
      gstNumber: { type: String },
    },
    resetPasswordOtp: { type: String },
    resetPasswordOtpExpires: { type: Date },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },
    adminProfile: {
      dispatcherName: { type: String },
      dispatcherEmail: { type: String },
      dispatcherPhone: { type: String },
      salespersonName: { type: String },
      salespersonEmail: { type: String },
      salespersonPhone: { type: String }
    },
    expoPushToken: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('User', UserSchema);
