const Subscription =
  require("../../models/Subscription");

const SubscriptionPlan =
  require("../../models/SubscriptionPlan");

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

  /**
   * ============================================================
   * الخطة المجانية
   * ============================================================
   */

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

  /**
   * ============================================================
   * الخطط المدفوعة
   * ============================================================
   */

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

  /**
   * إذا كان Provider داخليًا،
   * فإن الخطط المدفوعة غير مدعومة.
   */

  if (providerName === "internal") {
    throw new Error(
      "Paid plans require an external payment provider."
    );
  }

  const existing =
    await getUserSubscription(
      user._id
    );

  /**
   * إذا كان لدينا Customer ID سابقًا
   * نعيد استخدامه.
   */

  let customerId =
    existing?.provider === providerName
      ? existing.providerCustomerId || ""
      : "";

  /**
   * إذا لم يكن لدينا Customer،
   * ننشئ Customer جديدًا لدى Provider.
   */

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
}

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
    throw new Error(
      "Webhook provider is required."
    );
  }

  if (!event) {
    throw new Error(
      "Webhook event is required."
    );
  }

  /**
   * ============================================================
   * حماية من التكرار
   * ============================================================
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

    /**
     * ==========================================================
     * PAYMENT_SUCCEEDED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "PAYMENT_SUCCEEDED"
    ) {
      let subscription = null;

      if (
        data.subscriptionId
      ) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            data.subscriptionId
          );
      }

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            data.customerId
          );
      }

      const userId =
        data.userId ||
        subscription?.user?.toString?.() ||
        subscription?.user?._id;

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
            data.paymentId || "",
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
            data.metadata || {}
        });
      }
    }

    /**
     * ==========================================================
     * PAYMENT_FAILED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "PAYMENT_FAILED"
    ) {
      await updatePaymentStatus({
        provider,
        providerPaymentId:
          data.paymentId || "",
        status: "failed",
        metadata:
          data.metadata || {}
      });
    }

    /**
     * ==========================================================
     * PAYMENT_REFUNDED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "PAYMENT_REFUNDED"
    ) {
      await updatePaymentStatus({
        provider,
        providerPaymentId:
          data.paymentId || "",
        status:
          data.refundStatus ===
          "partially_refunded"
            ? "partially_refunded"
            : "refunded",
        metadata: {
          ...(data.metadata || {}),
          refundId:
            data.refundId || "",
          refundAmount:
            data.refundAmount || 0
        }
      });
    }

    /**
     * ==========================================================
     * SUBSCRIPTION_CREATED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_CREATED"
    ) {
      let userId =
        data.userId || null;

      let planId =
        data.planId || null;

      let subscription = null;

      /**
       * أولًا نحاول بواسطة Provider Subscription ID.
       */

      if (
        data.subscriptionId
      ) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            data.subscriptionId
          );
      }

      /**
       * ثم بواسطة Customer ID.
       */

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            data.customerId
          );
      }

      /**
       * إذا وجدنا اشتراكًا محليًا،
       * نستخدم بياناته عند الحاجة.
       */

      if (subscription) {
        userId =
          userId ||
          subscription.user?._id ||
          subscription.user;

        planId =
          planId ||
          subscription.plan?._id ||
          subscription.plan;
      }

      if (
        userId &&
        planId
      ) {
        await activateSubscription({
          userId,
          planId,
          provider,
          providerCustomerId:
            data.customerId || "",
          providerSubscriptionId:
            data.subscriptionId || "",
          billingCycle:
            data.billingCycle ||
            "monthly",
          currentPeriodStart:
            data.periodStart
              ? new Date(
                  data.periodStart
                )
              : new Date(),
          currentPeriodEnd:
            data.periodEnd
              ? new Date(
                  data.periodEnd
                )
              : null,
          status:
            data.status ||
            "active",
          metadata:
            data.metadata || {}
        });
      }
    }

    /**
     * ==========================================================
     * CHECKOUT_COMPLETED
     * ==========================================================
     *
     * في Stripe، هذا الحدث يعني أن Checkout
     * اكتمل، لكنه ليس المصدر الوحيد لتفعيل
     * الاشتراك.
     *
     * لذلك لا ننشئ Subscription هنا إذا لم
     * تصل بيانات كافية.
     */

    if (
      event.normalizedType ===
      "CHECKOUT_COMPLETED"
    ) {
      /**
       * لا نفعل الاشتراك هنا.
       *
       * customer.subscription.created
       * هو المسؤول الأساسي عن إنشاء/تحديث
       * الاشتراك.
       */
    }

    /**
     * ==========================================================
     * SUBSCRIPTION_UPDATED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_UPDATED"
    ) {
      let subscription = null;

      if (
        data.subscriptionId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerSubscriptionId:
              data.subscriptionId
          });
      }

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerCustomerId:
              data.customerId
          });
      }

      if (subscription) {
        if (data.status) {
          subscription.status =
            data.status;
        }

        if (
          data.customerId
        ) {
          subscription.providerCustomerId =
            data.customerId;
        }

        if (
          data.subscriptionId
        ) {
          subscription.providerSubscriptionId =
            data.subscriptionId;
        }

        if (
          data.billingCycle
        ) {
          subscription.billingCycle =
            data.billingCycle;
        }

        if (
          data.periodStart
        ) {
          subscription.currentPeriodStart =
            new Date(
              data.periodStart
            );
        }

        if (
          data.periodEnd
        ) {
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
            ...(subscription.metadata ||
              {}),
            ...data.metadata
          };
        }

        await subscription.save();
      }
    }

    /**
     * ==========================================================
     * SUBSCRIPTION_CANCELED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "SUBSCRIPTION_CANCELED"
    ) {
      let subscription = null;

      if (
        data.subscriptionId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerSubscriptionId:
              data.subscriptionId
          });
      }

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await Subscription.findOne({
            provider,
            providerCustomerId:
              data.customerId
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

    /**
     * ==========================================================
     * INVOICE_PAID
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "INVOICE_PAID"
    ) {
      let subscription = null;

      /**
       * محاولة أولى بواسطة Provider Subscription ID.
       */

      if (
        data.subscriptionId
      ) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            data.subscriptionId
          );
      }

      /**
       * محاولة ثانية بواسطة Customer ID.
       */

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            data.customerId
          );
      }

      const userId =
        data.userId ||
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
            data.invoiceId || "",
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
            data.invoiceUrl || "",
          metadata:
            data.metadata || {}
        });
      }
    }

    /**
     * ==========================================================
     * INVOICE_PAYMENT_FAILED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "INVOICE_PAYMENT_FAILED"
    ) {
      let subscription = null;

      if (
        data.subscriptionId
      ) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            data.subscriptionId
          );
      }

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            data.customerId
          );
      }

      if (subscription) {
        /**
         * لا نحول الاشتراك مباشرة إلى canceled.
         *
         * Stripe قد يدخل subscription
         * في past_due أولًا.
         *
         * لذلك نستخدم status القادم من Stripe
         * إن كان موجودًا.
         */

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

    /**
     * ==========================================================
     * INVOICE_FAILED
     * ==========================================================
     */

    if (
      event.normalizedType ===
      "INVOICE_FAILED"
    ) {
      let subscription = null;

      if (
        data.subscriptionId
      ) {
        subscription =
          await getSubscriptionByProviderId(
            provider,
            data.subscriptionId
          );
      }

      if (
        !subscription &&
        data.customerId
      ) {
        subscription =
          await getSubscriptionByCustomerId(
            provider,
            data.customerId
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

    /**
     * ==========================================================
     * تسجيل نجاح المعالجة
     * ==========================================================
     */

    eventRecord.processed =
      true;

    eventRecord.processedAt =
      new Date();

    eventRecord.processingError =
      "";

    await eventRecord.save();

    return {
      success: true
    };
  } catch (error) {
    eventRecord.processingError =
      error.message ||
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