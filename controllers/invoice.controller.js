const Invoice = require('../models/Invoice');
const stripe = require("../config/stripe");
const bankDetails = require("../config/bankDetails");
const getAllInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .populate('trip')
      .populate('user')
      .populate('driver');

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
};

const getMyInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ user: req.user._id })
      .populate({
        path: 'trip',
        populate: {
          path: 'bookingId',
          select: 'pickupLocation deliveryLocation pickupDate deliveryDate'
        }
      })
      .sort({ createdAt: -1 });

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
};

const selectPaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body; // 'online' or 'offline'

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice)
      return res.status(404).json({ message: 'Invoice not found' });

    if (invoice.status !== 'pending_payment')
      return res.status(400).json({ message: 'Invalid invoice status' });

    invoice.paymentMethod = paymentMethod;

    if (paymentMethod === 'online') {
      const onlineFee = invoice.amount * 0.05; // 5%
      invoice.onlineFee = onlineFee;
      invoice.totalAmount = invoice.amount + onlineFee;
    } else {
      invoice.onlineFee = 0;
      invoice.totalAmount = invoice.amount;
    }

    await invoice.save();

    res.json({
      message: 'Payment method selected',
      invoice
    });

  } catch (err) {
    res.status(500).json({ message: 'Failed to update payment method' });
  }
};

const payInvoice = async (req, res) => {
  try {
    const { paymentMethod } = req.body;

    const invoice = await Invoice.findById(req.params.id);

    if (!invoice)
      return res.status(404).json({ message: "Invoice not found" });

    if (invoice.status !== "pending_payment")
      return res.status(400).json({ message: "Invoice not payable" });

    invoice.paymentMethod = paymentMethod;

    // 🟣 ONLINE PAYMENT
    if (paymentMethod === "online") {

      const fee = invoice.amount * 0.05;
      invoice.onlineFee = fee;
      invoice.totalAmount = invoice.amount + fee;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Invoice #${invoice._id}`,
              },
              unit_amount: Math.round(invoice.totalAmount * 100),
            },
            quantity: 1,
          },
        ],
        success_url: "http://192.168.30.28:5000/payment-success",
        cancel_url: "http://192.168.30.28:5000/payment-cancel",
        metadata: {
          invoiceId: invoice._id.toString(),
        },
      });

      invoice.stripeSessionId = session.id;
      invoice.status = "payment_processing";
      invoice.paymentMethod = "online";
      await invoice.save();

      invoice.status = "payment_processing";
      await invoice.save();

      return res.json({
        checkoutUrl: session.url,
      });
    }

    // 🏦 OFFLINE PAYMENT
    // 🏦 OFFLINE PAYMENT
    if (paymentMethod === "offline") {
   

      invoice.onlineFee = 0;
      invoice.totalAmount = invoice.amount;
      

      await invoice.save();

      return res.json({
        message: "Bank transfer selected",
        bankDetails: {
          ...bankDetails,
          referenceNote: `Use Invoice ID ${invoice._id} as payment reference`,
          amount: invoice.totalAmount,
        },

        
      });

      
      
    }

    if (paymentMethod === "offline_confirm") {

  invoice.status = "awaiting_bank_transfer";
  await invoice.save();

  return res.json({
    message: "Transfer submitted for verification"
  });
}

  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ message: "Payment failed" });
  }
};

const confirmBankTransfer = async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice)
    return res.status(404).json({ message: "Invoice not found" });

  if (invoice.status !== "awaiting_bank_transfer")
    return res.status(400).json({ message: "Invalid status" });

  invoice.status = "paid";
  invoice.paidAt = new Date();
  await invoice.save();

  const io = req.app.get("io");
  io.to(invoice.user.toString()).emit("paymentUpdate", {
    status: "paid",
    message: "Bank transfer confirmed ✅",
  });

  res.json({ message: "Payment confirmed" });
};

module.exports = { getAllInvoices, getMyInvoices, selectPaymentMethod, payInvoice,confirmBankTransfer };