const {
  hasFeature,
  getLimit
} = require(
  "../services/subscriptions/entitlementService"
);


/*
|--------------------------------------------------------------------------
| requireFeature
|--------------------------------------------------------------------------
|
| مثال:
|
| router.get(
|   "/analytics",
|   auth,
|   requireFeature("advanced_analytics"),
|   controller
| );
|
|--------------------------------------------------------------------------
*/

function requireFeature(
  featureKey
) {

  return async (
    req,
    res,
    next
  ) => {

    try {

      if (!req.user?.id) {

        return res.status(401).json({
          error:
            "Authentication required"
        });
      }


      const allowed =
        await hasFeature(
          req.user.id,
          featureKey
        );


      if (!allowed) {

        return res.status(403).json({

          error:
            "FEATURE_NOT_AVAILABLE",

          feature:
            featureKey,

          message:
            "Your current subscription does not include this feature."

        });
      }


      next();

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  };
}


/*
|--------------------------------------------------------------------------
| requireLimit
|--------------------------------------------------------------------------
|
| مثال:
|
| requireLimit(
|   "products",
|   async (req) => {
|
|     return Product.countDocuments({
|       seller: req.user.id
|     });
|
|   }
| )
|
|--------------------------------------------------------------------------
*/

function requireLimit(
  limitKey,
  getCurrentCount
) {

  return async (
    req,
    res,
    next
  ) => {

    try {

      if (!req.user?.id) {

        return res.status(401).json({
          error:
            "Authentication required"
        });
      }


      const limit =
        await getLimit(
          req.user.id,
          limitKey
        );


      /*
       * -1 = Unlimited
       */

      if (limit === -1) {

        return next();
      }


      const currentCount =
        await getCurrentCount(req);


      if (
        currentCount >= limit
      ) {

        return res.status(403).json({

          error:
            "LIMIT_REACHED",

          limit:
            limitKey,

          current:
            currentCount,

          maximum:
            limit,

          message:
            "You have reached the limit of your current subscription."

        });
      }


      next();

    } catch (error) {

      res.status(500).json({
        error: error.message
      });

    }
  };
}


module.exports = {
  requireFeature,
  requireLimit
};