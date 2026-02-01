// Run this file once to create sample trucks in the database
// node backend/seedTrucks.js

require('dotenv').config();
const mongoose = require('mongoose');
const Truck = require('./models/Truck');

const sampleTrucks = [
  {
    registrationNumber: 'MH-01-AB-1234',
    truckType: '10-wheeler',
    capacity: 20,
    status: 'available'
  },
  {
    registrationNumber: 'MH-02-CD-5678',
    truckType: 'Container Truck',
    capacity: 15,
    status: 'available'
  },
  {
    registrationNumber: 'DL-03-EF-9012',
    truckType: 'Flatbed',
    capacity: 25,
    status: 'available'
  },
  {
    registrationNumber: 'KA-04-GH-3456',
    truckType: 'Mini Truck',
    capacity: 5,
    status: 'available'
  },
  {
    registrationNumber: 'TN-05-IJ-7890',
    truckType: 'Refrigerated Van',
    capacity: 10,
    status: 'available'
  }
];

const seedTrucks = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // Clear existing trucks
    await Truck.deleteMany({});
    console.log('Cleared existing trucks');

    // Insert sample trucks
    await Truck.insertMany(sampleTrucks);
    console.log('✓ Sample trucks created successfully!');

    process.exit(0);
  } catch (err) {
    console.error('Error seeding trucks:', err);
    process.exit(1);
  }
};

seedTrucks();
