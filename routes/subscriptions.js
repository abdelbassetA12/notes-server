const router =
  require("express").Router();

const auth =
  require("../middleware/auth");

const SubscriptionPlan =
  require("../models/SubscriptionPlan");

const {
  getUserSubscription,
  ensureFreeSubscription,
  createCheckout,
  changePlan,
  cancelSubscription,
  reactivateSubscription
} =
  require(
    "../services/subscriptions/subscriptionService"
  );

const {
  getEntitlements
} =
  require(
    "../services/subscriptions/entitlementService"
  );

const Payment =
  require("../models/Payment");

const Invoice =
  require("../models/Invoice");


/*
|--------------------------------------------------------------------------
| GET /api/subscriptions/plans
|--------------------------------------------------------------------------
|
| عرض الخطط المتاحة للجميع.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/plans",
  async (req, res) => {

    try {

      const plans =
        await SubscriptionPlan.find({
          active: true
        })
        .sort({
          sortOrder: 1
        })
        .select(
          "-providerPrices"
        );


      res.json({
        success: true,
        plans
      });

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| GET /api/subscriptions/me
|--------------------------------------------------------------------------
|
| الاشتراك الحالي للمستخدم.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  auth,
  async (req, res) => {

    try {

      let subscription =
        await getUserSubscription(
          req.user.id
        );


      /*
       * إذا لم يكن لديه اشتراك،
       * ننشئ Free تلقائيًا.
       */

      if (!subscription) {

        subscription =
          await ensureFreeSubscription(
            req.user.id
          );
      }


      res.json({
        success: true,
        subscription
      });

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| GET /api/subscriptions/entitlements
|--------------------------------------------------------------------------
|
| Frontend يحتاج هذا Endpoint لمعرفة:
|
| ما المميزات؟
| ما الحدود؟
|
|--------------------------------------------------------------------------
*/

router.get(
  "/entitlements",
  auth,
  async (req, res) => {

    try {

      const entitlements =
        await getEntitlements(
          req.user.id
        );


      res.json({
        success: true,
        entitlements
      });

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| POST /api/subscriptions/checkout
|--------------------------------------------------------------------------
|
| يبدأ عملية شراء الخطة.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/checkout",
  auth,
  async (req, res) => {

    try {

      const {
        planId,
        billingCycle
      } = req.body;


      if (!planId) {

        return res.status(400).json({
          error:
            "planId is required"
        });
      }


      const result =
        await createCheckout({

          user: req.user,

          planId,

          billingCycle:
            billingCycle ||
            "monthly"

        });


      res.json({
        success: true,
        ...result
      });

    } catch (error) {

      res.status(400).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| POST /api/subscriptions/change-plan
|--------------------------------------------------------------------------
*/

router.post(
  "/change-plan",
  auth,
  async (req, res) => {

    try {

      const {
        planId,
        billingCycle
      } = req.body;


      if (!planId) {

        return res.status(400).json({
          error:
            "planId is required"
        });
      }


      const result =
        await changePlan({

          user: req.user,

          newPlanId:
            planId,

          billingCycle:
            billingCycle ||
            "monthly"

        });


      res.json({
        success: true,
        ...result
      });

    } catch (error) {

      res.status(400).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| POST /api/subscriptions/cancel
|--------------------------------------------------------------------------
*/

router.post(
  "/cancel",
  auth,
  async (req, res) => {

    try {

      const immediately =
        req.body.immediately === true;


      const result =
        await cancelSubscription({

          userId:
            req.user.id,

          immediately

        });


      res.json({
        success: true,
        ...result
      });

    } catch (error) {

      res.status(400).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| POST /api/subscriptions/reactivate
|--------------------------------------------------------------------------
*/

router.post(
  "/reactivate",
  auth,
  async (req, res) => {

    try {

      const subscription =
        await reactivateSubscription(
          req.user.id
        );


      res.json({
        success: true,
        subscription
      });

    } catch (error) {

      res.status(400).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| GET /api/subscriptions/payments
|--------------------------------------------------------------------------
*/

router.get(
  "/payments",
  auth,
  async (req, res) => {

    try {

      const payments =
        await Payment.find({
          user: req.user.id
        })
        .sort({
          createdAt: -1
        });


      res.json({
        success: true,
        payments
      });

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  }
);


/*
|--------------------------------------------------------------------------
| GET /api/subscriptions/invoices
|--------------------------------------------------------------------------
*/

router.get(
  "/invoices",
  auth,
  async (req, res) => {

    try {

      const invoices =
        await Invoice.find({
          user: req.user.id
        })
        .sort({
          createdAt: -1
        });


      res.json({
        success: true,
        invoices
      });

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  }
);


module.exports = router;