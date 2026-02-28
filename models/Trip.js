const mongoose = require('mongoose');

const TripSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
  status: { 
    type: String, 
    enum: ['assigned', 'accepted', 'rejected', 'going_to_pickup', 'arrived_at_pickup', 'loading', 'loaded', 'in_transit', 'arrived_at_drop', 'delivered', 'completed','pod_uploaded','pod_approved','pod_rejected'], 
    default: 'assigned' 
  },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String },
    updatedAt: { type: Date }
  },
  podUrl: { type: String ,default: null },
  startedAt: { type: Date },
  completedAt: { type: Date },
  distance: { type: Number },
  notes: { type: String },
  platformFee: { type: Number, default: 0 },
  driverPayout: { type: Number, default: 0 },
  planPercentageUsed: { type: Number, default: 10 }
}, { timestamps: true });

module.exports = mongoose.model('Trip', TripSchema);
