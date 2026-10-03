const Issue = require('../models/Issue');
const { notifyAdmins } = require('../utils/notificationService');

const ISSUE_CATEGORIES = ['vehicle_breakdown', 'accident', 'delay', 'load_issue', 'facility_issue', 'other'];

const reportIssue = async (req, res) => {
  try {
    const driverId = req.driver?._id;
    if (!driverId) return res.status(400).json({ message: 'Driver profile not found' });

    const { category, description, tripId } = req.body;
    if (!category || !ISSUE_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: 'A valid issue category is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'A description is required' });
    }

    const issue = await Issue.create({
      driverId,
      tripId: tripId || undefined,
      category,
      description: description.trim(),
    });

    await notifyAdmins({
      title: 'Driver reported an issue',
      body: description.trim().slice(0, 120),
      type: 'issue_reported',
      data: { issueId: issue._id, category },
      io: req.app.get('io'),
    });

    return res.status(201).json({ success: true, data: issue });
  } catch (err) {
    console.error('[reportIssue] Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getMyIssues = async (req, res) => {
  try {
    const driverId = req.driver?._id;
    if (!driverId) return res.status(400).json({ message: 'Driver profile not found' });

    const issues = await Issue.find({ driverId }).sort({ createdAt: -1 });
    return res.json({ success: true, data: issues });
  } catch (err) {
    console.error('[getMyIssues] Error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { reportIssue, getMyIssues };
