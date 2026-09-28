const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ShipperDocument = require('../models/ShipperDocument');

// CP Shipper (US) onboarding — step order used to decide whether a save should
// advance shipperOnboardingStep (only moves forward, editing an earlier step later
// never regresses it).
const SHIPPER_STEPS = [
  'your_info', 'account_type', 'business_info', 'primary_location',
  'billing_info', 'documents', 'terms', 'signature', 'submitted', 'complete',
];

// Documents every shipper must have on file before their application can be submitted
// for admin review. 'other' is optional supporting paperwork.
const REQUIRED_SHIPPER_DOC_TYPES = ['business_license', 'insurance_coi', 'w9'];

const advanceShipperStep = (user, nextStep) => {
  const currentIdx = SHIPPER_STEPS.indexOf(user.shipperOnboardingStep || 'your_info');
  const nextIdx = SHIPPER_STEPS.indexOf(nextStep);
  if (nextIdx > currentIdx) user.shipperOnboardingStep = nextStep;
};

const requireShipper = (req, res) => {
  if (req.user.role !== 'user') {
    res.status(403).json({ success: false, message: 'Not authorized' });
    return null;
  }
  return req.user;
};

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
    const { firstName, lastName, phone, companyProfile } = req.body;

    const userId = req.params.userId || req.user._id;

    // Authorization check
    if (req.user.role !== 'admin' && userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this profile' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update basic fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;

    // 🔥 Correct nested update
    if (companyProfile) {
      if (!user.companyProfile) {
        user.companyProfile = {};
      }

      if (companyProfile.companyName !== undefined)
        user.companyProfile.companyName = companyProfile.companyName;

      if (companyProfile.gstNumber !== undefined)
        user.companyProfile.gstNumber = companyProfile.gstNumber;
    }

    await user.save();

    const updatedUser = await User.findById(userId).select('-passwordHash');

    return res.json({
      message: 'Profile updated successfully',
      user: updatedUser,
    });

  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: 'Update failed' });
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

// CP Shipper onboarding — "Your Information"
const saveShipperYourInfo = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const { firstName, lastName, phone, email } = req.body;
    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = phone;
    if (email && !user.email) user.email = email;
    advanceShipperStep(user, 'account_type');
    await user.save();
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[SHIPPER] Error saving your-info:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CP Shipper onboarding — "What type of shipper are you?"
const saveShipperAccountType = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const { accountType } = req.body;
    if (!['individual', 'business'].includes(accountType)) {
      return res.status(400).json({ success: false, message: 'accountType must be individual or business' });
    }
    user.accountType = accountType;
    // Individual accounts skip Business Information entirely.
    advanceShipperStep(user, accountType === 'business' ? 'business_info' : 'primary_location');
    await user.save();
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[SHIPPER] Error saving account-type:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CP Shipper onboarding — "Business Information" (business accounts only)
const saveShipperBusinessInfo = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    if (user.accountType !== 'business') {
      return res.status(400).json({ success: false, message: 'Business information only applies to business accounts' });
    }
    const { companyName, billingAddress, city, state, zip, phone, email } = req.body;
    if (!companyName || !billingAddress || !city || !state || !zip) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    // No EIN/tax ID field here by design — collected later only if billing/compliance needs it.
    user.companyProfile = { ...(user.companyProfile || {}), companyName, billingAddress, city, state, zip, phone, email };
    advanceShipperStep(user, 'primary_location');
    await user.save();
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[SHIPPER] Error saving business-info:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CP Shipper onboarding — "Primary Location" (skippable)
const saveShipperPrimaryLocation = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const { skipped, line1, city, state, zip } = req.body;
    if (!skipped) {
      if (!line1 || !city || !state || !zip) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }
      user.primaryLocation = { line1, city, state, zip };
    }
    advanceShipperStep(user, 'billing_info');
    await user.save();
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[SHIPPER] Error saving primary-location:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CP Shipper onboarding — "Billing Information"
const saveShipperBillingInfo = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const { contactName, email, phone, paymentTerms, preferredPaymentMethod } = req.body;
    if (!contactName || !email || !phone || !paymentTerms || !preferredPaymentMethod) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    user.billingProfile = { contactName, email, phone, paymentTerms, preferredPaymentMethod };
    advanceShipperStep(user, 'documents');
    await user.save();
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[SHIPPER] Error saving billing-info:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const relativeShipperUploadPath = (file) => (file ? `uploads/shippers/${file.filename}` : null);

