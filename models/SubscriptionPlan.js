const mongoose = require("mongoose");

/*
|--------------------------------------------------------------------------
| SubscriptionPlan
|--------------------------------------------------------------------------
|
| هذا الـ Model يمثل "الخطة" وليس اشتراك المستخدم.
|
| مثال:
|
| Free
| Pro
| Business
|
| الخطة تحدد:
|
| 1. السعر
| 2. المميزات
| 3. الحدود
| 4. الفترة التجريبية
|
| ولا تحتوي على معلومات مستخدم معين.
|
|--------------------------------------------------------------------------
*/

const subscriptionPlanSchema = new mongoose.Schema(
  {
    // =========================================================
    // معلومات أساسية
    // =========================================================

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 50
    },

    description: {
      type: String,
      default: "",
      maxlength: 500
    },

    // =========================================================
    // نوع الخطة
    // =========================================================

    isFree: {
      type: Boolean,
      default: false
    },

    // =========================================================
    // الأسعار
    // =========================================================

    pricing: {
      monthly: {
        type: Number,
        default: 0,
        min: 0
      },

      yearly: {
        type: Number,
        default: 0,
        min: 0
      },

      currency: {
        type: String,
        default: "USD",
        uppercase: true,
        trim: true
      }
    },

    // =========================================================
    // الفترة التجريبية
    // =========================================================

    trialDays: {
      type: Number,
      default: 0,
      min: 0
    },

    // =========================================================
    // المميزات
    // =========================================================
    /*
     * مثال:
     *
     * advanced_analytics
     * custom_theme
     * marketplace
     *
     * لا نكتب plan === "pro" في بقية المشروع.
     *
     * نعتمد على الميزة نفسها.
     */

    features: [
      {
        key: {
          type: String,
          required: true,
          trim: true
        },

        enabled: {
          type: Boolean,
          default: true
        }
      }
    ],

    // =========================================================
    // حدود الاستخدام
    // =========================================================
    /*
     * -1 = Unlimited
     *
     * مثال:
     *
     * products: 10
     * links: 20
     * storage: 500
     *
     */

    limits: {
      products: {
        type: Number,
        default: 0,
        min: -1
      },

      links: {
        type: Number,
        default: 0,
        min: -1
      },

      storage: {
        type: Number,
        default: 0,
        min: -1
      },

      teamMembers: {
        type: Number,
        default: 1,
        min: -1
      }
    },

    // =========================================================
    // ترتيب الخطة
    // =========================================================

    sortOrder: {
      type: Number,
      default: 0
    },

    // =========================================================
    // حالة الخطة
    // =========================================================

    active: {
      type: Boolean,
      default: true
    },

    // =========================================================
    // معرفات الأسعار لدى شركات الدفع
    // =========================================================
    /*
     * لا نعتمد على Stripe.
     *
     * يمكن أن تكون نفس الخطة مرتبطة بـ:
     *
     * Stripe
     * Paddle
     * Lemon Squeezy
     * ...
     */

    providerPrices: [
      {
        provider: {
          type: String,
          required: true,
          lowercase: true,
          trim: true
        },

        monthlyPriceId: {
          type: String,
          default: ""
        },

        yearlyPriceId: {
          type: String,
          default: ""
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model(
  "SubscriptionPlan",
  subscriptionPlanSchema
);