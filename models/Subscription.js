const mongoose = require("mongoose");

/*
|--------------------------------------------------------------------------
| Subscription
|--------------------------------------------------------------------------
|
| هذا هو اشتراك المستخدم نفسه.
|
| مثال:
|
| User: Abdo
| Plan: Pro
| Status: active
| Billing: monthly
|
|--------------------------------------------------------------------------
*/

const subscriptionSchema = new mongoose.Schema(
  {
    // =========================================================
    // المستخدم
    // =========================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // =========================================================
    // الخطة
    // =========================================================

    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true
    },

    // =========================================================
    // حالة الاشتراك
    // =========================================================

    status: {
      type: String,

      enum: [
        "none",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired"
      ],

      default: "active",

      index: true
    },

    // =========================================================
    // مزود الدفع
    // =========================================================

    provider: {
      type: String,
      default: "internal",
      lowercase: true,
      trim: true
    },

    // =========================================================
    // معرف العميل لدى Provider
    // =========================================================

    providerCustomerId: {
      type: String,
      default: ""
    },

    // =========================================================
    // معرف الاشتراك لدى Provider
    // =========================================================

    providerSubscriptionId: {
      type: String,
      default: "",
      index: true
    },

    // =========================================================
    // دورة الدفع
    // =========================================================

    billingCycle: {
      type: String,

      enum: [
        "monthly",
        "yearly",
        "lifetime"
      ],

      default: "monthly"
    },

    // =========================================================
    // الفترة الحالية
    // =========================================================

    currentPeriodStart: {
      type: Date,
      default: null
    },

    currentPeriodEnd: {
      type: Date,
      default: null,
      index: true
    },

    // =========================================================
    // إلغاء التجديد
    // =========================================================

    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },

    canceledAt: {
      type: Date,
      default: null
    },

    // =========================================================
    // Trial
    // =========================================================

    trialStart: {
      type: Date,
      default: null
    },

    trialEnd: {
      type: Date,
      default: null
    },

    // =========================================================
    // التواريخ
    // =========================================================

    startedAt: {
      type: Date,
      default: Date.now
    },

    endedAt: {
      type: Date,
      default: null
    },

    // =========================================================
    // بيانات إضافية
    // =========================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

subscriptionSchema.index({
  user: 1,
  status: 1
});

/*
|--------------------------------------------------------------------------
| منع أكثر من اشتراك فعال للمستخدم
|--------------------------------------------------------------------------
*/

subscriptionSchema.index(
  { user: 1 },
  {
    unique: true,

    partialFilterExpression: {
      status: {
        $in: [
          "active",
          "trialing",
          "past_due"
        ]
      }
    }
  }
);

module.exports = mongoose.model(
  "Subscription",
  subscriptionSchema
);