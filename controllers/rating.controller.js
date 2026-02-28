const Rating = require('../models/Rating');
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');

const submitRating = async (req, res) => {
  try {
    const { tripId, rating, comment } = req.body;

    const trip = await Trip.findById(tripId);
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    // Prevent double rating
    const existing = await Rating.findOne({ trip: tripId });
    if (existing)
      return res.status(400).json({ message: "Trip already rated" });

    const newRating = await Rating.create({
      trip: tripId,
      driver: trip.driverId,
      user: req.user._id,
      rating,
      comment
    });

    // 🔥 Update driver average rating
    const driverRatings = await Rating.find({ driver: trip.driverId });

    const total = driverRatings.reduce((sum, r) => sum + r.rating, 0);
    const avg = total / driverRatings.length;

    await Driver.findByIdAndUpdate(trip.driverId, {
      averageRating: avg.toFixed(2),
      totalRatings: driverRatings.length
    });

    res.json(newRating);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Rating failed" });
  }
};

const getDriverRatings = async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user._id });
  const ratings = await Rating.find({ driver: driver._id })
    .populate('user', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.json(ratings);
};

const getAllRatings = async (req, res) => {
  try {
   const ratings = await Rating.find()
  .populate({
    path: "driver",
    select: "userId",   // only fetch userId from driver
    populate: {
      path: "userId",
      select: "firstName lastName"  // only fetch name
    }
  })
  .populate({
    path: "user",
    select: "firstName lastName companyName"
  })
  .populate({
    path: "trip",
    select: "_id bookingId"
  })
  .sort({ createdAt: -1 });

      console.log('Fetched ratings:', ratings);
      

    const totalReviews = ratings.length;

    const totalStars = ratings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating =
      totalReviews > 0 ? (totalStars / totalReviews).toFixed(1) : 0;

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratings.forEach((r) => breakdown[r.rating]++);

    res.json({
      success: true,
      data: ratings,
      stats: {
        averageRating,
        totalReviews,
        breakdown,
      },
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch ratings' });
  }
};

module.exports = {
  submitRating,
  getDriverRatings,
  getAllRatings,
};