const Message = require('../models/Message');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const { createAndSendNotification } = require('../utils/notificationService');
const formatLoadNumber = (booking) => booking?.loadNumber
  || booking?.referenceNumber
  || `#${String(booking?._id || '').slice(-6).toUpperCase()}`;

// Only the driver assigned to the trip, the shipper who owns the booking, or
// an admin may read/send on a trip's chat thread.
const canAccessTripChat = async (trip, user) => {
  if (user.role === 'admin') return true;
  if (user.role === 'user') return String(trip.bookingId?.userId) === String(user._id);
  if (user.role === 'driver') {
    const driver = await Driver.findById(trip.driverId);
    return !!driver && String(driver.userId) === String(user._id);
  }
  return false;
};

const getMessages = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await Trip.findById(tripId).populate('bookingId');
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (!(await canAccessTripChat(trip, req.user))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const messages = await Message.find({ tripId }).sort({ createdAt: 1 });

    // Admin review must not change the participants' read state.
    if (req.user.role !== 'admin') {
      await Message.updateMany(
        { tripId, senderRole: { $ne: req.user.role }, readAt: null },
        { $set: { readAt: new Date() } }
      );
    }

    return res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getBookingMessages = async (req, res) => {
  try {
    const trips = await Trip.find({ bookingId: req.params.bookingId }).select('_id').lean();
    const tripIds = trips.map((trip) => String(trip._id));
    const messages = tripIds.length
      ? await Message.find({ tripId: { $in: tripIds } }).sort({ createdAt: 1 })
      : [];
    return res.json({ tripIds, messages });
  } catch (err) {
    console.error('Get booking messages error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Trips relevant to this user - one potential chat thread per trip.
const tripsForUser = async (user) => {
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ userId: user._id });
    if (!driver) return [];
    return Trip.find({ driverId: driver._id })
      .populate({ path: 'bookingId', populate: { path: 'userId', select: 'firstName lastName' } })
      .sort({ updatedAt: -1 });
  }
  if (user.role === 'user') {
    const bookings = await Booking.find({ userId: user._id }).select('_id');
    return Trip.find({ bookingId: { $in: bookings.map((b) => b._id) } })
      .populate('bookingId')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .sort({ updatedAt: -1 });
  }
  if (user.role === 'admin') {
    // Admin support view: every trip, so any driver/shipper conversation is reachable.
    return Trip.find({})
      .populate({ path: 'bookingId', populate: { path: 'userId', select: 'firstName lastName' } })
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'firstName lastName' } })
      .sort({ updatedAt: -1 });
  }
  return [];
};

const otherPartyNameFor = (user, trip) => {
  if (user.role === 'driver') {
    return trip.bookingId?.shipper?.name
      || (trip.bookingId?.userId ? `${trip.bookingId.userId.firstName || ''} ${trip.bookingId.userId.lastName || ''}`.trim() : '')
      || 'Shipper';
  }
  if (user.role === 'admin') {
    const driverUser = trip.driverId?.userId;
    const driverName = driverUser ? `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim() : '';
    const shipperName = trip.bookingId?.shipper?.name
      || (trip.bookingId?.userId ? `${trip.bookingId.userId.firstName || ''} ${trip.bookingId.userId.lastName || ''}`.trim() : '');
    return [driverName || 'Driver', shipperName || 'Shipper'].join(' / ');
  }
  const driverUser = trip.driverId?.userId;
  return driverUser ? `${driverUser.firstName || ''} ${driverUser.lastName || ''}`.trim() || 'Driver' : 'Driver';
};

const getConversations = async (req, res) => {
  try {
    const trips = await tripsForUser(req.user);

    // A "conversation" only exists once someone has actually sent a message on
    // that trip - being assigned/booked together doesn't start a chat thread.
    const tripIdsWithMessages = await Message.distinct('tripId', {
      tripId: { $in: trips.map((t) => t._id) },
    });
    const startedTripIds = new Set(tripIdsWithMessages.map((id) => String(id)));
    const startedTrips = trips.filter((trip) => startedTripIds.has(String(trip._id)));

    const conversations = await Promise.all(startedTrips.map(async (trip) => {
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne({ tripId: trip._id }).sort({ createdAt: -1 }),
        Message.countDocuments({ tripId: trip._id, senderRole: { $ne: req.user.role }, readAt: null }),
      ]);
      return {
        tripId: trip._id,
        loadNumber: formatLoadNumber(trip.bookingId),
        otherPartyName: otherPartyNameFor(req.user, trip),
        lastMessage: lastMessage?.text || null,
        lastMessageAt: lastMessage?.createdAt || trip.updatedAt,
        unreadCount,
      };
    }));

    conversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    return res.json(conversations);
  } catch (err) {
    console.error('Get conversations error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const trips = await tripsForUser(req.user);
    const count = await Message.countDocuments({
      tripId: { $in: trips.map((t) => t._id) },
      senderRole: { $ne: req.user.role },
      readAt: null,
    });
    return res.json({ count });
  } catch (err) {
    console.error('Get unread count error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const trip = await Trip.findById(tripId).populate('bookingId');
    if (!trip) return res.status(404).json({ message: 'Trip not found' });
    if (!(await canAccessTripChat(trip, req.user))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const senderName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.role;
    const message = await Message.create({
      tripId,
      senderId: req.user._id,
      senderRole: req.user.role,
      senderName,
      text: text.trim(),
    });

    const io = req.app.get('io');
    if (io) {
      io.to(tripId).emit('chat-message', message);
    }

    const recipientUserId = req.user.role === 'user'
      ? (await Driver.findById(trip.driverId))?.userId
      : trip.bookingId?.userId;
    if (recipientUserId) {
      await createAndSendNotification({
        userId: recipientUserId,
        title: `New message from ${senderName}`,
        body: text.trim().slice(0, 120),
        type: 'chat_message',
        data: { tripId: trip._id },
      });
    }

    return res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { getMessages, getBookingMessages, sendMessage, getConversations, getUnreadCount };
