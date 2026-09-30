const Subscription =
  require("../../models/Subscription");

const SubscriptionPlan =
  require("../../models/SubscriptionPlan");
  const User = require("../../models/User");

const Payment =
  require("../../models/Payment");

const Invoice =
  require("../../models/Invoice");

const SubscriptionEvent =
  require("../../models/SubscriptionEvent");

const {
  getProvider
} = require("../payments/providerManager");

/**
 * |--------------------------------------------------------------------------
 * أدوات التاريخ
 * |--------------------------------------------------------------------------
 */

function addMonths(date, months) {
  const result = new Date(date);

  result.setMonth(
    result.getMonth() + months
  );

  return result;
}

function addYears(date, years) {
  const result = new Date(date);

  result.setFullYear(
    result.getFullYear() + years
  );

  return result;
}

/**
 * |--------------------------------------------------------------------------
 * حساب نهاية الفترة
 * |--------------------------------------------------------------------------
 */

function calculatePeriodEnd(
  start,
  billingCycle
) {
  if (billingCycle === "monthly") {
    return addMonths(start, 1);
  }

  if (billingCycle === "yearly") {
    return addYears(start, 1);
  }

  return null;
}

/**
 * |--------------------------------------------------------------------------
 * الحصول على Free Plan
 * |--------------------------------------------------------------------------
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

/**
 * |--------------------------------------------------------------------------
 * الحصول على خطة بواسطة ID
 * |--------------------------------------------------------------------------
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

/**
 * |--------------------------------------------------------------------------
 * الحصول على اشتراك المستخدم
 * |--------------------------------------------------------------------------
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

/**
 * |--------------------------------------------------------------------------
 * البحث عن الاشتراك بواسطة Provider Subscription ID
 * |--------------------------------------------------------------------------
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

/**
 * |--------------------------------------------------------------------------
 * البحث عن الاشتراك بواسطة Provider Customer ID
 * |--------------------------------------------------------------------------
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

/**
 * |--------------------------------------------------------------------------
 * إنشاء اشتراك Free تلقائيًا
 * |--------------------------------------------------------------------------
 */

async function ensureFreeSubscription(
  userId
) {
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
      cancelAtPeriodEnd: false
    });

  return Subscription.findById(
    subscription._id
  ).populate("plan");
}

/**
 * |--------------------------------------------------------------------------
 * إنشاء Checkout
 * |--------------------------------------------------------------------------
 */

 
