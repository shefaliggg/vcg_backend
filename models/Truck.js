const mongoose = require('mongoose');

const TruckSchema = new mongoose.Schema({
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  registrationNumber: { type: String, required: true, unique: true },
  truckType: { type: String, required: true },
  capacity: { type: Number, required: true },
  truckImageUrl: { type: String },
  status: { type: String, enum: ['available', 'assigned', 'maintenance'], default: 'available' },
  currentLocation: {
    address: { type: String },
    lat: { type: Number },
    lng: { type: Number }
  }
}, { timestamps: true });

module.exports = mongoose.model('Truck', TruckSchema);
