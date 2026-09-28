const mongoose = require('mongoose');

const TruckSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  registrationNumber: { type: String, unique: true, sparse: true },
  truckType: { type: String },
  capacity: { type: Number },
  truckImageUrl: { type: String },
  status: { type: String, enum: ['available', 'assigned', 'maintenance'], default: 'available' },
  currentLocation: {
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number }
  },

  // CP Driver (US) onboarding fields
  unitNumber: { type: String },
  vin: { type: String, uppercase: true, unique: true, sparse: true },
  plateNumber: { type: String },
  plateState: { type: String },
  make: { type: String },
  model: { type: String },
  year: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('Truck', TruckSchema);
