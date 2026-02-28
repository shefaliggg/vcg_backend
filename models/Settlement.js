const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    required: true
  },

  invoices: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  }],

  totalInvoiceAmount: Number,
  totalPlatformFee: Number,
  totalDriverPayout: Number,

  status: {
    type: String,
    enum: ['pending', 'approved', 'paid'],
    default: 'pending'
  },

  payoutInfo: {
    transactionId: String,
    paidAt: Date,
    paymentMethod: { type: String, default: 'bank_transfer' }
  }

}, { timestamps: true });

module.exports = mongoose.model('Settlement', settlementSchema);