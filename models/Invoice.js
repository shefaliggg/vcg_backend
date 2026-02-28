const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  trip: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trip',
    required: true,
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true,
  },

  amount: {              // Base trip amount
    type: Number,
    required: true,
  },

  onlineFee: {           // 5% fee if online
    type: Number,
    default: 0,
  },

  totalAmount: {         // amount + onlineFee
    type: Number,
    required: true,
  },

  paymentMethod: {
    type: String,
    enum: ['online', 'offline','offline_confirm',null],
    default: null,        // Not selected yet
  },

  status: {
    type: String,
    enum: ['pending_payment', 'payment_processing', 'awaiting_bank_transfer', 'paid', 'cancelled'],
    default: 'pending_payment',
  },

  stripeSessionId: String,
    stripePaymentIntentId: String,
    stripeChargeId: String,
    paymentFailureReason: String,

    settled:{
      type: Boolean,
      default: false,
    }

}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);