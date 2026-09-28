const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  truckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
  shipper: {
    name: { type: String },
    phone: { type: String }
  },
  consignee: {
    name: { type: String },
    phone: { type: String }
  },
  // Required-ness for a live-posted load (not a draft) is enforced in
  // booking.controller.js's createBooking, not here - a draft is explicitly
  // allowed to be missing any of these.
  pickupLocation: {
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number }
  },
  deliveryLocation: {
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number }
  },
  pickupDate: { type: Date },
  deliveryDate: { type: Date },
  truckType: { type: String },
  loadDetails: {
    weight: { type: Number },
    type: { type: String },
    description: { type: String },
    // Post Load form additions - all optional, MVP only requires weight/type/description above
    pieces: { type: Number },
    packageType: { type: String, enum: ['pallets', 'boxes', 'crates', 'other'] },
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
    totalQuantity: { type: Number },
    freightClass: { type: String },
  },

  // Post Load form: pickup/delivery scheduling + contact detail beyond the top-level date/location
  pickupDetails: {
    time: { type: String },
    windowStart: { type: String },
    windowEnd: { type: String },
    appointmentRequired: { type: Boolean, default: false },
    contactName: { type: String },
    contactPhone: { type: String },
    instructions: { type: String },
  },
  deliveryDetails: {
    time: { type: String },
    windowStart: { type: String },
    windowEnd: { type: String },
    appointmentRequired: { type: Boolean, default: false },
    contactName: { type: String },
    contactPhone: { type: String },
    instructions: { type: String },
  },

  // Post Load form: equipment beyond truckType (kept as the "Equipment type" field above)
  equipmentDetails: {
    trailerSize: { type: String },
    temperatureRequirements: { type: String },
    specialEquipment: { type: String },
  },

  requirements: {
    hazmat: { type: Boolean, default: false },
    oversized: { type: Boolean, default: false },
    teamDriverRequired: { type: Boolean, default: false },
    liftgateRequired: { type: Boolean, default: false },
    loadingType: { type: String, enum: ['live_load', 'drop_hook'] },
    unloadingType: { type: String, enum: ['live_unload', 'drop_hook'] },
    driverRequirements: { type: String },
    insuranceRequirements: { type: String },
    otherRequirements: { type: String },
  },

  rate: {
    type: { type: String, enum: ['flat', 'per_mile'], default: 'flat' },
    offeredRate: { type: Number },
    ratePerMile: { type: Number },
    fuelSurcharge: { type: Number },
    paymentTerms: { type: String },
  },

  documents: [
    {
      docType: { type: String, enum: ['bol', 'rate_confirmation', 'other'], required: true },
      fileUrl: { type: String, required: true },
      fileName: { type: String },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],

  referenceNumber: { type: String },
  internalNotes: { type: String },
  // A draft is a persisted, incomplete Post Load form - excluded from the
  // driver-facing available-loads feed until the shipper actually posts it.
  isDraft: { type: Boolean, default: false },
  quotations: [
    {
      driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
      price: { type: Number, required: true },
      notes: { type: String },
      selected: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  rateConfirmation: {
  status: {
    type: String,
   enum: [
  'not_generated',
  'awaiting_user_signature',
  'user_signed',
  'driver_accepted'
],
    default: 'not_generated'
  },

  // 🔥 ADD THESE TWO (VERY IMPORTANT)
  amount: { type: Number },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },

  pdfUrl: { type: String },
  generatedAt: { type: Date },
  userSignedAt: { type: Date },
  driverAcceptedAt: { type: Date },
  userSignatureUrl: { type: String },
  driverSignatureUrl: { type: String }
},
  status: {
    type: String,
    // Includes both the originally-declared uppercase values and the lowercase
    // values actually written by trip lifecycle code (trip.controller.js acceptTrip/
    // updateTripStatus) - the two drifted apart because those writes use
    // findByIdAndUpdate, which skips validators by default and so never surfaced
    // the mismatch as an error.
    enum: ['OPEN_FOR_QUOTES', 'CONFIRMED', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'confirmed', 'in_progress', 'completed'],
    default: 'OPEN_FOR_QUOTES'
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
    updatedAt: Date,
  },
  liveTracking: {
    isActive: { type: Boolean, default: false },
    startedAt: Date,
    endedAt: Date,
  }
}, { timestamps: true });

module.exports = mongoose.model('Booking', BookingSchema);
