const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const multer = require('multer');

const {
  getAssignedTrips,
  acceptTrip,
  rejectTrip,
  updateTripStatus,
  getTrackingInfo,
  getTripByBooking,
  getAllTrips,
  updateDriverLocation,
  getDriverTrips,
  uploadPOD,
  getPendingPODs, 
  approvePOD,
  rejectPOD,
  getPendingPodTrip
} = require('../controllers/trip.controller');



const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/pod');

    // ✅ Auto create folder if not exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    cb(null, `pod-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// Driver routes (must be before parameterized routes)
console.log('[trip.routes.js] Trip router loaded');
router.use((req, res, next) => {
  if (req.path.startsWith('/driver/all')) {
    console.log(`[trip.routes.js] Incoming request: ${req.method} ${req.originalUrl}`);
  }
  next();
});

router.get(
  '/driver/pending-pod',
  requireAuth,
  requireRole('driver'),
  getPendingPodTrip
);
router.get('/driver/all', requireAuth, requireRole('driver'), getDriverTrips);
router.get('/driver/assigned', requireAuth, requireRole('driver'), getAssignedTrips);

// Parameterized driver trip actions
router.post('/:tripId/accept', requireAuth, requireRole('driver'), acceptTrip);
router.post('/:tripId/reject', requireAuth, requireRole('driver'), rejectTrip);
router.put('/:tripId/status', requireAuth, requireRole('driver'), updateTripStatus);
router.post('/:tripId/location', requireAuth, requireRole('driver'), updateDriverLocation);

// Tracking routes (user and admin)
router.get('/:tripId/track', requireAuth, getTrackingInfo);
router.get('/booking/:bookingId', requireAuth, getTripByBooking);

// Admin routes
router.get('/', requireAuth, requireRole('admin'), getAllTrips);

router.post('/:tripId/upload-pod',
  requireAuth,
  requireRole('driver'),
  upload.single('pod'),
  uploadPOD
);

router.get('/pods/pending',
  requireAuth,
  requireRole('admin'),
  getPendingPODs
);

router.put('/:tripId/approve-pod',
  requireAuth,
  requireRole('admin'),
  approvePOD
);

router.put('/:tripId/reject-pod',
  requireAuth,
  requireRole('admin'),
  rejectPOD
);

module.exports = router;
