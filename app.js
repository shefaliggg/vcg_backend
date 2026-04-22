const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const stripe = require('./config/stripe');
const fs = require('fs');


const authRoutes = require('./routes/auth.routes');
const driverRoutes = require('./routes/driver.routes');
const adminRoutes = require('./routes/admin.routes');
const userRoutes = require('./routes/user.routes');
const bookingRoutes = require('./routes/booking.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const tripRoutes = require('./routes/trip.routes');
const uploadRoutes = require('./routes/upload.routes');
const Invoice = require('./models/Invoice');
const settlementRoutes = require('./routes/settlement.routes');
const ratingRoutes = require('./routes/rating.routes');
const notificationRoutes = require('./routes/notification.routes');
const app = express();

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://54.174.219.57:5000',
  'http://54.174.219.57',
];

const envAllowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])];

const corsOptions = {
  origin(origin, callback) {
    // Allow requests from non-browser clients (mobile apps, curl, Postman).
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.set('corsOptions', corsOptions);

app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("Webhook signature failed.", err.message);
      return res.status(400).send(`Webhook Error`);
    }

   if (event.type === "checkout.session.completed") {
  const session = event.data.object;

  const invoiceId = session.metadata?.invoiceId;

  if (!invoiceId) {
    console.log("❌ No invoiceId in session metadata");
    return res.json({ received: true });
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    console.log("❌ Invoice not found");
    return res.json({ received: true });
  }

  invoice.status = "paid";
  invoice.stripePaymentIntentId = session.payment_intent;
  await invoice.save();

  const userId = invoice.user.toString();

  req.app.get("io").to(userId).emit("paymentUpdate", {
    status: "paid",
    message: "Payment successful 🎉",
  });

  console.log("✅ Invoice marked as PAID");
}
    if (event.type === "payment_intent.payment_failed") {
  const paymentIntent = event.data.object;

  // 🔥 Find checkout session using payment intent
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntent.id,
  });

  if (!sessions.data.length) {
    console.log("No session found for failed payment");
    return res.json({ received: true });
  }

  const session = sessions.data[0];
  const invoiceId = session.metadata?.invoiceId;

  if (!invoiceId) {
    return res.json({ received: true });
  }

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    return res.json({ received: true });
  }

  invoice.status = "cancelled";
  invoice.paymentFailureReason =
    paymentIntent.last_payment_error?.message || "Payment failed";

  await invoice.save();

  console.log("❌ Invoice marked as FAILED");
}
    res.json({ received: true });
  }
);

app.use(express.json());

app.use(morgan('dev'));

// Serve static files BEFORE routes for better performance
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ratings', ratingRoutes);

app.use('/api/invoices', invoiceRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/upload', uploadRoutes);



app.get('/rate-confirmations/:fileName', (req, res) => {
  const filePath = path.join(
    __dirname,
    'uploads',
    'rate-confirmations',
    req.params.fileName
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});


   app.get("/payment-success", (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;font-family:sans-serif;margin-top:50px;">
        <h1 style="color:green;">✅ Payment Successful</h1>
        <p>You can safely close this window.</p>
      </body>
    </html>
  `);
});

app.get("/payment-cancel", (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;font-family:sans-serif;margin-top:50px;">
        <h1 style="color:red;">❌ Payment Cancelled</h1>
        <p>You may try again.</p>
      </body>
    </html>
  `);
});
// 404
app.use((req, res) => res.status(404).json({ message: 'Not found' }));

module.exports = app;
