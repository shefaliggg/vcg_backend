const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const {
  getDriverProfile,
  getDriverDocuments,
  onboarding,
  updateDriverProfile,
  updateAvailability,
  updateBankDetails,
  verifyBank,
  updateLicenseInfo,
  submitDriverInfo,
  submitCdlInfo,
  submitQualification,
  submitTruckInfo,
  submitTruckDocuments,
  submitAgreements,
} = require('../controllers/driver.controller');

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

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

router.get('/me', requireAuth, requireRole('driver'), getDriverProfile);
router.get('/me/documents', requireAuth, requireRole('driver'), getDriverDocuments);

router.post(
  '/onboarding',
  requireAuth,
  requireRole('driver'),
  upload.fields([{ name: 'license', maxCount: 1 }, { name: 'rc', maxCount: 1 }]),
  onboarding
);

// Driver onboarding steps (CP Driver US redesign)
router.put('/me/driver-info', requireAuth, requireRole('driver'), submitDriverInfo);
router.put(
  '/me/cdl-info',
  requireAuth,
  requireRole('driver'),
  upload.single('cdlDocument'),
  submitCdlInfo
);
router.put(
  '/me/qualification',
  requireAuth,
  requireRole('driver'),
  upload.single('medicalCertDocument'),
  submitQualification
);
router.put('/me/truck-info', requireAuth, requireRole('driver'), submitTruckInfo);
router.put(
  '/me/truck-documents',
  requireAuth,
  requireRole('driver'),
  upload.fields([
    { name: 'registration', maxCount: 1 },
    { name: 'insurance', maxCount: 1 },
    { name: 'inspection', maxCount: 1 },
    { name: 'operatingAuthority', maxCount: 1 },
  ]),
  submitTruckDocuments
);
router.put('/me/agreements', requireAuth, requireRole('driver'), submitAgreements);

router.put('/me', requireAuth, requireRole('driver'), updateDriverProfile);
router.put('/me/license',requireAuth,requireRole('driver'),updateLicenseInfo)
router.put('/:driverId/availability', requireAuth, requireRole('driver'), updateAvailability);

router.put(
  '/me/bank',
  requireAuth,
  updateBankDetails
);

router.put(
  "/:id/verify-bank",
  requireAuth,
  requireRole("admin"),
  verifyBank
);

module.exports = router;
