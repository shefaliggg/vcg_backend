const Trip = require('../models/Trip');
const Booking = require('../models/Booking');

// Get assigned trips for driver
const getAssignedTrips = async (req, res) => {
  try {
    const driverId = req.driver?._id; // From auth middleware
    
    if (!driverId) {
      return res.status(400).json({ message: 'Driver profile not found' });
    }
    
    const trips = await Trip.find({ 
      driverId, 
      status: 'assigned' 
    })
    .populate({
      path: 'bookingId',
      populate: {
        path: 'userId',
        select: 'firstName lastName phone'
      }
    })
    .sort({ createdAt: -1 });

    // Format for driver app
    const formattedTrips = trips.map(trip => ({
      tripId: trip._id,
      bookingId: trip.bookingId._id,
      pickup: trip.bookingId.pickupLocation?.address || 'N/A',
      drop: trip.bookingId.deliveryLocation?.address || 'N/A',
      pickupDate: trip.bookingId.pickupDate,
      truckType: trip.bookingId.truckType,
      weight: trip.bookingId.loadDetails?.weight,
      customerName: trip.bookingId.userId ? `${trip.bookingId.userId.firstName} ${trip.bookingId.userId.lastName}` : 'N/A',
      customerPhone: trip.bookingId.userId?.phone,
      status: trip.status,
      createdAt: trip.createdAt
    }));

    return res.json(formattedTrips);
  } catch (err) {
    console.error('Get assigned trips error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Accept trip
const acceptTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const driverId = req.driver?._id;

    if (!driverId) {
      return res.status(400).json({ message: 'Driver profile not found' });
    }

    const trip = await Trip.findOne({ _id: tripId, driverId }).populate('bookingId');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or not assigned to you' });
    }

    if (trip.status !== 'assigned') {
      return res.status(400).json({ message: 'Trip is not in assigned state' });
    }

    // Enforce quote/rate-confirmation flow: booking must be fully accepted
    if (!trip.bookingId || trip.bookingId.rateConfirmation?.status !== 'driver_accepted') {
      return res.status(400).json({ message: 'Rate confirmation must be accepted by user and driver before starting trip' });
    }

    trip.status = 'accepted';
    await trip.save();

    // Update booking status
    await Booking.findByIdAndUpdate(trip.bookingId, { status: 'in_progress' });

    return res.json({ message: 'Trip accepted successfully', trip });
  } catch (err) {
    console.error('Accept trip error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Reject trip
const rejectTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const driverId = req.driver?._id;

    if (!driverId) {
      return res.status(400).json({ message: 'Driver profile not found' });
    }

    const trip = await Trip.findOne({ _id: tripId, driverId }).populate('bookingId');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or not assigned to you' });
    }

    if (trip.status !== 'assigned') {
      return res.status(400).json({ message: 'Trip is not in assigned state' });
    }

    trip.status = 'rejected';
    await trip.save();

    // Revert booking to confirmed so admin can reassign
    await Booking.findByIdAndUpdate(trip.bookingId, { 
      status: 'confirmed',
      driverId: null 
    });

    return res.json({ message: 'Trip rejected successfully', trip });
  } catch (err) {
    console.error('Reject trip error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Update trip status (for all status transitions)
const updateTripStatus = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { status } = req.body;
    const driverId = req.driver?._id;

    if (!driverId) {
      return res.status(400).json({ message: 'Driver profile not found' });
    }

    const trip = await Trip.findOne({ _id: tripId, driverId });
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found or not assigned to you' });
    }

    // Validate status
    const validStatuses = ['going_to_pickup', 'arrived_at_pickup', 'loading', 'loaded', 'in_transit', 'arrived_at_drop', 'delivered', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Enforce quote/rate-confirmation flow: booking must be fully accepted before any movement
    if (!trip.bookingId || trip.bookingId.rateConfirmation?.status !== 'driver_accepted') {
      return res.status(400).json({ message: 'Rate confirmation must be accepted by user and driver before updating trip status' });
    }

    trip.status = status;
    
    if (status === 'in_transit' && !trip.startedAt) {
      trip.startedAt = new Date();
    }
    
    if (status === 'delivered' || status === 'completed') {
      trip.completedAt = new Date();
      // Update booking status
      await Booking.findByIdAndUpdate(trip.bookingId, { status: 'completed' });
    }

    await trip.save();

    return res.json({ message: 'Trip status updated successfully', trip });
  } catch (err) {
    console.error('Update trip status error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get trip tracking info (for user and admin)
const getTrackingInfo = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findById(tripId)
      .populate('bookingId')
      .populate({
        path: 'driverId',
        populate: {
          path: 'userId',
          select: 'firstName lastName phone'
        }
      });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const trackingInfo = {
      tripId: trip._id,
      status: trip.status,
      currentLocation: trip.currentLocation,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
      lastUpdatedAt: trip.updatedAt,
      driver: trip.driverId?.userId ? {
        name: `${trip.driverId.userId.firstName} ${trip.driverId.userId.lastName}`,
        phone: trip.driverId.userId.phone,
        vehicleType: trip.driverId.vehicleType
      } : null,
      booking: {
        pickup: trip.bookingId?.pickupLocation?.address,
        drop: trip.bookingId?.deliveryLocation?.address,
        pickupDate: trip.bookingId?.pickupDate
      }
    };

    return res.json(trackingInfo);
  } catch (err) {
    console.error('Get tracking info error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get trip by booking ID (for user to track their booking)
const getTripByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const trip = await Trip.findOne({ bookingId })
      .populate({
        path: 'driverId',
        populate: {
          path: 'userId',
          select: 'firstName lastName phone'
        }
      });

    if (!trip) {
      return res.status(404).json({ message: 'No trip found for this booking' });
    }

    const trackingInfo = {
      tripId: trip._id,
      status: trip.status,
      currentLocation: trip.currentLocation,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
      lastUpdatedAt: trip.updatedAt,
      driver: trip.driverId?.userId ? {
        name: `${trip.driverId.userId.firstName} ${trip.driverId.userId.lastName}`,
        phone: trip.driverId.userId.phone,
        vehicleType: trip.driverId.vehicleType
      } : null
    };

    return res.json(trackingInfo);
  } catch (err) {
    console.error('Get trip by booking error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all trips (admin only)
const getAllTrips = async (req, res) => {
  try {
    const trips = await Trip.find()
      .populate('bookingId')
      .populate({
        path: 'driverId',
        populate: {
          path: 'userId',
          select: 'firstName lastName phone'
        }
      })
      .sort({ createdAt: -1 });

    return res.json(trips);
  } catch (err) {
    console.error('Get all trips error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = {
  getAssignedTrips,
  acceptTrip,
  rejectTrip,
  updateTripStatus,
  getTrackingInfo,
  getTripByBooking,
  getAllTrips
};
