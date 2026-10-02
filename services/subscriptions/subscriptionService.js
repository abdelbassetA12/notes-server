const Subscription =
  require("../../models/Subscription");

const SubscriptionPlan =
  require("../../models/SubscriptionPlan");

const User =
  require("../../models/User");

const Payment =
  require("../../models/Payment");

const Invoice =
  require("../../models/Invoice");

const SubscriptionEvent =
  require("../../models/SubscriptionEvent");

const {
  getProvider
} = require("../payments/providerManager");

/*
|--------------------------------------------------------------------------
| أدوات التاريخ
|--------------------------------------------------------------------------
*/

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function calculatePeriodEnd(start, billingCycle) {
  if (billingCycle === "monthly") {
    return addMonths(start, 1);
  }

  if (billingCycle === "yearly") {
    return addYears(start, 1);
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| أدوات مساعدة للـ Webhooks
|--------------------------------------------------------------------------
*/

function getNested(object, paths = []) {
  for (const path of paths) {
    const parts = path.split(".");
    let value = object;

    for (const part of parts) {
      if (
        value === null ||
        value === undefined
      ) {
        value = undefined;
        break;
      }

      value = value[part];
    }

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function normalizeId(value) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value._id
  ) {
    return value._id;
  }

  if (
    typeof value === "object" &&
    value.id
  ) {
    return value.id;
  }

  return value;
}

function getCustomData(data) {
  const customData =
    data?.customData ||
    data?.custom_data ||
    data?.metadata?.customData ||
    data?.metadata?.custom_data ||
    {};

  return customData || {};
}

function getMetadata(data) {
  return (
    data?.metadata ||
    {}
  );
}

function getWebhookUserId(data) {
  const customData =
    getCustomData(data);

  const metadata =
    getMetadata(data);

  return normalizeId(
    getNested(data, [
      "userId",
      "user_id"
    ]) ||
    getNested(customData, [
      "userId",
      "user_id",
      "qevoraUserId",
      "qevora_user_id"
    ]) ||
    getNested(metadata, [
      "userId",
      "user_id",
      "qevoraUserId",
      "qevora_user_id"
    ])
  );
}

function getWebhookCustomerId(data) {
  return (
    getNested(data, [
      "customerId",
      "customer_id",
      "customer.id"
    ]) ||
    null
  );
}

function getWebhookSubscriptionId(data) {
  return (
    getNested(data, [
      "subscriptionId",
      "subscription_id",
      "subscription.id",
    ]) ||
    (typeof data?.id === "string" && data.id.startsWith("sub_")
      ? data.id
      : null)
  );
}
/*
function getWebhookSubscriptionId(data) {
  return (
    getNested(data, [
      "subscriptionId",
      "subscription_id",
      "subscription.id"
    ]) ||
    null
  );
}
*/
function getWebhookPriceId(data) {
  const customData =
    getCustomData(data);

  const metadata =
    getMetadata(data);

  return (
    getNested(data, [
      "priceId",
      "price_id",
      "price.id",
      "items.0.priceId",
      "items.0.price_id",
      "items.0.price.id",
      "items.0.price.priceId",
      "subscription.items.0.priceId",
      "subscription.items.0.price_id",
      "subscription.items.0.price.id",
      "subscription.items.0.price.priceId"
    ]) ||
    getNested(customData, [
      "priceId",
      "price_id",
      "paddlePriceId",
      "paddle_price_id"
    ]) ||
    getNested(metadata, [
      "priceId",
      "price_id",
      "paddlePriceId",
      "paddle_price_id"
    ]) ||
    null
  );
}

function getWebhookPlanId(data) {
  const customData =
    getCustomData(data);

  const metadata =
    getMetadata(data);

  return normalizeId(
    getNested(data, [
      "planId",
      "plan_id"
    ]) ||
    getNested(customData, [
      "planId",
      "plan_id"
    ]) ||
    getNested(metadata, [
      "planId",
      "plan_id"
    ])
  );
}

function getWebhookBillingCycle(data) {
  const customData =
    getCustomData(data);

  const metadata =
    getMetadata(data);

  const value =
    getNested(data, [
      "billingCycle",
      "billing_cycle"
    ]) ||
    getNested(customData, [
      "billingCycle",
      "billing_cycle"
    ]) ||
    getNested(metadata, [
      "billingCycle",
      "billing_cycle"
    ]);

  if (
    value === "yearly" ||
    value === "annual"
  ) {
    return "yearly";
  }

  if (value === "lifetime") {
    return "lifetime";
  }

  return "monthly";
}

function getWebhookPeriodStart(data) {
  const value = getNested(data, [
    "periodStart",
    "period_start",
    "currentPeriodStart",
    "current_period_start",
    "subscription.currentPeriodStart",
    "subscription.current_period_start"
  ]);

  if (!value) {
    return new Date();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date()
    : date;
}

function getWebhookPeriodEnd(data, billingCycle) {
  const value = getNested(data, [
    "periodEnd",
    "period_end",
    "currentPeriodEnd",
    "current_period_end",
    "subscription.currentPeriodEnd",
    "subscription.current_period_end"
  ]);

  if (value) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return calculatePeriodEnd(
    new Date(),
    billingCycle
  );
}

function getWebhookStatus(data) {
  const status =
    getNested(data, [
      "status",
      "subscription.status"
    ]) || "active";

  const allowed = [
    "active",
    "trialing",
    "past_due",
    "paused",
    "canceled",
    "expired"
  ];

  if (allowed.includes(status)) {
    return status;
  }

  return "active";
}

/*
|--------------------------------------------------------------------------
| الحصول على Free Plan
|--------------------------------------------------------------------------
*/

async function getFreePlan() {
  const plan =
    await SubscriptionPlan.findOne({
      slug: "free",
      active: true
    });

  if (!plan) {
    throw new Error(
      "Free subscription plan is not configured."
    );
  }

  return plan;
}

/*
|--------------------------------------------------------------------------
| الحصول على خطة بواسطة ID
|--------------------------------------------------------------------------
*/

async function getPlanById(planId) {
  if (!planId) {
    throw new Error(
      "Subscription plan ID is required."
    );
  }

  const plan =
    await SubscriptionPlan.findOne({
      _id: planId,
      active: true
    });

  if (!plan) {
    throw new Error(
      "Subscription plan not found."
    );
  }

  return plan;
}

/*
|--------------------------------------------------------------------------
| الحصول على اشتراك المستخدم
|--------------------------------------------------------------------------
*/

async function getUserSubscription(userId) {
  if (!userId) {
    return null;
  }

  return Subscription.findOne({
    user: userId,
    status: {
      $in: [
        "active",
        "trialing",
        "past_due"
      ]
    }
  })
    .populate("plan")
    .populate(
      "user",
      "username email"
    );
}

/*
|--------------------------------------------------------------------------
| البحث عن الاشتراك بواسطة Provider Subscription ID
|--------------------------------------------------------------------------
*/

async function getSubscriptionByProviderId(
  provider,
  providerSubscriptionId
) {
  if (
    !provider ||
    !providerSubscriptionId
  ) {
    return null;
  }

  return Subscription.findOne({
    provider,
    providerSubscriptionId
  }).populate("plan");
}

/*
|--------------------------------------------------------------------------
| البحث عن الاشتراك بواسطة Provider Customer ID
|--------------------------------------------------------------------------
*/

async function getSubscriptionByCustomerId(
  provider,
  providerCustomerId
) {
  if (
    !provider ||
    !providerCustomerId
  ) {
    return null;
  }

  return Subscription.findOne({
    provider,
    providerCustomerId
  }).populate("plan");
}

/*
|--------------------------------------------------------------------------
| إنشاء اشتراك Free تلقائيًا
|--------------------------------------------------------------------------
*/

async function ensureFreeSubscription(userId) {
  if (!userId) {
    throw new Error(
      "User ID is required."
    );
  }

  const existing =
    await getUserSubscription(userId);

  if (existing) {
    return existing;
  }

  const freePlan =
    await getFreePlan();

  const now = new Date();

  const subscription =
    await Subscription.create({
      user: userId,
      plan: freePlan._id,
      status: "active",
      provider: "internal",
      billingCycle: "lifetime",
      currentPeriodStart: now,
      currentPeriodEnd: null,
      startedAt: now,
      cancelAtPeriodEnd: false,
      providerCustomerId: "",
      providerSubscriptionId: ""
    });

  return Subscription.findById(
    subscription._id
  ).populate("plan");
}

/*
|--------------------------------------------------------------------------
| إنشاء Checkout
|--------------------------------------------------------------------------
*/

async function createCheckout({
  user,
  planId,
  billingCycle
}) {
  const userId =
    user?._id ||
    user?.id;

  if (!userId) {
    throw new Error(
      "Authenticated user is required."
    );
  }

  const dbUser =
    await User.findById(userId);

  if (!dbUser) {
    throw new Error(
      "User account not found."
    );
  }

  const plan =
    await getPlanById(planId);

  if (
    ![
      "monthly",
      "yearly",
      "lifetime"
    ].includes(billingCycle)
  ) {
    throw new Error(
      "Invalid billing cycle."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Free plan
  |--------------------------------------------------------------------------
  */

  if (plan.isFree) {
    const existing =
      await getUserSubscription(userId);

    if (
      existing &&
      existing.plan &&
      existing.plan._id.toString() ===
        plan._id.toString()
    ) {
      return {
        type: "already_active",
        subscription: existing
      };
    }

    if (existing) {
      throw new Error(
        "User already has an active subscription."
      );
    }

    const now = new Date();

    const subscription =
      await Subscription.create({
        user: userId,
        plan: plan._id,
        status: "active",
        provider: "internal",
        billingCycle: "lifetime",
        currentPeriodStart: now,
        currentPeriodEnd: null,
        startedAt: now,
        cancelAtPeriodEnd: false,
        providerCustomerId: "",
        providerSubscriptionId: ""
      });

    return {
      type: "subscription_created",
      subscription:
        await Subscription.findById(
          subscription._id
        ).populate("plan")
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Paid plans
  |--------------------------------------------------------------------------
  */

  if (billingCycle === "lifetime") {
    throw new Error(
      "Lifetime billing is only available for free plans."
    );
  }

  const providerName =
    process.env.PAYMENT_PROVIDER ||
    "internal";

  if (providerName === "internal") {
    throw new Error(
      "Paid plans require an external payment provider."
    );
  }

  const provider =
    getProvider(providerName);

  if (!provider) {
    throw new Error(
      `Payment provider "${providerName}" is not available.`
    );
  }

  const existing =
    await getUserSubscription(userId);

  /*
  |--------------------------------------------------------------------------
  | إعادة استخدام Paddle Customer ID
  |--------------------------------------------------------------------------
  */

  let customerId =
    existing?.provider === providerName
      ? existing.providerCustomerId || ""
      : "";

  /*
  |--------------------------------------------------------------------------
  | إنشاء Customer لدى Paddle
  |--------------------------------------------------------------------------
  */

  let customer = null;

  if (!customerId) {
    customer =
      await provider.createCustomer(
        dbUser
      );

    customerId =
      customer?.providerCustomerId ||
      customer?.id ||
      "";

    if (!customerId) {
      throw new Error(
        "Payment provider did not return a customer ID."
      );
    }
  } else {
    customer = {
      id: customerId
    };
  }

  /*
  |--------------------------------------------------------------------------
  | إنشاء Checkout
  |--------------------------------------------------------------------------
  */

  const checkout =
    await provider.createCheckout({
      user: dbUser,
      plan,
      billingCycle,
      customer: {
        id: customerId
      }
    });

  if (!checkout) {
    throw new Error(
      "Payment provider did not return checkout data."
    );
  }

  return {
    type: "checkout_created",

    checkoutUrl:
      checkout.checkoutUrl ||
      checkout.url ||
      null,

    transactionId:
      checkout.transactionId ||
      checkout.transaction?.id ||
      null,

    provider: providerName,

    customerId,

    plan: {
      id: plan._id,
      name: plan.name,
      slug: plan.slug
    }
  };
}

/*
|--------------------------------------------------------------------------
| تفعيل اشتراك
|--------------------------------------------------------------------------
*/

async function activateSubscription({
  userId,
  planId,
  provider = "internal",
  providerCustomerId = "",
  providerSubscriptionId = "",
  billingCycle = "monthly",
  currentPeriodStart = new Date(),
  currentPeriodEnd = null,
  status = "active",
  metadata = {}
}) {
  if (!userId) {
    throw new Error(
      "User ID is required."
    );
  }

  if (!planId) {
    throw new Error(
      "Plan ID is required."
    );
  }

  const plan =
    await getPlanById(planId);

  /*
  |--------------------------------------------------------------------------
  | أولًا: اشتراك مطابق لـ Provider Subscription ID
  |--------------------------------------------------------------------------
  */

  let subscription = null;

  if (
    providerSubscriptionId
  ) {
    subscription =
      await Subscription.findOne({
        provider,
        providerSubscriptionId
      });
  }

  /*
  |--------------------------------------------------------------------------
  | ثانيًا: اشتراك مطابق للـ Customer ID
  |--------------------------------------------------------------------------
  */

  if (
    !subscription &&
    providerCustomerId
  ) {
    subscription =
      await Subscription.findOne({
        provider,
        providerCustomerId
      });
  }

  /*
  |--------------------------------------------------------------------------
  | ثالثًا: اشتراك المستخدم الحالي
  |
  | هذا مهم جدًا:
  | المستخدم الجديد غالبًا لديه Free/Internal subscription.
  | عند نجاح Paddle نحدّثه إلى Paddle بدل إنشاء اشتراك ثاني.
  |--------------------------------------------------------------------------
  */

  if (!subscription) {
    subscription =
      await Subscription.findOne({
        user: userId,
        status: {
          $in: [
            "active",
            "trialing",
            "past_due"
          ]
        }
      });
  }

  /*
  |--------------------------------------------------------------------------
  | تحديث الاشتراك الموجود
  |--------------------------------------------------------------------------
  */

  if (subscription) {
    subscription.user = userId;
    subscription.plan = plan._id;
    subscription.status = status;
    subscription.provider = provider;

    if (providerCustomerId) {
      subscription.providerCustomerId =
        providerCustomerId;
    }

    if (providerSubscriptionId) {
      subscription.providerSubscriptionId =
        providerSubscriptionId;
    }

    subscription.billingCycle =
      billingCycle;

    subscription.currentPeriodStart =
      currentPeriodStart;

    subscription.currentPeriodEnd =
      currentPeriodEnd;

    subscription.cancelAtPeriodEnd =
      false;

    subscription.canceledAt = null;
    subscription.endedAt = null;

    subscription.startedAt =
      subscription.startedAt ||
      new Date();

    subscription.metadata =
      metadata || {};

    await subscription.save();
  } else {
    /*
    |--------------------------------------------------------------------------
    | لا يوجد اشتراك محلي -> إنشاء واحد جديد
    |--------------------------------------------------------------------------
    */

    subscription =
      await Subscription.create({
        user: userId,
        plan: plan._id,
        status,
        provider,
        providerCustomerId,
        providerSubscriptionId,
        billingCycle,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        startedAt: new Date(),
        metadata: metadata || {}
      });
  }

  return Subscription.findById(
    subscription._id
  ).populate("plan");
}

/*
|--------------------------------------------------------------------------
| تغيير الخطة
|--------------------------------------------------------------------------
*/

async function changePlan({
  user,
  newPlanId,
  billingCycle
}) {
  const userId =
    user?._id ||
    user?.id;

  if (!userId) {
    throw new Error(
      "Authenticated user is required."
    );
  }

  const newPlan =
    await getPlanById(newPlanId);

  const subscription =
    await getUserSubscription(userId);

  /*
  |--------------------------------------------------------------------------
  | لا يوجد اشتراك
  |--------------------------------------------------------------------------
  */

  if (!subscription) {
    if (newPlan.isFree) {
      return createCheckout({
        user,
        planId: newPlanId,
        billingCycle: "lifetime"
      });
    }

    return createCheckout({
      user,
      planId: newPlanId,
      billingCycle
    });
  }

  /*
  |--------------------------------------------------------------------------
  | نفس الخطة
  |--------------------------------------------------------------------------
  */

  if (
    subscription.plan &&
    subscription.plan._id.toString() ===
      newPlan._id.toString()
  ) {
    return {
      type: "already_active",
      subscription
    };
  }

  /*
  |--------------------------------------------------------------------------
  | الانتقال إلى Free
  |--------------------------------------------------------------------------
  */

  if (newPlan.isFree) {
    if (
      subscription.provider !==
      "internal"
    ) {
      const provider =
        getProvider(
          subscription.provider
        );

      await provider.cancelSubscription({
        subscription,
        immediately: false
      });

      subscription.cancelAtPeriodEnd =
        true;

      subscription.canceledAt =
        new Date();

      await subscription.save();

      return {
        type: "downgrade_scheduled",
        effectiveAt:
          subscription.currentPeriodEnd,
        subscription:
          await Subscription.findById(
            subscription._id
          ).populate("plan")
      };
    }

    throw new Error(
      "Internal provider does not support paid subscription changes."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | اشتراك خارجي موجود
  |--------------------------------------------------------------------------
  */

  if (
    subscription.provider !==
    "internal"
  ) {
    if (
      billingCycle !== "monthly" &&
      billingCycle !== "yearly"
    ) {
      throw new Error(
        "Paid subscriptions require monthly or yearly billing."
      );
    }

    const provider =
      getProvider(
        subscription.provider
      );

    await provider.changeSubscription({
      subscription,
      newPlan,
      billingCycle
    });

    subscription.plan =
      newPlan._id;

    subscription.billingCycle =
      billingCycle;

    subscription.cancelAtPeriodEnd =
      false;

    subscription.canceledAt = null;

    await subscription.save();

    return {
      type: "subscription_changed",
      subscription:
        await Subscription.findById(
          subscription._id
        ).populate("plan")
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Internal / Free -> Paid
  |--------------------------------------------------------------------------
  */

  return createCheckout({
    user,
    planId: newPlanId,
    billingCycle
  });
}

/*
|--------------------------------------------------------------------------
| إلغاء الاشتراك
|--------------------------------------------------------------------------
*/

async function cancelSubscription({
  userId,
  immediately = false
}) {
  const subscription =
    await getUserSubscription(
      userId
    );

  if (!subscription) {
    throw new Error(
      "No active subscription found."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Internal
  |--------------------------------------------------------------------------
  */

  if (
    subscription.provider ===
    "internal"
  ) {
    if (!immediately) {
      return {
        type: "not_required",
        subscription
      };
    }

    subscription.status =
      "expired";

    subscription.endedAt =
      new Date();

    subscription.canceledAt =
      new Date();

    subscription.cancelAtPeriodEnd =
      false;

    await subscription.save();

    return {
      type: "canceled",
      subscription
    };
  }

  /*
  |--------------------------------------------------------------------------
  | External Provider
  |--------------------------------------------------------------------------
  */

  const provider =
    getProvider(
      subscription.provider
    );

  await provider.cancelSubscription({
    subscription,
    immediately
  });

  if (immediately) {
    subscription.status =
      "canceled";

    subscription.endedAt =
      new Date();

    subscription.canceledAt =
      new Date();

    subscription.cancelAtPeriodEnd =
      false;
  } else {
    subscription.cancelAtPeriodEnd =
      true;

    subscription.canceledAt =
      new Date();
  }

  await subscription.save();

  return {
    type: immediately
      ? "canceled"
      : "cancellation_scheduled",
    subscription
  };
}

/*
|--------------------------------------------------------------------------
| إعادة تفعيل الاشتراك
|--------------------------------------------------------------------------
*/

async function reactivateSubscription(
  userId
) {
  const subscription =
    await getUserSubscription(
      userId
    );

  if (!subscription) {
    throw new Error(
      "No active subscription found."
    );
  }

  if (
    subscription.cancelAtPeriodEnd
  ) {
    if (
      subscription.provider !==
      "internal"
    ) {
      const provider =
        getProvider(
          subscription.provider
        );

      await provider.reactivateSubscription({
        subscription
      });
    }

    subscription.cancelAtPeriodEnd =
      false;

    subscription.canceledAt =
      null;

    await subscription.save();
  }

  return Subscription.findById(
    subscription._id
  ).populate("plan");
}

/*
|--------------------------------------------------------------------------
| إنشاء رقم فاتورة
|--------------------------------------------------------------------------
*/

async function generateInvoiceNumber() {
  const count =
    await Invoice.countDocuments();

  const number =
    String(count + 1).padStart(
      6,
      "0"
    );

  return `INV-${number}`;
}

/*
|--------------------------------------------------------------------------
| تسجيل Payment
|--------------------------------------------------------------------------
*/

async function recordPayment({
  userId,
  subscriptionId,
  provider,
  providerPaymentId = "",
  amount,
  currency,
  type = "subscription",
  status = "paid",
  paidAt = new Date(),
  metadata = {}
}) {
  if (!userId) {
    throw new Error(
      "User ID is required for payment."
    );
  }

  if (!subscriptionId) {
    throw new Error(
      "Subscription ID is required for payment."
    );
  }

  if (providerPaymentId) {
    const existing =
      await Payment.findOne({
        provider,
        providerPaymentId
      });

    if (existing) {
      return existing;
    }
  }

  return Payment.create({
    user: userId,
    subscription: subscriptionId,
    provider,
    providerPaymentId:
      providerPaymentId || "",
    amount: Number(amount || 0),
    currency: String(
      currency || "USD"
    ).toUpperCase(),
    status,
    type,
    paidAt:
      status === "paid"
        ? paidAt
        : null,
    metadata: metadata || {}
  });
}

/*
|--------------------------------------------------------------------------
| إنشاء Invoice
|--------------------------------------------------------------------------
*/

async function createInvoice({
  userId,
  subscriptionId,
  providerInvoiceId = "",
  amount,
  currency,
  periodStart = null,
  periodEnd = null,
  status = "paid",
  invoiceUrl = "",
  metadata = {}
}) {
  if (!userId) {
    throw new Error(
      "User ID is required for invoice."
    );
  }

  if (!subscriptionId) {
    throw new Error(
      "Subscription ID is required for invoice."
    );
  }

  if (providerInvoiceId) {
    const existing =
      await Invoice.findOne({
        providerInvoiceId
      });

    if (existing) {
      return existing;
    }
  }

  const invoiceNumber =
    await generateInvoiceNumber();

  return Invoice.create({
    user: userId,
    subscription: subscriptionId,
    invoiceNumber,
    providerInvoiceId:
      providerInvoiceId || "",
    amount: Number(amount || 0),
    currency: String(
      currency || "USD"
    ).toUpperCase(),
    status,
    periodStart,
    periodEnd,
    paidAt:
      status === "paid"
        ? new Date()
        : null,
    invoiceUrl:
      invoiceUrl || "",
    metadata: metadata || {}
  });
}

/*
|--------------------------------------------------------------------------
| تحديث Payment الموجود
|--------------------------------------------------------------------------
*/

async function updatePaymentStatus({
  provider,
  providerPaymentId,
  status,
  metadata = {}
}) {
  if (!providerPaymentId) {
    return null;
  }

  const payment =
    await Payment.findOne({
      provider,
      providerPaymentId
    });

  if (!payment) {
    return null;
  }

  payment.status = status;

  if (status === "paid") {
    payment.paidAt =
      payment.paidAt ||
      new Date();
  }

  payment.metadata = {
    ...(payment.metadata || {}),
    ...(metadata || {})
  };

  await payment.save();

  return payment;
}

/*
|--------------------------------------------------------------------------
| إيجاد المستخدم بواسطة Paddle Customer ID
|--------------------------------------------------------------------------
*/

async function findUserByProviderCustomerId(
  customerId
) {
  if (!customerId) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | أولًا نحاول من الاشتراك المحلي
  |--------------------------------------------------------------------------
  */

  const localSubscription =
    await Subscription.findOne({
      provider: "paddle",
      providerCustomerId: customerId
    }).populate("user");

  if (
    localSubscription &&
    localSubscription.user
  ) {
    return localSubscription.user;
  }

  /*
  |--------------------------------------------------------------------------
  | ثم User fields المعروفة
  |--------------------------------------------------------------------------
  */

  const user =
    await User.findOne({
      $or: [
        {
          paddleCustomerId:
            customerId
        },
        {
          "payment.paddleCustomerId":
            customerId
        },
        {
          "billing.paddleCustomerId":
            customerId
        }
      ]
    });

  return user || null;
}

/*
|--------------------------------------------------------------------------
| إيجاد الخطة بواسطة Paddle Price ID
|--------------------------------------------------------------------------
|
| نستخدمها فقط إذا لم تصل planId في custom_data.
| نقارن تمثيل الخطة كاملًا حتى لا نعتمد على اسم حقل
| غير معروف داخل SubscriptionPlan.
|--------------------------------------------------------------------------
*/

async function findPlanByProviderPriceId(
  priceId
) {
  if (!priceId) {
    return null;
  }

  const plans =
    await SubscriptionPlan.find({
      active: true
    });

  for (const plan of plans) {
    const serialized =
      JSON.stringify(plan);

    if (
      serialized.includes(
        String(priceId)
      )
    ) {
      return plan;
    }
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| معالجة Webhook موحد
|--------------------------------------------------------------------------
*/

async function processWebhookEvent({
  provider,
  event
}) {
  if (!provider) {
    throw new Error(
      "Webhook provider is required."
    );
  }

  if (!event) {
    throw new Error(
      "Webhook event is required."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | حماية من التكرار
  |--------------------------------------------------------------------------
  */

  let eventRecord;

  try {
    eventRecord =
      await SubscriptionEvent.create({
        provider,
        providerEventId:
          event.providerEventId,
        eventType:
          event.eventType,
        normalizedType:
          event.normalizedType,
        data:
          event.data || {},
        processed: false
      });
  } catch (error) {
    if (error.code === 11000) {
      return {
        success: true,
        duplicate: true
      };
    }

    throw error;
  }

  try {
    const data =
      event.data || {};

    /*
    |--------------------------------------------------------------------------
    | PAYMENT_SUCCEEDED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "PAYMENT_SUCCEEDED"
    ) {
      let subscription = null;

      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      if (providerSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            providerSubscriptionId
          );
      }

      if (
        !subscription &&
        providerCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            providerCustomerId
          );
      }

      const userId =
        getWebhookUserId(data) ||
        subscription?.user?._id ||
        subscription?.user;

      const subscriptionId =
        subscription?._id ||
        data.localSubscriptionId;

      if (
        userId &&
        subscriptionId
      ) {

        await recordPayment({
  userId,
  subscriptionId,
  provider,

  providerPaymentId:
    data.paymentId ||
    data.payment_id ||
    data.transactionId ||
    data.transaction_id ||
    data.id ||
    "",

  amount:
    Number(
      data.amount ||
      data.details?.totals?.total ||
      0
    ) / 100,

  currency:
    data.currency ||
    data.currency_code ||
    data.details?.totals?.currency_code ||
    "USD",

  type:
    data.type ||
    "subscription",

  status: "paid",

  metadata:
    data.metadata ||
    {}
});
         /*
        await recordPayment({
          userId,
          subscriptionId,
          provider,
          providerPaymentId:
            data.paymentId ||
            data.payment_id ||
            data.transactionId ||
            data.transaction_id ||
            "",
          amount:
            Number(
              data.amount || 0
            ),
          currency:
            data.currency ||
            "USD",
          type:
            data.type ||
            "subscription",
          status: "paid",
          metadata:
            data.metadata ||
            {}
        });
        */
      }
    }

    /*
    |--------------------------------------------------------------------------
    | PAYMENT_FAILED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "PAYMENT_FAILED"
    ) {
      await updatePaymentStatus({
        provider,
        providerPaymentId:
          data.paymentId ||
          data.payment_id ||
          data.transactionId ||
          data.transaction_id ||
          "",
        status: "failed",
        metadata:
          data.metadata || {}
      });
    }

    /*
    |--------------------------------------------------------------------------
    | PAYMENT_REFUNDED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "PAYMENT_REFUNDED"
    ) {
      await updatePaymentStatus({
        provider,
        providerPaymentId:
          data.paymentId ||
          data.payment_id ||
          data.transactionId ||
          data.transaction_id ||
          "",
        status:
          data.refundStatus ===
          "partially_refunded"
            ? "partially_refunded"
            : "refunded",
        metadata: {
          ...(data.metadata || {}),
          refundId:
            data.refundId ||
            data.refund_id ||
            "",
          refundAmount:
            data.refundAmount ||
            data.refund_amount ||
            0
        }
      });
    }

    /*
    |--------------------------------------------------------------------------
    | SUBSCRIPTION_CREATED
    |--------------------------------------------------------------------------
    |
    | هذه أهم نقطة في الإصلاح.
    |
    | لا نسمح أبدًا بتسجيل الحدث processed=true
    | إذا لم نستطع معرفة المستخدم والخطة والاشتراك.
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_CREATED"
    ) {
      const customData =
        getCustomData(data);

      const metadata =
        getMetadata(data);

      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      const priceId =
        getWebhookPriceId(data);

      let userId =
        getWebhookUserId(data);

      let planId =
        getWebhookPlanId(data);

      let localSubscription = null;

      /*
      |--------------------------------------------------------------------------
      | البحث بواسطة Paddle Subscription ID
      |--------------------------------------------------------------------------
      */

      if (providerSubscriptionId) {
        localSubscription =
          await getSubscriptionByProviderId(
            provider,
            providerSubscriptionId
          );
      }

      /*
      |--------------------------------------------------------------------------
      | البحث بواسطة Paddle Customer ID
      |--------------------------------------------------------------------------
      */

      if (
        !localSubscription &&
        providerCustomerId
      ) {
        localSubscription =
          await getSubscriptionByCustomerId(
            provider,
            providerCustomerId
          );
      }

      /*
      |--------------------------------------------------------------------------
      | إذا وجدنا اشتراكًا محليًا
      |--------------------------------------------------------------------------
      */

      if (localSubscription) {
        userId =
          userId ||
          localSubscription.user?._id ||
          localSubscription.user;

        /*
        | لا نستخدم الخطة القديمة إذا كانت
        | الخطة القديمة Free إلا إذا لم نجد
        | طريقة أخرى لمعرفة الخطة.
        */

        planId =
          planId ||
          localSubscription.plan?._id ||
          localSubscription.plan;
      }

      /*
      |--------------------------------------------------------------------------
      | البحث عن المستخدم بواسطة Paddle Customer ID
      |--------------------------------------------------------------------------
      */

      if (
        !userId &&
        providerCustomerId &&
        provider === "paddle"
      ) {
        const providerUser =
          await findUserByProviderCustomerId(
            providerCustomerId
          );

        if (providerUser) {
          userId =
            providerUser._id;
        }
      }

      /*
      |--------------------------------------------------------------------------
      | البحث عن الخطة بواسطة Paddle Price ID
      |--------------------------------------------------------------------------
      */

      if (
        !planId &&
        priceId &&
        provider === "paddle"
      ) {
        const pricePlan =
          await findPlanByProviderPriceId(
            priceId
          );

        if (pricePlan) {
          planId =
            pricePlan._id;
        }
      }

      /*
      |--------------------------------------------------------------------------
      | آخر محاولة: planId داخل custom_data
      |--------------------------------------------------------------------------
      */

      if (!planId) {
        planId =
          normalizeId(
            customData.plan ||
            customData.subscriptionPlan ||
            metadata.plan ||
            metadata.subscriptionPlan
          );
      }

      /*
      |--------------------------------------------------------------------------
      | يجب أن تكون هذه البيانات موجودة
      |--------------------------------------------------------------------------
      */

      if (!userId) {
        throw new Error(
          [
            "Unable to activate Paddle subscription: userId is missing.",
            `customerId=${providerCustomerId || ""}`,
            `subscriptionId=${providerSubscriptionId || ""}`,
            `priceId=${priceId || ""}`
          ].join(" ")
        );
      }

      if (!planId) {
        throw new Error(
          [
            "Unable to activate Paddle subscription: planId is missing.",
            `userId=${userId}`,
            `customerId=${providerCustomerId || ""}`,
            `subscriptionId=${providerSubscriptionId || ""}`,
            `priceId=${priceId || ""}`
          ].join(" ")
        );
      }

      if (!providerSubscriptionId) {
        throw new Error(
          [
            "Unable to activate Paddle subscription: subscriptionId is missing.",
            `userId=${userId}`,
            `planId=${planId}`,
            `customerId=${providerCustomerId || ""}`,
            `priceId=${priceId || ""}`
          ].join(" ")
        );
      }

      /*
      |--------------------------------------------------------------------------
      | التأكد أن المستخدم موجود
      |--------------------------------------------------------------------------
      */

      const userExists =
        await User.findById(userId);

      if (!userExists) {
        throw new Error(
          `Unable to activate Paddle subscription: user ${userId} was not found.`
        );
      }

      /*
      |--------------------------------------------------------------------------
      | تفعيل الاشتراك
      |--------------------------------------------------------------------------
      */

      const billingCycle =
        getWebhookBillingCycle(data);

      const periodStart =
        getWebhookPeriodStart(data);

      const periodEnd =
        getWebhookPeriodEnd(
          data,
          billingCycle
        );

      const status =
        getWebhookStatus(data);

      await activateSubscription({
        userId,
        planId,
        provider,
        providerCustomerId:
          providerCustomerId || "",
        providerSubscriptionId,
        billingCycle,
        currentPeriodStart:
          periodStart,
        currentPeriodEnd:
          periodEnd,
        status:
          status === "canceled" ||
          status === "expired"
            ? "active"
            : status,
        metadata: {
          ...(metadata || {}),
          paddlePriceId:
            priceId || "",
          providerEventId:
            event.providerEventId || "",
          paddleCustomData:
            customData || {}
        }
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CHECKOUT_COMPLETED
    |--------------------------------------------------------------------------
    |
    | لا نفعل الاشتراك هنا.
    | Paddle subscription.created هو المصدر الأساسي.
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "CHECKOUT_COMPLETED"
    ) {
      // لا شيء هنا عمدًا.
    }

    /*
    |--------------------------------------------------------------------------
    | SUBSCRIPTION_UPDATED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_UPDATED"
    ) {
      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      let subscription = null;

      if (providerSubscriptionId) {
        subscription =
          await Subscription.findOne({
            provider,
            providerSubscriptionId
          });
      }

      if (
        !subscription &&
        providerCustomerId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerCustomerId
          });
      }

      /*
      |--------------------------------------------------------------------------
      | إذا لم يكن الاشتراك موجودًا بعد
      |
      | قد يصل subscription.updated قبل created
      | في بعض الحالات.
      |
      | لا ننشئ اشتراكًا بدون plan/user.
      |--------------------------------------------------------------------------
      */

      if (subscription) {
        const status =
          getWebhookStatus(data);

        subscription.status =
          status;

        if (providerCustomerId) {
          subscription.providerCustomerId =
            providerCustomerId;
        }

        if (providerSubscriptionId) {
          subscription.providerSubscriptionId =
            providerSubscriptionId;
        }

        const billingCycle =
          getWebhookBillingCycle(data);

        if (billingCycle) {
          subscription.billingCycle =
            billingCycle;
        }

        const periodStart =
          getNested(data, [
            "periodStart",
            "period_start",
            "currentPeriodStart",
            "current_period_start"
          ]);

        if (periodStart) {
          subscription.currentPeriodStart =
            new Date(periodStart);
        }

        const periodEnd =
          getNested(data, [
            "periodEnd",
            "period_end",
            "currentPeriodEnd",
            "current_period_end"
          ]);

        if (periodEnd) {
          subscription.currentPeriodEnd =
            new Date(periodEnd);
        }

        const cancelAtPeriodEnd =
          getNested(data, [
            "cancelAtPeriodEnd",
            "cancel_at_period_end"
          ]);

        if (
          typeof cancelAtPeriodEnd ===
          "boolean"
        ) {
          subscription.cancelAtPeriodEnd =
            cancelAtPeriodEnd;
        }

        if (
          cancelAtPeriodEnd === false
        ) {
          subscription.canceledAt =
            null;
        }

        if (data.metadata) {
          subscription.metadata = {
            ...(subscription.metadata || {}),
            ...data.metadata
          };
        }

        await subscription.save();
      }
    }

    /*
    |--------------------------------------------------------------------------
    | SUBSCRIPTION_CANCELED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_CANCELED"
    ) {
      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      let subscription = null;

      if (providerSubscriptionId) {
        subscription =
          await Subscription.findOne({
            provider,
            providerSubscriptionId
          });
      }

      if (
        !subscription &&
        providerCustomerId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerCustomerId
          });
      }

      if (subscription) {
        subscription.status =
          "canceled";

        subscription.canceledAt =
          new Date();

        const endedAt =
          getNested(data, [
            "endedAt",
            "ended_at"
          ]);

        subscription.endedAt =
          endedAt
            ? new Date(endedAt)
            : new Date();

        subscription.cancelAtPeriodEnd =
          false;

        await subscription.save();
      }
    }

    /*
    |--------------------------------------------------------------------------
    | INVOICE_PAID
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "INVOICE_PAID"
    ) {
      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      let subscription = null;

      if (providerSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            providerSubscriptionId
          );
      }

      if (
        !subscription &&
        providerCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            providerCustomerId
          );
      }

      const userId =
        getWebhookUserId(data) ||
        subscription?.user?._id ||
        subscription?.user;

      const subscriptionId =
        subscription?._id ||
        data.localSubscriptionId;

      if (
        userId &&
        subscriptionId
      ) {
        await createInvoice({
          userId,
          subscriptionId,
          providerInvoiceId:
            data.invoiceId ||
            data.invoice_id ||
            "",
          amount:
            Number(
              data.amount || 0
            ),
          currency:
            data.currency ||
            "USD",
          periodStart:
            data.periodStart
              ? new Date(
                  data.periodStart
                )
              : null,
          periodEnd:
            data.periodEnd
              ? new Date(
                  data.periodEnd
                )
              : null,
          status: "paid",
          invoiceUrl:
            data.invoiceUrl ||
            data.invoice_url ||
            "",
          metadata:
            data.metadata || {}
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | INVOICE_PAYMENT_FAILED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "INVOICE_PAYMENT_FAILED"
    ) {
      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      let subscription = null;

      if (providerSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            providerSubscriptionId
          );
      }

      if (
        !subscription &&
        providerCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            providerCustomerId
          );
      }

      if (subscription) {
        const status =
          getWebhookStatus(data);

        subscription.status =
          status === "active"
            ? "past_due"
            : status;

        await subscription.save();
      }
    }

    /*
    |--------------------------------------------------------------------------
    | INVOICE_FAILED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "INVOICE_FAILED"
    ) {
      const providerSubscriptionId =
        getWebhookSubscriptionId(
          data
        );

      const providerCustomerId =
        getWebhookCustomerId(
          data
        );

      let subscription = null;

      if (providerSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            providerSubscriptionId
          );
      }

      if (
        !subscription &&
        providerCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            providerCustomerId
          );
      }

      if (subscription) {
        const status =
          getWebhookStatus(data);

        subscription.status =
          status === "active"
            ? "past_due"
            : status;

        await subscription.save();
      }
    }

    /*
    |--------------------------------------------------------------------------
    | تسجيل نجاح المعالجة
    |--------------------------------------------------------------------------
    */

    eventRecord.processed = true;

    eventRecord.processedAt =
      new Date();

    eventRecord.processingError =
      "";

    await eventRecord.save();

    return {
      success: true
    };
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | مهم جدًا:
    | إذا فشل تفعيل Paddle، لا نخفي الخطأ.
    |--------------------------------------------------------------------------
    */

    eventRecord.processingError =
      error.message ||
      "Webhook processing failed";

    eventRecord.processed = false;

    await eventRecord.save();

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  getFreePlan,
  getPlanById,
  getUserSubscription,
  getSubscriptionByProviderId,
  getSubscriptionByCustomerId,
  ensureFreeSubscription,
  createCheckout,
  activateSubscription,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
  recordPayment,
  createInvoice,
  updatePaymentStatus,
  processWebhookEvent
};