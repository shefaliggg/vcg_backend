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
  pickupLocation: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  deliveryLocation: {
    address: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  pickupDate: { type: Date, required: true },
  deliveryDate: { type: Date },
  truckType: { type: String, required: true },
  loadDetails: {
    weight: { type: Number, required: true },
    type: { type: String },
    description: { type: String }
  },
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
    enum: ['OPEN_FOR_QUOTES', 'CONFIRMED', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED'],
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
