 
const router = require("express").Router();

const {
  getProvider
} = require("../services/payments/providerManager");

const {
  processWebhookEvent
} = require(
  "../services/subscriptions/subscriptionService"
);

/**
 * |--------------------------------------------------------------------------
 * POST /api/subscription-webhooks/:provider
 * |--------------------------------------------------------------------------
 *
 * أمثلة:
 *
 * /api/subscription-webhooks/stripe
 * /api/subscription-webhooks/paddle
 *
 * لا نضع auth هنا.
 *
 * لأن الطلب يأتي من شركة الدفع مباشرة.
 *
 * |--------------------------------------------------------------------------
 */

router.post(
  "/:provider",
  async (req, res) => {
    console.log("========================================");
console.log("SUBSCRIPTION WEBHOOK RECEIVED");
console.log("Provider:", req.params.provider);
console.log("========================================");
    try {
      /**
       * |--------------------------------------------------------------------------
       * Provider Name
       * |--------------------------------------------------------------------------
       */

      const providerName =
        String(
          req.params.provider || ""
        )
          .toLowerCase()
          .trim();

      if (!providerName) {
        return res.status(400).json({
          success: false,
          error:
            "Payment provider is required"
        });
      }

      /**
       * |--------------------------------------------------------------------------
       * الحصول على Provider
       * |--------------------------------------------------------------------------
       */

      const provider =
        getProvider(providerName);

      /**
       * |--------------------------------------------------------------------------
       * Raw Body
       * |--------------------------------------------------------------------------
       *
       * server.js يستخدم:
       *
       * express.raw()
       *
       * لذلك req.body هنا هو Buffer
       * يحتوي على الـ body الأصلي.
       *
       * StripeProvider.verifyWebhook()
       * يعتمد على request.rawBody.
       *
       * |--------------------------------------------------------------------------
       */

      req.rawBody = req.body;

      /**
       * |--------------------------------------------------------------------------
       * التحقق من Webhook
       * |--------------------------------------------------------------------------
       *
       * StripeProvider يقوم بالتحقق من:
       *
       * - stripe-signature
       * - STRIPE_WEBHOOK_SECRET
       * - rawBody
       *
       * ثم يعيد Stripe Event الأصلي.
       *
       * |--------------------------------------------------------------------------
       */

      const verifiedEvent =
        await provider.verifyWebhook({
          request: req
        });

        console.log("========================================");
console.log("PADDLE WEBHOOK VERIFIED");
console.log("Event:", verifiedEvent?.event_type);
console.log("Data:", JSON.stringify(verifiedEvent?.data, null, 2));
console.log("========================================");

      if (!verifiedEvent) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid webhook event"
        });
      }

      /**
       * |--------------------------------------------------------------------------
       * تحويل الحدث إلى الشكل الموحد
       * |--------------------------------------------------------------------------
       *
       * Provider هو المسؤول عن فهم
       * تفاصيل شركة الدفع.
       *
       * subscriptionService لا يحتاج
       * إلى معرفة Stripe.
       *
       * |--------------------------------------------------------------------------
       */

      const normalizedEvent =
        provider.normalizeWebhookEvent(
          verifiedEvent
        );

        console.log("========================================");
console.log("PADDLE WEBHOOK NORMALIZED");
console.log(
  JSON.stringify(normalizedEvent, null, 2)
);
console.log("========================================");

      if (!normalizedEvent) {
        return res.status(400).json({
          success: false,
          error:
            "Unable to normalize webhook event"
        });
      }

      /**
       * |--------------------------------------------------------------------------
       * معالجة الحدث
       * |--------------------------------------------------------------------------
       */
    console.log("========================================");
console.log("PROCESSING SUBSCRIPTION WEBHOOK");
console.log("========================================");
      await processWebhookEvent({
        provider: providerName,
        event: normalizedEvent
      });

      /**
       * |--------------------------------------------------------------------------
       * الرد على شركة الدفع
       * |--------------------------------------------------------------------------
       */

      return res.status(200).json({
        received: true
      });

    } catch (error) {
      console.error(
        "Subscription webhook error:",
        error
      );

      /**
       * نرجع 500 حتى تعرف شركة الدفع
       * أن المعالجة فشلت ويمكنها إعادة المحاولة.
       */

      return res.status(500).json({
        success: false,
        error:
          "Webhook processing failed"
      });
    }
  }
);

module.exports = router;
 
