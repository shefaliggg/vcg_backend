const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Get current user profile
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[USER] Error getting profile:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, companyName, gstNumber } = req.body;
    const userId = req.params.userId || req.user._id;

    // Check if user can update this profile
    if (req.user.role !== 'admin' && userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (companyName !== undefined) user.companyName = companyName;
    if (gstNumber !== undefined) user.gstNumber = gstNumber;

    await user.save();

    const updatedUser = await User.findById(userId).select('-passwordHash');
    return res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      data: updatedUser 
    });
  } catch (err) {
    console.error('[USER] Error updating profile:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.params.userId || req.user._id;

    // Only allow users to change their own password
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash and update new password
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (err) {
    console.error('[USER] Error changing password:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get user by ID (admin only)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[USER] Error getting user:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update company profile
const updateCompanyProfile = async (req, res) => {
  try {
    const { companyName, billingAddress, email, phone, taxId } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.companyProfile = {
      companyName: companyName || user.companyProfile?.companyName,
      billingAddress: billingAddress || user.companyProfile?.billingAddress,
      email: email || user.companyProfile?.email,
      phone: phone || user.companyProfile?.phone,
      taxId: taxId || user.companyProfile?.taxId
    };
    await user.save();

    return res.json({
      success: true,
      message: 'Company profile updated',
      data: user.companyProfile
    });
  } catch (err) {
    console.error('[USER] Error updating company profile:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get company profile
const getCompanyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      success: true,
      data: user.companyProfile || {}
    });
  } catch (err) {
    console.error('[USER] Error getting company profile:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update admin profile (admin only)
const updateAdminProfile = async (req, res) => {
  try {
    const { dispatcherName, dispatcherEmail, dispatcherPhone, salespersonName, salespersonEmail, salespersonPhone } = req.body;
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    user.adminProfile = {
      dispatcherName: dispatcherName || user.adminProfile?.dispatcherName,
      dispatcherEmail: dispatcherEmail || user.adminProfile?.dispatcherEmail,
      dispatcherPhone: dispatcherPhone || user.adminProfile?.dispatcherPhone,
      salespersonName: salespersonName || user.adminProfile?.salespersonName,
      salespersonEmail: salespersonEmail || user.adminProfile?.salespersonEmail,
      salespersonPhone: salespersonPhone || user.adminProfile?.salespersonPhone
    };
    await user.save();

    return res.json({
      success: true,
      message: 'Admin profile updated',
      data: user.adminProfile
    });
  } catch (err) {
    console.error('[USER] Error updating admin profile:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Get admin profile
const getAdminProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    return res.json({
      success: true,
      data: user.adminProfile || {}
    });
  } catch (err) {
    console.error('[USER] Error getting admin profile:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getMe,
  updateProfile,
  changePassword,
  getUserById,
  updateCompanyProfile,
  getCompanyProfile,
  updateAdminProfile,
  getAdminProfile
};
