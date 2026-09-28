const mongoose = require('mongoose');

const { getStructTreeRoot } = require('pdfkit');

const UserSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passwordHash: { type: String },
    role: { type: String, enum: ['user', 'driver', 'admin'], default: 'user', required: true },
    authMethod: { type: String, enum: ['password', 'email_otp', 'phone_otp'], default: 'password' },
    isPhoneVerified: { type: Boolean, default: false },
    companyProfile: {
      companyName: { type: String },
      billingAddress: { type: String },
      city: { type: String },
      state: { type: String },
      zip: { type: String },
      email: { type: String },
      phone: { type: String },
      taxId: { type: String },
      gstNumber: { type: String },
    },

    // CP Shipper (US) onboarding — role: 'user'
    accountType: { type: String, enum: ['individual', 'business'] },
    primaryLocation: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      zip: { type: String },
    },
    agreements: {
      tos: { accepted: { type: Boolean, default: false }, acceptedAt: Date },
      privacyPolicy: { accepted: { type: Boolean, default: false }, acceptedAt: Date },
      shipperAgreement: { accepted: { type: Boolean, default: false }, acceptedAt: Date },
    },
    // CP Shipper (US) onboarding — Billing Information step
    billingProfile: {
      contactName: { type: String },
      email: { type: String },
      phone: { type: String },
      paymentTerms: { type: String, enum: ['due_on_receipt', 'net_15', 'net_30', 'net_45'] },
      preferredPaymentMethod: { type: String, enum: ['ach', 'check', 'credit_card'] },
    },
    // CP Shipper (US) onboarding — closing step timestamp, set when the shipper agrees to
    // the Terms & Conditions/Privacy Policy and submits for admin review. signatureUrl is
    // unused by this flow (no hand-drawn signature is captured) but kept for legacy records.
    signatureUrl: { type: String },
    signedAt: { type: Date },
    shipperOnboardingStep: {
      type: String,
      enum: [
        'your_info', 'account_type', 'business_info', 'primary_location',
        'billing_info', 'documents', 'terms', 'signature', 'submitted', 'complete',
      ],
      default: 'your_info',
    },
    // Admin verification gate for the CP Shipper (US) onboarding flow (email/phone OTP
    // signups only - legacy password accounts default to 'approved' so they keep working
    // unreviewed, same carve-out AppNavigator already gives them for onboarding itself).
    shipperApprovalStatus: {
      type: String,
      enum: ['incomplete', 'pending', 'approved', 'rejected'],
      default: 'approved',
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
