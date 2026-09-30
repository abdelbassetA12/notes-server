 
const mongoose = require("mongoose");

/**
 * |--------------------------------------------------------------------------
 * SubscriptionEvent
 * |--------------------------------------------------------------------------
 *
 * يسجل Webhooks القادمة من شركات الدفع.
 *
 * أهميته:
 *
 * إذا أرسلت الشركة نفس Webhook مرتين،
 * لا نريد تنفيذ العملية مرتين.
 *
 * |--------------------------------------------------------------------------
 */

const subscriptionEventSchema =
  new mongoose.Schema(
    {
      user: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true
      },

      subscription: {
        type:
          mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
        default: null,
        index: true
      },

      provider: {
        type: String,
        required: true,
        lowercase: true
      },

      providerEventId: {
        type: String,
        required: true
      },

      eventType: {
        type: String,
        required: true
      },

      /**
       * |--------------------------------------------------------------------------
       * الاسم الداخلي الموحد للحدث
       * |--------------------------------------------------------------------------
       */

      normalizedType: {
        type: String,

        enum: [
          "CHECKOUT_COMPLETED",

          "PAYMENT_SUCCEEDED",

          "PAYMENT_FAILED",

          "PAYMENT_REFUNDED",

          "SUBSCRIPTION_CREATED",

          "SUBSCRIPTION_UPDATED",

          "SUBSCRIPTION_CANCELED",

          "INVOICE_PAID",

          "INVOICE_FAILED",

          "INVOICE_PAYMENT_FAILED",

          "UNKNOWN"
        ],

        default: "UNKNOWN"
      },

      /**
       * البيانات الموحدة للحدث
       */

      data: {
        type:
          mongoose.Schema.Types.Mixed,
        default: {}
      },

      /**
       * هل تمت معالجة الحدث؟
       */

      processed: {
        type: Boolean,
        default: false,
        index: true
      },

      processedAt: {
        type: Date,
        default: null
      },

      processingError: {
        type: String,
        default: ""
      }
    },

    {
      timestamps: true
    }
  );

/**
 * |--------------------------------------------------------------------------
 * منع تسجيل نفس Webhook مرتين
 * |--------------------------------------------------------------------------
 */

subscriptionEventSchema.index(
  {
    provider: 1,
    providerEventId: 1
  },
  {
    unique: true
  }
);

module.exports =
  mongoose.model(
    "SubscriptionEvent",
    subscriptionEventSchema
  );
 
