const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { reportIssue, getMyIssues } = require('../controllers/issue.controller');

router.post('/', requireAuth, requireRole('driver'), reportIssue);
router.get('/mine', requireAuth, requireRole('driver'), getMyIssues);

module.exports = router;
