const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendMail = ({ from, to, subject, html }) =>
  transporter.sendMail({
    from: from || `"VCG Transport" <${process.env.SMTP_FROM}>`,
    to,
    subject,
    html,
  });

module.exports = { sendMail };
