// Brokerage settlement calculation utility
const mongoose = require('mongoose');
function calculateSettlement(amount, planPercentage) {
  const platformFee = Number((amount * planPercentage / 100).toFixed(2));
  const driverPayout = Number((amount - platformFee).toFixed(2));
  return {
    platformFee,
    driverPayout
  };
}

module.exports = { calculateSettlement };
