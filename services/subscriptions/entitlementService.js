const Subscription =
  require("../../models/Subscription");

/*
|--------------------------------------------------------------------------
| Entitlement Service
|--------------------------------------------------------------------------
|
| هذا الملف يحدد ما يستطيع المستخدم فعله.
|
| لا نهتم باسم الخطة.
|
| نهتم بالميزة والحد.
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| الحصول على الاشتراك الفعال
|--------------------------------------------------------------------------
*/

async function getActiveSubscription(
  userId
) {

  const subscription =
    await Subscription.findOne({
      user: userId,

      status: {
        $in: [
          "active",
          "trialing",
          "past_due"
        ]
      }
    })
    .populate("plan");

  return subscription;
}


/*
|--------------------------------------------------------------------------
| هل المستخدم يملك Feature؟
|--------------------------------------------------------------------------
*/

async function hasFeature(
  userId,
  featureKey
) {

  const subscription =
    await getActiveSubscription(
      userId
    );

  if (!subscription) {
    return false;
  }

  if (!subscription.plan) {
    return false;
  }

  const feature =
    subscription.plan.features.find(
      item =>
        item.key === featureKey
    );

  return feature
    ? feature.enabled === true
    : false;
}


/*
|--------------------------------------------------------------------------
| الحصول على Limit
|--------------------------------------------------------------------------
*/

async function getLimit(
  userId,
  limitKey
) {

  const subscription =
    await getActiveSubscription(
      userId
    );

  if (!subscription) {
    return 0;
  }

  if (!subscription.plan) {
    return 0;
  }

  const value =
    subscription.plan.limits?.[limitKey];

  if (
    value === undefined ||
    value === null
  ) {
    return 0;
  }

  return value;
}


/*
|--------------------------------------------------------------------------
| هل يمكن إضافة عنصر؟
|--------------------------------------------------------------------------
*/

async function canAdd(
  userId,
  limitKey,
  currentCount
) {

  const limit =
    await getLimit(
      userId,
      limitKey
    );

  /*
   * -1 يعني Unlimited.
   */

  if (limit === -1) {
    return true;
  }

  return currentCount < limit;
}


/*
|--------------------------------------------------------------------------
| الحصول على كل صلاحيات المستخدم
|--------------------------------------------------------------------------
|
| مفيدة جدًا للـ Frontend.
|
| مثال:
|
| {
|   features: {...},
|   limits: {...}
| }
|--------------------------------------------------------------------------
*/

async function getEntitlements(
  userId
) {

  const subscription =
    await getActiveSubscription(
      userId
    );

  if (!subscription) {

    return {
      hasSubscription: false,
      features: {},
      limits: {}
    };
  }

  const features = {};

  for (
    const feature
    of subscription.plan.features || []
  ) {

    features[feature.key] =
      feature.enabled === true;
  }


  const limits = {
    ...(subscription.plan.limits || {})
  };


  return {
    hasSubscription: true,

    subscriptionId:
      subscription._id,

    status:
      subscription.status,

    plan: {
      id: subscription.plan._id,
      name: subscription.plan.name,
      slug: subscription.plan.slug
    },

    features,

    limits,

    currentPeriodStart:
      subscription.currentPeriodStart,

    currentPeriodEnd:
      subscription.currentPeriodEnd,

    cancelAtPeriodEnd:
      subscription.cancelAtPeriodEnd
  };
}


module.exports = {
  getActiveSubscription,
  hasFeature,
  getLimit,
  canAdd,
  getEntitlements
};