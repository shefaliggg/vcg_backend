const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const userController = require('../controllers/user.controller');
const User = require('../models/User');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const shipperUploadsDir = path.join(__dirname, '..', 'uploads', 'shippers');
if (!fs.existsSync(shipperUploadsDir)) {
  fs.mkdirSync(shipperUploadsDir, { recursive: true });
}

const ALLOWED_DOC_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
  'application/pdf',
];
const ALLOWED_DOC_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'pdf'];

// Some pickers (Android content:// URIs, RN Web blobs) hand multer a generic or
// missing mimetype even for a perfectly valid file - fall back to the extension
// instead of rejecting it outright.
const isAllowedDocument = (file) => {
  const mimeType = (file.mimetype || '').toLowerCase();
  if (mimeType && mimeType !== 'application/octet-stream') {
    return ALLOWED_DOC_MIME_TYPES.includes(mimeType);
  }
  const ext = (path.extname(file.originalname || '').slice(1) || '').toLowerCase();
  return ALLOWED_DOC_EXTENSIONS.includes(ext);
};

const shipperUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, shipperUploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.fieldname}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const ok = isAllowedDocument(file);
    cb(ok ? null : new Error('Unsupported file type'), ok);
  },
});

// Get current user profile
router.get('/me', requireAuth, userController.getMe);

// Update user profile
router.put('/:userId', requireAuth, userController.updateProfile);

// Change password
router.put('/:userId/password', requireAuth, userController.changePassword);

// Admin only - get user by ID
router.get('/:userId', requireAuth, requireRole('admin'), userController.getUserById);

// Company profile endpoints
router.get('/profile/company', requireAuth, userController.getCompanyProfile);
router.put('/profile/company', requireAuth, userController.updateCompanyProfile);

// Admin profile endpoints
router.get('/profile/admin', requireAuth, userController.getAdminProfile);
router.put('/profile/admin', requireAuth, userController.updateAdminProfile);

// CP Shipper (US) onboarding — see TruckDoc/workflows/workflow-02-profile.html
router.put('/shipper/your-info', requireAuth, userController.saveShipperYourInfo);
router.put('/shipper/account-type', requireAuth, userController.saveShipperAccountType);
router.put('/shipper/business-info', requireAuth, userController.saveShipperBusinessInfo);
router.put('/shipper/primary-location', requireAuth, userController.saveShipperPrimaryLocation);
router.put('/shipper/billing-info', requireAuth, userController.saveShipperBillingInfo);
router.get('/shipper/documents', requireAuth, userController.getShipperDocuments);
router.put(
  '/shipper/documents',
  requireAuth,
  shipperUpload.fields([
    { name: 'businessLicense', maxCount: 1 },
    { name: 'insuranceCoi', maxCount: 1 },
    { name: 'w9', maxCount: 1 },
    { name: 'other', maxCount: 1 },
  ]),
  // multer's fileFilter/size-limit errors would otherwise fall through to
  // Express's default HTML error page (no global error handler is set up in
  // app.js) - surface them as JSON instead, same shape as every other 400 here.
  (err, req, res, next) => {
    if (!err) return next();
    console.error('[shipper documents upload] Error:', err.message);
    return res.status(400).json({ success: false, message: err.message || 'Failed to upload documents' });
  },
  userController.uploadShipperDocuments
);
router.post('/shipper/accept-terms', requireAuth, userController.acceptShipperTerms);
router.post('/shipper/submit-application', requireAuth, userController.submitShipperApplication);

router.post('/save-push-token', requireAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    pushToken: req.body.pushToken
  });

  res.json({ success: true });
});

module.exports = router;
