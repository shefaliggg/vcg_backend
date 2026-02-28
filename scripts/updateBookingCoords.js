// Script to update an existing booking with pickup and drop coordinates
// Usage: node updateBookingCoords.js <bookingId>

const mongoose = require('mongoose');
const Booking = require('./models/Booking');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yourdbname';

async function updateBooking(bookingId) {
  await mongoose.connect(MONGO_URI);
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    console.error('Booking not found:', bookingId);
    process.exit(1);
  }
  booking.pickupLocation = {
    address: 'Connaught Place, New Delhi',
    lat: 28.6315,
    lng: 77.2167
  };
  booking.deliveryLocation = {
    address: 'Gateway of India, Mumbai',
    lat: 18.921984,
    lng: 72.834654
  };
  await booking.save();
  console.log('Booking updated with coordinates:', bookingId);
  process.exit(0);
}

const bookingId = process.argv[2];
if (!bookingId) {
  console.error('Usage: node updateBookingCoords.js <bookingId>');
  process.exit(1);
}
updateBooking(bookingId);