// Get all trips for driver (history, active, etc)

const { createAndSendNotification } = require('../utils/notificationService');
const getDriverTrips = async (req, res) => {
  try {
    console.log('[getDriverTrips] req.user:', req.user);
    console.log('[getDriverTrips] req.driver:', req.driver);
    const driverId = req.driver?._id;
    if (!driverId) {
      console.error('[getDriverTrips] No driver profile found');
      return res.status(400).json({ message: 'Driver profile not found' });
    }
    const trips = await Trip.find({ driverId })
      .populate({
        path: 'bookingId',
        populate: {
          path: 'userId',
          select: 'firstName lastName phone'
        }
      })
      .sort({ createdAt: -1 });
    const formattedTrips = trips.map(trip => ({
      tripId: trip._id,
      bookingId: trip.bookingId?._id,
      pickup: trip.bookingId?.pickupLocation?.address || 'N/A',
      drop: trip.bookingId?.deliveryLocation?.address || 'N/A',
      pickupDate: trip.bookingId?.pickupDate,
      truckType: trip.bookingId?.truckType,
      weight: trip.bookingId?.loadDetails?.weight,
      customerName: trip.bookingId?.userId ? `${trip.bookingId.userId.firstName} ${trip.bookingId.userId.lastName}` : 'N/A',
      customerPhone: trip.bookingId?.userId?.phone,
      status: trip.status,
      createdAt: trip.createdAt,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt
    }));
    return res.json(formattedTrips);
  } catch (err) {
    console.error('Get driver trips error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};
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
    console.log('[acceptTrip] tripId:', tripId);
    console.log('[acceptTrip] driverId:', driverId);
    if (!driverId) {
      console.error('[acceptTrip] No driver profile found');
      return res.status(400).json({ message: 'Driver profile not found' });
    }
    const trip = await Trip.findOne({ _id: tripId, driverId }).populate('bookingId');
    console.log('[acceptTrip] trip:', trip);
    if (!trip) {
      console.error('[acceptTrip] Trip not found or not assigned to driver');
      return res.status(404).json({ message: 'Trip not found or not assigned to you' });
    }
    console.log('[acceptTrip] trip.status:', trip.status);
    if (trip.status !== 'assigned') {
      console.error('[acceptTrip] Trip is not in assigned state:', trip.status);
      return res.status(400).json({ message: 'Trip is not in assigned state' });
    }
    console.log('[acceptTrip] bookingId:', trip.bookingId?._id);
    console.log('[acceptTrip] booking.rateConfirmation:', trip.bookingId?.rateConfirmation);
    if (!trip.bookingId || trip.bookingId.rateConfirmation?.status !== 'driver_accepted') {
      console.error('[acceptTrip] Rate confirmation not accepted:', trip.bookingId?.rateConfirmation?.status);
      return res.status(400).json({ message: 'Rate confirmation must be accepted by user and driver before starting trip' });
    }
    trip.status = 'accepted';
    await trip.save();
    // Update booking status
    await Booking.findByIdAndUpdate(trip.bookingId, { status: 'in_progress' });
    console.log('[acceptTrip] Trip accepted successfully');
    return res.json({ message: 'Trip accepted successfully', trip });
  } catch (err) {
    console.error('[acceptTrip] ERROR:', err);
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

    const trip = await Trip.findOne({ _id: tripId, driverId }).populate('bookingId');
    if (!trip) {
      console.error('[updateTripStatus] Trip not found or not assigned to driver', { tripId, driverId });
      return res.status(404).json({ message: 'Trip not found or not assigned to you' });
    }

    // Validate status
    const validStatuses = ['going_to_pickup', 'arrived_at_pickup', 'loading', 'loaded', 'in_transit', 'arrived_at_drop', 'delivered', 'completed'];
    if (!validStatuses.includes(status)) {
      console.error('[updateTripStatus] Invalid status', { status });
      return res.status(400).json({ message: 'Invalid status' });
    }

    // Enforce quote/rate-confirmation flow: booking must be fully accepted before any movement
    const booking = trip.bookingId;
    console.log('[updateTripStatus] Trip:', { tripId: trip._id, tripStatus: trip.status });
    console.log('[updateTripStatus] Booking:', { bookingId: booking?._id, rateConfirmation: booking?.rateConfirmation });
    if (!booking || booking.rateConfirmation?.status !== 'driver_accepted') {
      console.error('[updateTripStatus] Rate confirmation not accepted', { bookingId: booking?._id, rateConfirmation: booking?.rateConfirmation });
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

    // Brokerage settlement calculation
    const driver = await require('../models/Driver').findById(trip.driverId);
    const planPercentage = driver.planPercentage || 10;
    const tripAmount = booking?.rateConfirmation?.amount || booking?.loadDetails?.amount || 0;
    const { calculateSettlement } = require('../utils/settlement');
    const { platformFee, driverPayout } = calculateSettlement(tripAmount, planPercentage);
    trip.platformFee = platformFee;
    trip.driverPayout = driverPayout;
    trip.planPercentageUsed = planPercentage;

    await trip.save();

    // 🔔 Send notification to booking user
    await createAndSendNotification({
      userId: booking.userId,
      title: "Trip Status Updated",
      body: `Your trip is now ${status.replace(/_/g, " ")}`,
      type: "trip_status",
      data: { tripId: trip._id }
    });

    // Return settlement info if trip completed
    if (status === 'completed') {
      return res.json({
        message: 'Trip completed',
        tripAmount: trip.platformFee + trip.driverPayout,
        planPercentage: trip.planPercentageUsed,
        platformFee: trip.platformFee,
        driverPayout: trip.driverPayout,
        trip
      });
    }

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

    // Swiggy-style timeline/stepper for trip status
    const statusSteps = [
      { key: 'assigned', label: 'Trip Assigned' },
      { key: 'accepted', label: 'Driver Accepted' },
      { key: 'going_to_pickup', label: 'Driver Going to Pickup' },
      { key: 'arrived_at_pickup', label: 'Arrived at Pickup' },
      { key: 'loading', label: 'Loading' },
      { key: 'loaded', label: 'Loaded' },
      { key: 'in_transit', label: 'In Transit' },
      { key: 'arrived_at_drop', label: 'Arrived at Drop' },
      { key: 'delivered', label: 'Delivered' },
      { key: 'completed', label: 'Completed' }
    ];

    // Find current step index
    const currentStepIndex = statusSteps.findIndex(s => s.key === trip.status);
    // Mark steps as completed/current/upcoming
    const timeline = statusSteps.map((step, idx) => ({
      ...step,
      status: idx < currentStepIndex ? 'completed' : idx === currentStepIndex ? 'current' : 'upcoming'
    }));

    // Calculate ETA (placeholder: null, can be replaced with real calculation)
    let eta = null;
    // Example: if you have pickup/delivery coordinates, use Google Maps API or similar to get ETA
    // eta = await getETA(trip.currentLocation, trip.bookingId.deliveryLocation)

    const trackingInfo = {
      tripId: trip._id,
      status: trip.status,
      timeline,
      currentLocation: trip.currentLocation,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
      lastUpdatedAt: trip.updatedAt,
      driver: trip.driverId?.userId ? {
        name: `${trip.driverId.userId.firstName} ${trip.driverId.userId.lastName}`,
        phone: trip.driverId.userId.phone,
        vehicleType: trip.driverId.vehicleType,
        plateNumber: trip.driverId.plateNumber || null
      } : null,
      eta,
      booking: {
        pickup: trip.bookingId?.pickupLocation?.address,
        pickupLocation: trip.bookingId?.pickupLocation || null,
        drop: trip.bookingId?.deliveryLocation?.address,
        dropLocation: trip.bookingId?.deliveryLocation || null,
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
      .populate('bookingId')
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
      } : null,
      booking: {
        pickup: trip.bookingId?.pickupLocation?.address,
        pickupLocation: trip.bookingId?.pickupLocation || null,
        drop: trip.bookingId?.deliveryLocation?.address,
        dropLocation: trip.bookingId?.deliveryLocation || null,
        pickupDate: trip.bookingId?.pickupDate
      }
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

// Update driver location for live tracking
const updateDriverLocation = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { lat, lng, address } = req.body;
    const driverId = req.driver?._id;

    if (!driverId) {
      return res.status(400).json({ message: 'Driver profile not found' });
    }

    const trip = await Trip.findOne({ _id: tripId, driverId });
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.currentLocation = {
      lat,
      lng,
      address,
      updatedAt: new Date()
    };

    await trip.save();

    const io = req.app.get("io");
    if (io) {
      io.to(tripId).emit("location-update", {
        latitude: lat,
        longitude: lng,
        address,
        updatedAt: new Date()
      });

    }
    console.log('Driver location updated and emitted via Socket.IO:', { tripId, lat, lng, address });

    return res.json({ message: 'Location updated' });

  } catch (err) {
    console.error("LOCATION UPDATE ERROR:", err);
    return res.status(500).json({ message: err.message });
  }
};



const uploadPOD = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    trip.podUrl = `/uploads/pod/${req.file.filename}`;
    trip.status = 'pod_uploaded';
    await trip.save();

    return res.json({ message: 'POD uploaded successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
};

const getPendingPodTrip = async (req, res) => {
  try {
    const driverId = req.user.driverId;

    const trip = await Trip.findOne({
      driver: driverId,
      status: 'delivered',
      podImage: { $exists: false }
    }).sort({ updatedAt: -1 });

    if (!trip) {
      return res.json({ trip: null });
    }

    res.json({ trip });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to check POD" });
  }
};

// GET /api/trips/pods/pending (admin)
const getPendingPODs = async (req, res) => {


  try {
    //  const trip = await Trip.find()
    //  console.log('All trips:', trip);
    const trips = await Trip.find({

      status: 'pod_uploaded'

    })
      .populate({
        path: 'bookingId',
        populate: {
          path: 'userId',
          select: 'firstName lastName'
        }
      })


      .populate({
        path: 'driverId',
        populate: {
          path: 'userId',
          select: 'firstName lastName'
        }
      })
      .sort({ updatedAt: -1 });

    console.log('all trips', trips);


    const formatted = trips.map(trip => ({
      id: trip._id,
      loadId: trip.bookingId?._id,
      driver: trip.driverId?.userId
        ? `${trip.driverId.userId.firstName} ${trip.driverId.userId.lastName}`
        : 'N/A',
      fromLocation: trip.bookingId?.pickupLocation?.address,
      toLocation: trip.bookingId?.deliveryLocation?.address,
      uploadDate: trip.updatedAt,
      status: 'pod_uploaded',
      images: [`http://54.174.219.57:5000${trip.podUrl}`]
    }));

    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch PODs', error: err.message });
  }
};

// PUT /api/trips/:tripId/approve-pod
const Invoice = require('../models/Invoice');

const approvePOD = async (req, res) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const booking = await Booking.findById(trip.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // 🔥 VERY IMPORTANT — DEBUG
    console.log("Booking Rate Confirmation:", booking.rateConfirmation);

    let baseAmount = 0;

    // 1️⃣ Try rateConfirmation
    if (booking.rateConfirmation?.amount) {
      baseAmount = booking.rateConfirmation.amount;
    }

    // 2️⃣ Try selectedQuote
    else if (booking.selectedQuote?.price) {
      baseAmount = booking.selectedQuote.price;
    }



    trip.status = 'pod_approved';
    await trip.save();

    const invoice = await Invoice.create({
      trip: trip._id,
      user: booking.userId,
      driver: trip.driverId,
      amount: baseAmount,
      totalAmount: baseAmount,
      status: 'pending_payment'
      // ❌ REMOVE paymentMethod here
    });

    console.log('Invoice generated:', invoice);

    return res.json({
      message: 'POD approved. Invoice generated.',
      invoice,
    });

  } catch (err) {
    console.error('Approve POD error:', err);
    return res.status(500).json({
      message: 'Failed to approve POD',
      error: err.message,
    });
  }
};

// PUT /api/trips/:tripId/reject-pod
const rejectPOD = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { reason } = req.body;

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ message: 'Trip not found' });

    trip.status = 'pod_rejected';
    trip.podRejectionReason = reason;
    await trip.save();

    return res.json({ message: 'POD rejected' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to reject POD', error: err.message });
  }
};

module.exports = {
  getAssignedTrips,
  acceptTrip,
  rejectTrip,
  updateTripStatus,
  getTrackingInfo,
  getTripByBooking,
  getAllTrips,
  updateDriverLocation
  , getDriverTrips,
  uploadPOD,
  getPendingPODs,
  approvePOD,
  rejectPOD,
  getPendingPodTrip,
};
