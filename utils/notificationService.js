const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendPush } = require("../services/notification.service");

async function createAndSendNotification({ userId, title, body, type, data, io }) {
  try {

    // 1️⃣ Save in DB
    const notification = await Notification.create({
      user: userId,
      title,
      body,
      type,
      data,
      isRead: false
    });

    // 2️⃣ Get push token
    const user = await User.findById(userId);

    if (io) io.emit(`notification:${userId}`, notification);

    if (!user?.expoPushToken) return;

    // 3️⃣ Send push
    await sendPush(user.expoPushToken, title, body, data);

  } catch (err) {
    console.error("Notification error:", err.message);
  }
}

// Fan out a "needs admin attention" notification (approve/verify/review, etc.)
// to every admin user, so it shows up in the admin app's notification bell.
async function notifyAdmins({ title, body, type, data, io }) {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id expoPushToken');
    await Promise.all(admins.map(async (admin) => {
      const notification = await Notification.create({
        user: admin._id,
        title,
        body,
        type,
        data,
        isRead: false,
      });

      if (io) io.emit(`notification:${admin._id}`, notification);
      if (admin.expoPushToken) await sendPush(admin.expoPushToken, title, body, data);
    }));
  } catch (err) {
    console.error('Admin notification error:', err.message);
  }
}

module.exports = { createAndSendNotification, notifyAdmins };