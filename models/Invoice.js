const mongoose = require("mongoose");

/*
|--------------------------------------------------------------------------
| Invoice
|--------------------------------------------------------------------------
|
| الفاتورة تختلف عن Payment.
|
| Payment:
| العملية المالية.
|
| Invoice:
| الوثيقة الخاصة بالفترة والفوترة.
|
|--------------------------------------------------------------------------
*/

const invoiceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true
    },

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    providerInvoiceId: {
      type: String,
      default: "",
      index: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      required: true,
      uppercase: true
    },

    status: {
      type: String,

      enum: [
        "draft",
        "open",
        "paid",
        "void",
        "uncollectible"
      ],

      default: "open"
    },

    periodStart: {
      type: Date,
      default: null
    },

    periodEnd: {
      type: Date,
      default: null
    },

    paidAt: {
      type: Date,
      default: null
    },

    invoiceUrl: {
      type: String,
      default: ""
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "Invoice",
  invoiceSchema
);