async function createCheckout({
  user,
  planId,
  billingCycle
}) {
  const userId = user?._id || user?.id;

  if (!userId) {
    throw new Error(
      "Authenticated user is required."
    );
  }
  const dbUser = await User.findById(userId);

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

  // ============================================================
  // الخطة المجانية
  // ============================================================

  if (plan.isFree) {
    const existing =
      await getUserSubscription(
        userId
      );

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
        cancelAtPeriodEnd: false
      });

    return {
      type: "subscription_created",
      subscription:
        await Subscription.findById(
          subscription._id
        ).populate("plan")
    };
  }

  // ============================================================
  // الخطط المدفوعة
  // ============================================================

  if (billingCycle === "lifetime") {
    throw new Error(
      "Lifetime billing is only available for free plans."
    );
  }

  const providerName =
    process.env.PAYMENT_PROVIDER ||
    "internal";

  const provider =
    getProvider(providerName);

  // ============================================================
  // Provider داخلي لا يدعم الخطط المدفوعة
  // ============================================================

  if (providerName === "internal") {
    throw new Error(
      "Paid plans require an external payment provider."
    );
  }

  const existing =
    await getUserSubscription(
      userId
    );

  // ============================================================
  // إعادة استخدام Customer ID إن وجد
  // ============================================================

  let customerId =
    existing?.provider === providerName
      ? existing.providerCustomerId || ""
      : "";

  // ============================================================
  // إنشاء Customer جديد
  // ============================================================

  if (!customerId) {
    const customer =
      await provider.createCustomer(
        //user
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
  }

  // ============================================================
  // إنشاء Checkout
  // ============================================================

  const checkout =
    await provider.createCheckout({
      user,
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
async function createCheckout({
  user,
  planId,
  billingCycle
}) {
  if (!user || !user._id) {
    throw new Error(
      "Authenticated user is required."
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

 
  // الخطة المجانية
  

  if (plan.isFree) {
    const existing =
      await getUserSubscription(
        user._id
        
      );

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
        user: user._id,
        plan: plan._id,
        status: "active",
        provider: "internal",
        billingCycle: "lifetime",
        currentPeriodStart: now,
        currentPeriodEnd: null,
        startedAt: now,
        cancelAtPeriodEnd: false
      });

    return {
      type: "subscription_created",
      subscription:
        await Subscription.findById(
          subscription._id
        ).populate("plan")
    };
  }

    //الخطط المدفوعة
  

  if (billingCycle === "lifetime") {
    throw new Error(
      "Lifetime billing is only available for free plans."
    );
  }

  const providerName =
    process.env.PAYMENT_PROVIDER ||
    "internal";

  const provider =
    getProvider(providerName);
 
    //إذا كان Provider داخليًا،
   // فإن الخطط المدفوعة غير مدعومة.
    

  if (providerName === "internal") {
    throw new Error(
      "Paid plans require an external payment provider."
    );
  }

  const existing =
    await getUserSubscription(
      user._id
    );

  // إذا كان لدينا Customer ID سابقًا
 // نعيد استخدامه.
  

  let customerId =
    existing?.provider === providerName
      ? existing.providerCustomerId || ""
      : "";

  // إذا لم يكن لدينا Customer،
  // ننشئ Customer جديدًا لدى Provider.
   

  if (!customerId) {
    const customer =
      await provider.createCustomer(
        user
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
  }

  const checkout =
    await provider.createCheckout({
      user,
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

    provider: providerName,

    customerId,

    plan: {
      id: plan._id,
      name: plan.name,
      slug: plan.slug
    }
  };
}*/

/**
 * |--------------------------------------------------------------------------
 * تفعيل اشتراك
 * |--------------------------------------------------------------------------
 *
 * تستخدم داخليًا أو بواسطة Webhook.
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

  /**
   * أولًا نحاول العثور على اشتراك نشط
   * للمستخدم.
   */

  let subscription =
    await getUserSubscription(userId);

  /**
   * إذا لم يوجد اشتراك نشط،
   * قد يكون لدينا اشتراك قديم بنفس
   * Provider Subscription ID.
   */

  if (
    !subscription &&
    providerSubscriptionId
  ) {
    subscription =
      await Subscription.findOne({
        provider,
        providerSubscriptionId
      });
  }

  /**
   * تحديث الاشتراك الموجود.
   */

  if (subscription) {
    subscription.plan =
      plan._id;

    subscription.status =
      status;

    subscription.provider =
      provider;

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

    subscription.canceledAt =
      null;

    subscription.endedAt =
      null;

    subscription.metadata =
      metadata || {};

    await subscription.save();
  } else {
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

/**
 * |--------------------------------------------------------------------------
 * تغيير الخطة
 * |--------------------------------------------------------------------------
 */
async function changePlan({
  user,
  newPlanId,
  billingCycle
}) {
  const userId = user?._id || user?.id;

  if (!userId) {
    throw new Error(
      "Authenticated user is required."
    );
  }
  /*
async function changePlan({
  user,
  newPlanId,
  billingCycle
}) {
  if (!user || !user._id) {
    throw new Error(
      "Authenticated user is required."
    );
  }*/

  const newPlan =
    await getPlanById(
      newPlanId
    );
  const subscription =
  await getUserSubscription(
    userId
  );
  /*
  const subscription =
    await getUserSubscription(
      user._id
    );
    */

  /**
   * لا يوجد اشتراك:
   *
   * Free => ينشأ مباشرة.
   * Paid => Checkout.
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

  /**
   * نفس الخطة.
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

  /**
   * ============================================================
   * الانتقال إلى Free
   * ============================================================
   *
   * مهم:
   *
   * لا نغير plan إلى Free الآن إذا كان
   * الاشتراك المدفوع خارجيًا.
   *
   * Stripe سيبقي الاشتراك فعالًا حتى
   * نهاية الفترة ثم يرسل Webhook.
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

    /**
     * الاشتراك الداخلي Free/مدفوع
     * لا يدعم تغيير الخطة المدفوعة مباشرة.
     */

    throw new Error(
      "Internal provider does not support paid subscription changes."
    );
  }

  /**
   * ============================================================
   * اشتراك مدفوع موجود لدى Provider خارجي
   * ============================================================
   */

  if (
    subscription.provider !==
    "internal"
  ) {
    if (
      billingCycle !==
        "monthly" &&
      billingCycle !==
        "yearly"
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

    subscription.canceledAt =
      null;

    await subscription.save();

    return {
      type: "subscription_changed",
      subscription:
        await Subscription.findById(
          subscription._id
        ).populate("plan")
    };
  }

  /**
   * ============================================================
   * المستخدم على Internal / Free
   * ويريد خطة مدفوعة
   * ============================================================
   */

  return createCheckout({
    user,
    planId: newPlanId,
    billingCycle
  });
}

/**
 * |--------------------------------------------------------------------------
 * إلغاء الاشتراك
 * |--------------------------------------------------------------------------
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

  /**
   * الاشتراك الداخلي.
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

  /**
   * Provider خارجي.
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

/**
 * |--------------------------------------------------------------------------
 * إعادة تفعيل الاشتراك
 * |--------------------------------------------------------------------------
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

/**
 * |--------------------------------------------------------------------------
 * إنشاء رقم فاتورة
 * |--------------------------------------------------------------------------
 */

async function generateInvoiceNumber() {
  const count =
    await Invoice.countDocuments();

  const number =
    String(count + 1)
      .padStart(6, "0");

  return `INV-${number}`;
}

/**
 * |--------------------------------------------------------------------------
 * تسجيل Payment
 * |--------------------------------------------------------------------------
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

  /**
   * إذا كان Provider أعطانا Payment ID،
   * نستخدمه لمنع التكرار.
   */

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
    currency:
      String(currency || "USD")
        .toUpperCase(),
    status,
    type,
    paidAt:
      status === "paid"
        ? paidAt
        : null,
    metadata: metadata || {}
  });
}

/**
 * |--------------------------------------------------------------------------
 * إنشاء Invoice
 * |--------------------------------------------------------------------------
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

  /**
   * منع تكرار Invoice من Provider.
   */

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
    currency:
      String(currency || "USD")
        .toUpperCase(),
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

/**
 * |--------------------------------------------------------------------------
 * تحديث Payment الموجود
 * |--------------------------------------------------------------------------
 */

async function updatePaymentStatus({
  provider,
  providerPaymentId,
  status,
  metadata = {}
}) {
  if (
    !providerPaymentId
  ) {
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

  payment.status =
    status;

  if (
    status === "paid"
  ) {
    payment.paidAt =
      payment.paidAt ||
      new Date();
  }

  if (
    status === "refunded"
  ) {
    payment.paidAt =
      payment.paidAt ||
      null;
  }

  payment.metadata = {
    ...(payment.metadata || {}),
    ...(metadata || {})
  };

  await payment.save();

  return payment;
}

/**
 * |--------------------------------------------------------------------------
 * معالجة Webhook موحد
 * |--------------------------------------------------------------------------
 */
async function processWebhookEvent({
  provider,
  event
}) {
  if (!provider) {
    throw new Error("Webhook provider is required.");
  }

  if (!event) {
    throw new Error("Webhook event is required.");
  }

  let eventRecord;

  try {
    eventRecord = await SubscriptionEvent.create({
      provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      normalizedType: event.normalizedType,
      data: event.data || {},
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
    const data = event.data || {};

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    const getNested = (object, paths = []) => {
      for (const path of paths) {
        const parts = path.split(".");
        let value = object;

        for (const part of parts) {
          if (
            value === null ||
            value === undefined ||
            typeof value !== "object"
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
    };

    const customData =
      data.customData ||
      data.custom_data ||
      data.metadata?.customData ||
      data.metadata?.custom_data ||
      {};

    const metadata =
      data.metadata ||
      {};

    /*
    |--------------------------------------------------------------------------
    | استخراج User ID
    |--------------------------------------------------------------------------
    */

    const resolvedUserId =
      data.userId ||
      data.user_id ||
      customData.userId ||
      customData.user_id ||
      customData.qevoraUserId ||
      customData.qevora_user_id ||
      metadata.userId ||
      metadata.user_id ||
      metadata.qevoraUserId ||
      metadata.qevora_user_id ||
      null;

    /*
    |--------------------------------------------------------------------------
    | استخراج Paddle Customer ID
    |--------------------------------------------------------------------------
    */

    const resolvedCustomerId =
      data.customerId ||
      data.customer_id ||
      data.customer?.id ||
      null;

    /*
    |--------------------------------------------------------------------------
    | استخراج Paddle Subscription ID
    |--------------------------------------------------------------------------
    */

    const resolvedSubscriptionId =
      data.subscriptionId ||
      data.subscription_id ||
      data.subscription?.id ||
      null;

    /*
    |--------------------------------------------------------------------------
    | استخراج Price ID
    |--------------------------------------------------------------------------
    */

    const resolvedPriceId =
      data.priceId ||
      data.price_id ||
      data.items?.[0]?.priceId ||
      data.items?.[0]?.price_id ||
      data.items?.[0]?.price?.id ||
      data.items?.[0]?.price?.priceId ||
      data.subscription?.items?.[0]?.priceId ||
      data.subscription?.items?.[0]?.price_id ||
      data.subscription?.items?.[0]?.price?.id ||
      customData.priceId ||
      customData.price_id ||
      metadata.priceId ||
      metadata.price_id ||
      null;

    /*
    |--------------------------------------------------------------------------
    | استخراج Plan ID
    |--------------------------------------------------------------------------
    */

    let resolvedPlanId =
      data.planId ||
      data.plan_id ||
      customData.planId ||
      customData.plan_id ||
      metadata.planId ||
      metadata.plan_id ||
      null;

    /*
    |--------------------------------------------------------------------------
    | استخراج Billing Cycle
    |--------------------------------------------------------------------------
    */

    const resolvedBillingCycle =
      data.billingCycle ||
      data.billing_cycle ||
      customData.billingCycle ||
      customData.billing_cycle ||
      metadata.billingCycle ||
      metadata.billing_cycle ||
      (
        data.billingPeriod === "year"
          ? "yearly"
          : data.billingPeriod === "month"
            ? "monthly"
            : null
      ) ||
      "monthly";

    /*
    |--------------------------------------------------------------------------
    | البحث عن User من Customer ID إذا لم نجد userId مباشرة
    |--------------------------------------------------------------------------
    */

    let resolvedUser = null;

    if (resolvedUserId) {
      resolvedUser = await User.findById(resolvedUserId);
    }

    /*
    |--------------------------------------------------------------------------
    | إذا كان لدينا اشتراك محلي سابق، نستخرج منه User
    |--------------------------------------------------------------------------
    */

    let localSubscription = null;

    if (resolvedSubscriptionId) {
      localSubscription =
        await getSubscriptionByProviderId(
          provider,
          resolvedSubscriptionId
        );
    }

    if (!localSubscription && resolvedCustomerId) {
      localSubscription =
        await getSubscriptionByCustomerId(
          provider,
          resolvedCustomerId
        );
    }

    if (!resolvedUser && localSubscription) {
      resolvedUser =
        await User.findById(localSubscription.user);
    }

    /*
    |--------------------------------------------------------------------------
    | محاولة العثور على User بواسطة Customer ID
    |--------------------------------------------------------------------------
    |
    | نبحث في الحقول المحتملة دون افتراض أن كل نسخة من User
    | تحتوي على نفس الحقل.
    |
    */

    if (!resolvedUser && resolvedCustomerId) {
      resolvedUser = await User.findOne({
        $or: [
          {
            paddleCustomerId: resolvedCustomerId
          },
          {
            "payment.paddleCustomerId":
              resolvedCustomerId
          },
          {
            "billing.paddleCustomerId":
              resolvedCustomerId
          }
        ]
      });
    }

    /*
    |--------------------------------------------------------------------------
    | إذا لم يكن لدينا Plan ID، نحاول استخراجه من Price ID
    |--------------------------------------------------------------------------
    |
    | هذا مهم جدًا مع Paddle.
    |
    | Paddle يعطي Price ID بينما التطبيق يحتاج MongoDB
    | SubscriptionPlan._id.
    |
    */

    if (!resolvedPlanId && resolvedPriceId) {
      const plans = await SubscriptionPlan.find({
        active: true
      }).lean();

      for (const candidatePlan of plans) {
        const json =
          JSON.stringify(candidatePlan);

        if (
          json.includes(String(resolvedPriceId))
        ) {
          resolvedPlanId =
            candidatePlan._id;
          break;
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | إذا وجدنا اشتراكًا محليًا قديمًا، نستخدم خطته
    |--------------------------------------------------------------------------
    */

    if (
      !resolvedPlanId &&
      localSubscription
    ) {
      resolvedPlanId =
        localSubscription.plan?._id ||
        localSubscription.plan ||
        null;
    }

    /*
    |--------------------------------------------------------------------------
    | PAYMENT_SUCCEEDED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "PAYMENT_SUCCEEDED"
    ) {
      let subscription =
        localSubscription;

      if (!subscription && resolvedSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            resolvedSubscriptionId
          );
      }

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            resolvedCustomerId
          );
      }

      const userId =
        resolvedUser?._id ||
        resolvedUserId ||
        subscription?.user?._id ||
        subscription?.user ||
        null;

      const subscriptionId =
        subscription?._id ||
        data.localSubscriptionId ||
        null;

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
            "",
          amount:
            Number(
              data.amount ||
              data.total ||
              data.details?.totals?.grandTotal ||
              0
            ),
          currency:
            data.currency ||
            data.currencyCode ||
            "USD",
          type:
            data.type ||
            "subscription",
          status: "paid",
          metadata: {
            ...(data.metadata || {}),
            priceId:
              resolvedPriceId || "",
            customerId:
              resolvedCustomerId || "",
            subscriptionId:
              resolvedSubscriptionId || ""
          }
        });
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
    */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_CREATED"
    ) {
      let subscription =
        localSubscription;

      /*
      |--------------------------------------------------------------
      | البحث بواسطة Paddle Subscription ID
      |--------------------------------------------------------------
      */

      if (
        !subscription &&
        resolvedSubscriptionId
      ) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            resolvedSubscriptionId
          );
      }

      /*
      |--------------------------------------------------------------
      | البحث بواسطة Paddle Customer ID
      |--------------------------------------------------------------
      */

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            resolvedCustomerId
          );
      }

      /*
      |--------------------------------------------------------------
      | User
      |--------------------------------------------------------------
      */

      const userId =
        resolvedUser?._id ||
        resolvedUserId ||
        subscription?.user?._id ||
        subscription?.user ||
        null;

      /*
      |--------------------------------------------------------------
      | Plan
      |--------------------------------------------------------------
      */

      const planId =
        resolvedPlanId ||
        subscription?.plan?._id ||
        subscription?.plan ||
        null;

      /*
      |--------------------------------------------------------------
      | تفعيل الاشتراك
      |--------------------------------------------------------------
      */

      if (
        userId &&
        planId &&
        resolvedSubscriptionId
      ) {
        await activateSubscription({
          userId,
          planId,
          provider,
          providerCustomerId:
            resolvedCustomerId || "",
          providerSubscriptionId:
            resolvedSubscriptionId,
          billingCycle:
            resolvedBillingCycle,
          currentPeriodStart:
            data.periodStart
              ? new Date(
                  data.periodStart
                )
              : data.currentPeriodStart
                ? new Date(
                    data.currentPeriodStart
                  )
                : new Date(),
          currentPeriodEnd:
            data.periodEnd
              ? new Date(
                  data.periodEnd
                )
              : data.currentPeriodEnd
                ? new Date(
                    data.currentPeriodEnd
                  )
                : null,
          status:
            data.status ||
            "active",
          metadata: {
            ...(data.metadata || {}),
            priceId:
              resolvedPriceId || "",
            customerId:
              resolvedCustomerId || "",
            subscriptionId:
              resolvedSubscriptionId || ""
          }
        });
      } else {
        /*
        |--------------------------------------------------------------
        | مهم:
        | لا نعتبر الحدث ناجحًا إذا لم نستطع ربطه بالمستخدم والخطة.
        |--------------------------------------------------------------
        */

        throw new Error(
          [
            "Unable to activate Paddle subscription.",
            `userId=${userId || "missing"}`,
            `planId=${planId || "missing"}`,
            `customerId=${resolvedCustomerId || "missing"}`,
            `subscriptionId=${resolvedSubscriptionId || "missing"}`,
            `priceId=${resolvedPriceId || "missing"}`
          ].join(" ")
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | CHECKOUT_COMPLETED
    |--------------------------------------------------------------------------
    */

    if (
      event.normalizedType ===
      "CHECKOUT_COMPLETED"
    ) {
      /*
       * لا نفعّل الاشتراك هنا.
       *
       * Paddle subscription.created هو المصدر
       * الأساسي لإنشاء الاشتراك.
       */
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
      let subscription = null;

      if (resolvedSubscriptionId) {
        subscription =
          await Subscription.findOne({
            provider,
            providerSubscriptionId:
              resolvedSubscriptionId
          });
      }

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerCustomerId:
              resolvedCustomerId
          });
      }

      if (subscription) {
        if (data.status) {
          subscription.status =
            data.status;
        }

        if (resolvedCustomerId) {
          subscription.providerCustomerId =
            resolvedCustomerId;
        }

        if (resolvedSubscriptionId) {
          subscription.providerSubscriptionId =
            resolvedSubscriptionId;
        }

        if (resolvedBillingCycle) {
          subscription.billingCycle =
            resolvedBillingCycle;
        }

        if (data.periodStart) {
          subscription.currentPeriodStart =
            new Date(
              data.periodStart
            );
        }

        if (data.periodEnd) {
          subscription.currentPeriodEnd =
            new Date(
              data.periodEnd
            );
        }

        if (
          typeof data.cancelAtPeriodEnd ===
          "boolean"
        ) {
          subscription.cancelAtPeriodEnd =
            data.cancelAtPeriodEnd;
        }

        if (
          data.cancelAtPeriodEnd ===
          false
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
      let subscription = null;

      if (resolvedSubscriptionId) {
        subscription =
          await Subscription.findOne({
            provider,
            providerSubscriptionId:
              resolvedSubscriptionId
          });
      }

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerCustomerId:
              resolvedCustomerId
          });
      }

      if (subscription) {
        subscription.status =
          "canceled";

        subscription.canceledAt =
          new Date();

        subscription.endedAt =
          data.endedAt
            ? new Date(
                data.endedAt
              )
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
      let subscription = null;

      if (resolvedSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            resolvedSubscriptionId
          );
      }

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            resolvedCustomerId
          );
      }

      const userId =
        resolvedUser?._id ||
        resolvedUserId ||
        subscription?.user?._id ||
        subscription?.user ||
        null;

      const subscriptionId =
        subscription?._id ||
        data.localSubscriptionId ||
        null;

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
              data.amount ||
              0
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
      let subscription = null;

      if (resolvedSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            resolvedSubscriptionId
          );
      }

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            resolvedCustomerId
          );
      }

      if (subscription) {
        if (data.status) {
          subscription.status =
            data.status;
        } else if (
          subscription.status ===
          "active"
        ) {
          subscription.status =
            "past_due";
        }

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
      let subscription = null;

      if (resolvedSubscriptionId) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            resolvedSubscriptionId
          );
      }

      if (
        !subscription &&
        resolvedCustomerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            resolvedCustomerId
          );
      }

      if (subscription) {
        if (data.status) {
          subscription.status =
            data.status;
        } else {
          subscription.status =
            "past_due";
        }

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
    eventRecord.processingError = "";

    await eventRecord.save();

    return {
      success: true
    };
  } catch (error) {
    eventRecord.processingError =
      error?.message ||
      "Webhook processing failed";

    await eventRecord.save();

    throw error;
  }
}



module.exports = {
  getFreePlan,
  getPlanById,
  getUserSubscription,
  ensureFreeSubscription,
  createCheckout,
  activateSubscription,
  changePlan,
  cancelSubscription,
  reactivateSubscription,
  recordPayment,
  createInvoice,
  processWebhookEvent
};