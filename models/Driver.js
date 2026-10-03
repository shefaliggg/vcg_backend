const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    carrierProfile: {
      legalName: { type: String },
      dba: { type: String },
      mcNumber: { type: String },
      dotNumber: { type: String },
    },

    // CDL Information (licenseNumber/licenseExpiry kept as field names, reinterpreted as CDL#/expiry)
    licenseNumber: { type: String },
    licenseExpiry: { type: Date },
    licenseImageUrl: { type: String }, // @deprecated - CDL image now lives in Document (docType: 'cdl')
    cdlState: { type: String },
    cdlClass: { type: String, enum: ['A', 'B', 'C'] },
    endorsements: [{ type: String, enum: ['H', 'N', 'P', 'S', 'T', 'X'] }],

    rcImageUrl: { type: String }, // @deprecated - vehicle registration doc now lives in Document (docType: 'vehicle_registration')

    // @deprecated mirror of Truck (see truckId) - do not read as source of truth
    vehicleNumber: { type: String },
    vehicleType: { type: String },
    vehicleCapacity: { type: String },

    // Driver Information
    dateOfBirth: { type: Date },
    address: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      zip: { type: String },
    },

    // Driver Qualification
    qualification: {
      yearsCdlExperience: { type: Number },
      medicalCertStatus: { type: String, enum: ['valid', 'expired', 'pending', 'exempt'] },
      medicalCertExpiry: { type: Date },
      mvrConsentGiven: { type: Boolean, default: false },
      mvrConsentAt: { type: Date },
      roadTestStatus: { type: String, enum: ['completed', 'waived', 'not_completed'], default: 'not_completed' },
      roadTestNotes: { type: String },
    },

    // Truck (see models/Truck.js)
    truckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },

    // Agreements
    agreements: {
      tos: { accepted: { type: Boolean, default: false }, acceptedAt: Date, version: String },
      privacyPolicy: { accepted: { type: Boolean, default: false }, acceptedAt: Date, version: String },
      driverAgreement: { accepted: { type: Boolean, default: false }, acceptedAt: Date, version: String },
      mvrConsent: { accepted: { type: Boolean, default: false }, acceptedAt: Date, version: String },
    },

    onboardingStep: {
      type: String,
      enum: ['driver_info', 'cdl_info', 'qualification', 'truck_info', 'truck_documents', 'agreements', 'submitted'],
      default: 'driver_info',
    },

    approvalStatus: { type: String, enum: ['incomplete', 'pending', 'approved', 'rejected'], default: 'incomplete' },
    // isOnline is kept in sync (true only when availabilityStatus === 'online') so
    // existing readers (admin dashboard counts) keep working.
    isOnline: { type: Boolean, default: false },
    availabilityStatus: { type: String, enum: ['online', 'offline', 'busy'], default: 'offline' },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    planType: { type: String, enum: ['10', '12', '17', '20'], default: '10' },
    planPercentage: { type: Number, enum: [10, 12, 17, 20], default: 10 },

    bankDetails: {
      accountHolderName: { type: String },
      payoutMethod: { type: String },
      paymentDetails: { type: String },
      bankName: { type: String },
      accountNumber: { type: String },
      routingNumber: { type: String },
      isVerified: { type: Boolean, default: false }
    }
  },

  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } }
);

module.exports = mongoose.model('Driver', DriverSchema);