// CP Shipper onboarding — "Required Documents"
const uploadShipperDocuments = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;

    const fields = ['businessLicense', 'insuranceCoi', 'w9', 'other'];
    const fieldToDocType = { businessLicense: 'business_license', insuranceCoi: 'insurance_coi', w9: 'w9', other: 'other' };

    for (const field of fields) {
      const file = req.files?.[field]?.[0];
      if (!file) continue;
      await ShipperDocument.findOneAndUpdate(
        { userId: user._id, docType: fieldToDocType[field] },
        {
          userId: user._id,
          docType: fieldToDocType[field],
          fileUrl: relativeShipperUploadPath(file),
          fileName: file.originalname,
          status: 'pending',
          rejectionReason: undefined,
          reviewedAt: undefined,
          reviewedBy: undefined,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const documents = await ShipperDocument.find({ userId: user._id });
    const missing = REQUIRED_SHIPPER_DOC_TYPES.filter((docType) => !documents.some((d) => d.docType === docType));
    if (missing.length) {
      return res.status(400).json({ success: false, message: 'Missing required documents', missing, data: { documents } });
    }

    advanceShipperStep(user, 'terms');
    await user.save();
    return res.json({ success: true, data: { user, documents } });
  } catch (err) {
    console.error('[SHIPPER] Error uploading documents:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getShipperDocuments = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const documents = await ShipperDocument.find({ userId: user._id });
    return res.json({ success: true, data: documents });
  } catch (err) {
    console.error('[SHIPPER] Error getting documents:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CP Shipper onboarding — "Shipper Agreement"
const acceptShipperTerms = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const now = new Date();
    user.agreements = {
      tos: { accepted: true, acceptedAt: now },
      privacyPolicy: { accepted: true, acceptedAt: now },
      shipperAgreement: { accepted: true, acceptedAt: now },
    };
    advanceShipperStep(user, 'signature');
    await user.save();
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error('[SHIPPER] Error accepting terms:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// CP Shipper onboarding — closing agreement step; submits the completed application for
// mandatory admin review (mirrors Driver's submitAgreements: flips approvalStatus
// to 'pending' only once every prior step is actually complete). The shipper checks off
// agreement to VCG Transport's Terms & Conditions and Privacy Policy in place of a
// hand-drawn signature.
const submitShipperApplication = async (req, res) => {
  try {
    const user = requireShipper(req, res);
    if (!user) return;
    const { agreedToTerms } = req.body;
    if (!agreedToTerms) {
      return res.status(400).json({ success: false, message: 'You must agree to the Terms & Conditions and Privacy Policy' });
    }

    const documents = await ShipperDocument.find({ userId: user._id });
    const missing = [];
    if (!user.companyProfile?.companyName && user.accountType === 'business') missing.push('businessInfo');
    if (!user.billingProfile?.contactName) missing.push('billingInfo');
    REQUIRED_SHIPPER_DOC_TYPES.forEach((docType) => {
      if (!documents.some((d) => d.docType === docType)) missing.push(docType);
    });
    if (!user.agreements?.shipperAgreement?.accepted) missing.push('shipperAgreement');
    if (missing.length) {
      return res.status(400).json({ success: false, message: 'Onboarding is incomplete', missing });
    }

    user.signedAt = new Date();
    user.shipperOnboardingStep = 'submitted';
    user.shipperApprovalStatus = 'pending';
    await user.save();

    return res.json({ success: true, message: 'Application submitted. Await admin review.', data: user });
  } catch (err) {
    console.error('[SHIPPER] Error submitting application:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
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
  getAdminProfile,
  saveShipperYourInfo,
  saveShipperAccountType,
  saveShipperBusinessInfo,
  saveShipperPrimaryLocation,
  saveShipperBillingInfo,
  uploadShipperDocuments,
  getShipperDocuments,
  acceptShipperTerms,
  submitShipperApplication,
};
