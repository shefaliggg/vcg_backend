const { Expo } = require('expo-server-sdk');
const expo = new Expo();

const sendPush = async (pushToken, title, body, data = {}) => {
  if (!Expo.isExpoPushToken(pushToken)) return;

  const message = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  await expo.sendPushNotificationsAsync([message]);
};

module.exports = { sendPush };