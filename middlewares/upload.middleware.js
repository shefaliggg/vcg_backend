const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure storage for different upload types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = 'uploads';
    
    if (req.body.uploadType === 'signature') {
      uploadDir = path.join('uploads', 'signatures');
    } else if (req.body.uploadType === 'pod') {
      uploadDir = path.join('uploads', 'pods');
    } else if (req.body.uploadType === 'truck' || file.fieldname === 'truckImage') {
      uploadDir = path.join('uploads', 'trucks');
    }
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images and PDFs
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image and PDF files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

module.exports = upload;
