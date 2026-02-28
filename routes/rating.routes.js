const express = require('express');
const { requireAuth } = require('../middlewares/auth.middleware');
const { submitRating, getDriverRatings,getAllRatings } = require('../controllers/rating.controller');
const Rating = require('../models/Rating');

const router = express.Router();

// User submits rating
router.post('/', requireAuth, submitRating);

// Admin views all ratings
router.get('/admin', requireAuth, getAllRatings);

// Driver views ratings
router.get('/my-ratings', requireAuth, getDriverRatings);
router.get('/check/:tripId', requireAuth, async (req, res) => {
  const existing = await Rating.findOne({
    trip: req.params.tripId,
    user: req.user._id
  });

  res.json({ alreadyRated: !!existing });
});

module.exports = router;