const express = require('express');
const router = express.Router();
const { register, login, me, adminLogin } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.get('/me', requireAuth, me);

module.exports = router;
