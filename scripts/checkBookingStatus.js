// Script to check booking status and visibility for a driver
// Usage: node checkBookingStatus.js <bookingId> <driverId>

const mongoose = require('mongoose');
const Booking = require('./models/Booking');


const MONGO_URI = 'mongodb://localhost:27017/YOUR_DB_NAME'; // <-- Change to your DB

async function main() {
  const [,, bookingId, driverId] = process.argv;
  if (!bookingId || !driverId) {
    console.error('Usage: node checkBookingStatus.js <bookingId> <driverId>');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) {
    console.log('Booking not found');
    process.exit(1);
  }

  // Marketplace flow: show booking status and quotations
  console.log('Booking status:', booking.status);
  if (booking.status === 'OPEN_FOR_QUOTES') {
    console.log('Booking is open for quotations. All approved drivers can see and quote.');
  }
  if (booking.status === 'CONFIRMED') {
    console.log('Booking is confirmed. Driver selected.');
  }
  if (booking.status === 'IN_PROGRESS') {
    console.log('Trip in progress.');
  }
  if (booking.status === 'DELIVERED') {
    console.log('Trip delivered.');
  }

  // Show quotations
  if (booking.quotations && booking.quotations.length > 0) {
    console.log('Quotations:');
    booking.quotations.forEach(q => {
      console.log(`- Driver: ${q.driverId}, Price: ${q.price}, Notes: ${q.notes}, Selected: ${q.selected}`);
    });
  } else {
    console.log('No quotations yet.');
  }

  // Show selected quotation
  const selectedQuote = (booking.quotations || []).find(q => q.selected);
  if (selectedQuote) {
    console.log('Selected Quotation:', selectedQuote);
    if (selectedQuote.driverId.toString() === driverId) {
      console.log('This driver is the selected quote driver.');
    } else {
      console.log('This driver is NOT the selected quote driver.');
    }
  } else {
    console.log('No quotation selected yet.');
  }

  // Check if driver has quoted
  const hasQuoted = (booking.quotations || []).some(q => q.driverId && q.driverId.toString() === driverId);
  console.log('Driver has quoted:', hasQuoted);

  mongoose.disconnect();
}

main();
