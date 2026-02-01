const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

const requireDriverApproved = (req, res, next) => {
  if (!req.user || req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Driver role required' });
  }
  if (!req.driver) return res.status(403).json({ message: 'Driver record missing' });
  if (req.driver.approvalStatus !== 'approved') {
    return res.status(403).json({ message: 'Driver not approved' });
  }
  next();
};

module.exports = { requireRole, requireDriverApproved };
