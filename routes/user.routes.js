const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

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

module.exports = router;
