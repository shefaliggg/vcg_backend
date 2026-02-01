const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { getDriverProfile, onboarding, updateDriverProfile, updateAvailability } = require('../controllers/driver.controller');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'drivers');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}_${file.fieldname}${ext}`);
  }
});

const upload = multer({ storage });

router.get('/me', requireAuth, requireRole('driver'), getDriverProfile);

router.post(
  '/onboarding',
  requireAuth,
  requireRole('driver'),
  upload.fields([{ name: 'license', maxCount: 1 }, { name: 'rc', maxCount: 1 }]),
  onboarding
);

router.put('/:driverId', requireAuth, requireRole('driver'), updateDriverProfile);

router.put('/:driverId/availability', requireAuth, requireRole('driver'), updateAvailability);

module.exports = router;
