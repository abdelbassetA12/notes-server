const mongoose = require("mongoose");

/*
|--------------------------------------------------------------------------
| Payment
|--------------------------------------------------------------------------
|
| يمثل عملية مالية واحدة.
|
| Subscription = الاشتراك
|
| Payment = عملية الدفع
|
| لذلك لا نخلط الاثنين.
|
|--------------------------------------------------------------------------
*/

const paymentSchema = new mongoose.Schema(
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

    provider: {
      type: String,
      required: true,
      lowercase: true
    },

    providerPaymentId: {
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
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded"
      ],

      default: "pending",

      index: true
    },

    type: {
      type: String,

      enum: [
        "subscription",
        "upgrade",
        "downgrade",
        "renewal",
        "one_time"
      ],

      default: "subscription"
    },

    paidAt: {
      type: Date,
      default: null
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

/*
|--------------------------------------------------------------------------
| منع تكرار نفس العملية المالية
|--------------------------------------------------------------------------
*/

paymentSchema.index(
  {
    provider: 1,
    providerPaymentId: 1
  },
  {
    unique: true,

    partialFilterExpression: {
      providerPaymentId: {
        $type: "string",
        $ne: ""
      }
    }
  }
);

module.exports = mongoose.model(
  "Payment",
  paymentSchema
);