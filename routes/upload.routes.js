const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload.middleware');
const { requireAuth } = require('../middlewares/auth.middleware');

// POST /api/upload/signature
router.post('/signature', requireAuth, upload.single('signature'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileUrl = `/uploads/signatures/${req.file.filename}`;
    return res.json({
      success: true,
      message: 'Signature uploaded successfully',
      fileUrl
    });
  } catch (err) {
    console.error('[UPLOAD] Error uploading signature:', err);
    return res.status(500).json({ message: 'Failed to upload signature', error: err.message });
  }
});

// POST /api/upload/pod
router.post('/pod', requireAuth, upload.single('pod'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileUrl = `/uploads/pods/${req.file.filename}`;
    return res.json({
      success: true,
      message: 'POD uploaded successfully',
      fileUrl
    });
  } catch (err) {
    console.error('[UPLOAD] Error uploading POD:', err);
    return res.status(500).json({ message: 'Failed to upload POD', error: err.message });
  }
});

module.exports = router;
