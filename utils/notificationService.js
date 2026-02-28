const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendPush } = require("../services/notification.service");

async function createAndSendNotification({ userId, title, body, type, data }) {
  try {

    // 1️⃣ Save in DB
    await Notification.create({
      user: userId,
      title,
      body,
      type,
      data,
      isRead: false
    });

    // 2️⃣ Get push token
    const user = await User.findById(userId);

    if (!user?.expoPushToken) return;

    // 3️⃣ Send push
    await sendPush(user.expoPushToken, title, body, data);

  } catch (err) {
    console.error("Notification error:", err.message);
  }
}

module.exports = { createAndSendNotification };