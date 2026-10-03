const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['driver', 'user', 'admin'], required: true },
  senderName: { type: String },
  text: { type: String, required: true },
  readAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
