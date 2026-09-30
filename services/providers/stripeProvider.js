const PaymentProvider = require("../payments/paymentProvider");

class StripeProvider extends PaymentProvider {
  constructor() {
    super();

    this.stripe = null;
  }

  getStripe() {
    if (this.stripe) {
      return this.stripe;
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured."
      );
    }

    const Stripe = require("stripe");

    this.stripe = new Stripe(
      process.env.STRIPE_SECRET_KEY
    );

    return this.stripe;
  }

  getCustomerId(customer) {
    if (!customer) {
      return null;
    }

    if (typeof customer === "string") {
      return customer;
    }

    return customer.id || null;
  }

  getSubscriptionId(subscription) {
    if (!subscription) {
      return null;
    }

    if (typeof subscription === "string") {
      return subscription;
    }

    return subscription.id || null;
  }

  toDate(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "number") {
      return new Date(value * 1000);
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  readValue(object, ...keys) {
    if (!object) {
      return null;
    }

    for (const key of keys) {
      const value = object[key];

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

  getMetadata(object) {
    if (!object) {
      return {};
    }

    const metadata =
      object.metadata &&
      typeof object.metadata === "object"
        ? object.metadata
        : null;

    if (
      metadata &&
      Object.keys(metadata).length > 0
    ) {
      return metadata;
    }

    const subscriptionDetails =
      object.subscription_details &&
      typeof object.subscription_details === "object"
        ? object.subscription_details
        : null;

    if (
      subscriptionDetails &&
      subscriptionDetails.metadata &&
      Object.keys(subscriptionDetails.metadata).length > 0
    ) {
      return subscriptionDetails.metadata;
    }

    const parentSubscriptionDetails =
      object.parent &&
      object.parent.subscription_details &&
      typeof object.parent.subscription_details === "object"
        ? object.parent.subscription_details
        : null;

    if (
      parentSubscriptionDetails &&
      parentSubscriptionDetails.metadata &&
      Object.keys(parentSubscriptionDetails.metadata).length > 0
    ) {
      return parentSubscriptionDetails.metadata;
    }

    return {};
  }

  getUserIdFromMetadata(metadata) {
    if (!metadata) {
      return null;
    }

    return (
      metadata.qevoraUserId ||
      metadata.userId ||
      metadata.user_id ||
      null
    );
  }

  getPlanIdFromMetadata(metadata) {
    if (!metadata) {
      return null;
    }

    return (
      metadata.qevoraPlanId ||
      metadata.planId ||
      metadata.plan_id ||
      null
    );
  }

  getBillingCycleFromMetadata(metadata) {
    if (!metadata) {
      return null;
    }

    return (
      metadata.billingCycle ||
      metadata.billing_cycle ||
      null
    );
  }

  getStripePriceId(plan, billingCycle) {
    if (!plan) {
      return null;
    }

    const providerPrices =
      Array.isArray(plan.providerPrices)
        ? plan.providerPrices
        : [];

    const stripePrice =
      providerPrices.find(
        (item) =>
          String(item.provider || "").toLowerCase() ===
          "stripe"
      );

    if (stripePrice) {
      if (billingCycle === "monthly") {
        return stripePrice.monthlyPriceId || null;
      }

      if (billingCycle === "yearly") {
        return stripePrice.yearlyPriceId || null;
      }
    }

    if (
      plan.stripePriceIds &&
      typeof plan.stripePriceIds === "object"
    ) {
      if (billingCycle === "monthly") {
        return (
          plan.stripePriceIds.monthly ||
          null
        );
      }

      if (billingCycle === "yearly") {
        return (
          plan.stripePriceIds.yearly ||
          null
        );
      }
    }

    if (
      plan.providerPriceIds &&
      typeof plan.providerPriceIds === "object"
    ) {
      const stripeIds =
        plan.providerPriceIds.stripe ||
        plan.providerPriceIds;

      if (billingCycle === "monthly") {
        return (
          stripeIds.monthly ||
          stripeIds.monthlyPriceId ||
          null
        );
      }

      if (billingCycle === "yearly") {
        return (
          stripeIds.yearly ||
          stripeIds.yearlyPriceId ||
          null
        );
      }
    }

    return null;
  }

  getFrontendUrl() {
    return (
      process.env.CLIENT_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  normalizeSubscription(subscription) {
    if (!subscription) {
      return null;
    }

    const firstItem =
      subscription.items &&
      subscription.items.data &&
      subscription.items.data.length
        ? subscription.items.data[0]
        : null;

    const price =
      firstItem && firstItem.price
        ? firstItem.price
        : null;

    const metadata =
      this.getMetadata(subscription);

    return {
      provider: "stripe",

      providerSubscriptionId:
        subscription.id,

      providerCustomerId:
        this.getCustomerId(
          subscription.customer
        ),

      userId:
        this.getUserIdFromMetadata(
          metadata
        ),

      planId:
        this.getPlanIdFromMetadata(
          metadata
        ),

      billingCycle:
        this.getBillingCycleFromMetadata(
          metadata
        ),

      status:
        subscription.status,

      cancelAtPeriodEnd:
        Boolean(
          subscription.cancel_at_period_end
        ),

      currentPeriodStart:
        this.toDate(
          subscription.current_period_start
        ),

      currentPeriodEnd:
        this.toDate(
          subscription.current_period_end
        ),

      trialStart:
        this.toDate(
          subscription.trial_start
        ),

      trialEnd:
        this.toDate(
          subscription.trial_end
        ),

      canceledAt:
        this.toDate(
          subscription.canceled_at
        ),

      endedAt:
        this.toDate(
          subscription.ended_at
        ),

      latestInvoiceId:
        typeof subscription.latest_invoice ===
        "string"
          ? subscription.latest_invoice
          : subscription.latest_invoice?.id ||
            null,

      priceId:
        price?.id || null,

      productId:
        typeof price?.product === "string"
          ? price.product
          : price?.product?.id || null,

      currency:
        price?.currency || null,

      metadata
    };
  }

  async createCustomer(user) {
    if (!user) {
      throw new Error(
        "User is required to create Stripe customer."
      );
    }

    const stripe =
      this.getStripe();

    const customer =
      await stripe.customers.create({
        email:
          user.email || undefined,

        name:
          user.fullName ||
          user.username ||
          undefined,

        phone:
          user.phone ||
          undefined,

        metadata: {
          qevoraUserId:
            String(
              user._id ||
              user.id ||
              ""
            ),

          username:
            user.username ||
            "",

          source:
            "qevora"
        }
      });

    return {
      provider: "stripe",

      id: customer.id,

      providerCustomerId:
        customer.id,

      email:
        customer.email,

      name:
        customer.name,

      raw:
        customer
    };
  }

  async createCheckout({
    user,
    plan,
    billingCycle,
    customer
  }) {
    if (!user) {
      throw new Error(
        "User is required to create checkout."
      );
    }

    if (!plan) {
      throw new Error(
        "Subscription plan is required."
      );
    }

    if (
      billingCycle !== "monthly" &&
      billingCycle !== "yearly"
    ) {
      throw new Error(
        "Stripe checkout supports monthly and yearly billing only."
      );
    }

    const stripe =
      this.getStripe();

    const customerId =
      this.getCustomerId(
        customer
      );

    if (!customerId) {
      throw new Error(
        "Stripe customer ID is required."
      );
    }

    const priceId =
      this.getStripePriceId(
        plan,
        billingCycle
      );

    if (!priceId) {
      throw new Error(
        `Stripe price ID is not configured for plan "${plan.slug || plan.name}" and billing cycle "${billingCycle}".`
      );
    }

    const userId =
      String(
        user._id ||
        user.id ||
        ""
      );

    const planId =
      String(
        plan._id ||
        plan.id ||
        ""
      );

    const frontendUrl =
      this.getFrontendUrl();

    const session =
      await stripe.checkout.sessions.create(
        {
          mode:
            "subscription",

          customer:
            customerId,

          line_items: [
            {
              price:
                priceId,

              quantity:
                1
            }
          ],

          success_url:
            `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            `${frontendUrl}/subscription`,

          client_reference_id:
            userId,

          allow_promotion_codes:
            true,

          metadata: {
            qevoraUserId:
              userId,

            qevoraPlanId:
              planId,

            planCode:
              plan.code ||
              "",

            billingCycle
          },

          subscription_data: {
            metadata: {
              qevoraUserId:
                userId,

              qevoraPlanId:
                planId,

              planCode:
                plan.code ||
                "",

              billingCycle
            }
          }
        }
      );

    return {
      provider:
        "stripe",

      checkoutId:
        session.id,

      id:
        session.id,

      checkoutUrl:
        session.url,

      url:
        session.url,

      customerId,

      mode:
        session.mode,

      status:
        session.status,

      paymentStatus:
        session.payment_status,

      subscriptionId:
        typeof session.subscription ===
        "string"
          ? session.subscription
          : session.subscription?.id ||
            null,

      raw:
        session
    };
  }

  async changeSubscription({
    subscription,
    newPlan,
    billingCycle
  }) {
    if (!subscription) {
      throw new Error(
        "Subscription is required."
      );
    }

    if (!newPlan) {
      throw new Error(
        "New subscription plan is required."
      );
    }

    const stripe =
      this.getStripe();

    const stripeSubscriptionId =
      subscription.providerSubscriptionId ||
      subscription.stripeSubscriptionId ||
      null;

    if (!stripeSubscriptionId) {
      throw new Error(
        "Stripe subscription ID is required."
      );
    }

    const priceId =
      this.getStripePriceId(
        newPlan,
        billingCycle
      );

    if (!priceId) {
      throw new Error(
        "Stripe price ID is not configured for the selected plan."
      );
    }

    const currentSubscription =
      await stripe.subscriptions.retrieve(
        stripeSubscriptionId
      );

    const item =
      currentSubscription.items &&
      currentSubscription.items.data &&
      currentSubscription.items.data[0];

    if (!item) {
      throw new Error(
        "Stripe subscription item was not found."
      );
    }

    const updatedSubscription =
      await stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          items: [
            {
              id:
                item.id,

              price:
                priceId
            }
          ],

          proration_behavior:
            "create_prorations",

          metadata: {
            qevoraUserId:
              String(
                subscription.user ||
                subscription.userId ||
                ""
              ),

            qevoraPlanId:
              String(
                newPlan._id ||
                newPlan.id ||
                ""
              ),

            billingCycle
          }
        }
      );

    return {
      provider:
        "stripe",

      subscriptionId:
        updatedSubscription.id,

      status:
        updatedSubscription.status,

      subscription:
        this.normalizeSubscription(
          updatedSubscription
        ),

      raw:
        updatedSubscription
    };
  }

  async cancelSubscription({
    subscription,
    immediately = false
  }) {
    if (!subscription) {
      throw new Error(
        "Subscription is required."
      );
    }

    const stripe =
      this.getStripe();

    const stripeSubscriptionId =
      subscription.providerSubscriptionId ||
      subscription.stripeSubscriptionId ||
      null;

    if (!stripeSubscriptionId) {
      throw new Error(
        "Stripe subscription ID is required."
      );
    }

    if (immediately) {
      const canceledSubscription =
        await stripe.subscriptions.cancel(
          stripeSubscriptionId
        );

      return {
        provider:
          "stripe",

        success:
          true,

        immediately:
          true,

        subscriptionId:
          canceledSubscription.id,

        subscription:
          this.normalizeSubscription(
            canceledSubscription
          ),

        raw:
          canceledSubscription
      };
    }

    const updatedSubscription =
      await stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          cancel_at_period_end:
            true
        }
      );

    return {
      provider:
        "stripe",

      success:
        true,

      immediately:
        false,

      subscriptionId:
        updatedSubscription.id,

      subscription:
        this.normalizeSubscription(
          updatedSubscription
        ),

      raw:
        updatedSubscription
    };
  }

  async reactivateSubscription({
    subscription
  }) {
    if (!subscription) {
      throw new Error(
        "Subscription is required."
      );
    }

    const stripe =
      this.getStripe();

    const stripeSubscriptionId =
      subscription.providerSubscriptionId ||
      subscription.stripeSubscriptionId ||
      null;

    if (!stripeSubscriptionId) {
      throw new Error(
        "Stripe subscription ID is required."
      );
    }

    const updatedSubscription =
      await stripe.subscriptions.update(
        stripeSubscriptionId,
        {
          cancel_at_period_end:
            false
        }
      );

    return {
      provider:
        "stripe",

      success:
        true,

      subscriptionId:
        updatedSubscription.id,

      subscription:
        this.normalizeSubscription(
          updatedSubscription
        ),

      raw:
        updatedSubscription
    };
  }

  async createBillingPortal({
    customer
  }) {
    const stripe =
      this.getStripe();

    const customerId =
      this.getCustomerId(
        customer
      );

    if (!customerId) {
      throw new Error(
        "Stripe customer ID is required."
      );
    }

    const frontendUrl =
      this.getFrontendUrl();

    const portalSession =
      await stripe.billingPortal.sessions.create(
        {
          customer:
            customerId,

          return_url:
            `${frontendUrl}/subscription`
        }
      );

    return {
      provider:
        "stripe",

      id:
        portalSession.id,

      url:
        portalSession.url,

      raw:
        portalSession
    };
  }

  async verifyWebhook({
    request
  }) {
    if (!request) {
      throw new Error(
        "Webhook request is required."
      );
    }

    const stripe =
      this.getStripe();

    const signature =
      request.headers[
        "stripe-signature"
      ];

    if (!signature) {
      throw new Error(
        "Stripe webhook signature is missing."
      );
    }

    if (
      !process.env.STRIPE_WEBHOOK_SECRET
    ) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is not configured."
      );
    }

    const rawBody =
      request.rawBody;

    if (!rawBody) {
      throw new Error(
        "Stripe webhook raw body is missing."
      );
    }

    const event =
      stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

    return event;
  }

  normalizeWebhookEvent(event) {
    if (!event) {
      return null;
    }

    const object =
      event.data &&
      event.data.object
        ? event.data.object
        : null;

    const metadata =
      this.getMetadata(object);

    const base = {
      provider:
        "stripe",

      providerEventId:
        event.id,

      eventType:
        event.type,

      createdAt:
        this.toDate(
          event.created
        ),

      data:
        null
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const subscriptionId =
          this.getSubscriptionId(
            object?.subscription
          );

        return {
          ...base,

          normalizedType:
            "CHECKOUT_COMPLETED",

          data: {
            userId:
              this.getUserIdFromMetadata(
                metadata
              ),

            planId:
              this.getPlanIdFromMetadata(
                metadata
              ),

            billingCycle:
              this.getBillingCycleFromMetadata(
                metadata
              ),

            customerId:
              this.getCustomerId(
                object?.customer
              ),

            subscriptionId,

            checkoutId:
              object?.id ||
              null,

            paymentStatus:
              object?.payment_status ||
              null,

            amountTotal:
              object?.amount_total ||
              0,

            currency:
              object?.currency ||
              null,

            metadata
          }
        };
      }

      case "customer.subscription.created": {
        const normalized =
          this.normalizeSubscription(
            object
          );

        return {
          ...base,

          normalizedType:
            "SUBSCRIPTION_CREATED",

          data:
            normalized
        };
      }

      case "customer.subscription.updated": {
        const normalized =
          this.normalizeSubscription(
            object
          );

        return {
          ...base,

          normalizedType:
            "SUBSCRIPTION_UPDATED",

          data:
            normalized
        };
      }

      case "customer.subscription.deleted": {
        const normalized =
          this.normalizeSubscription(
            object
          );

        return {
          ...base,

          normalizedType:
            "SUBSCRIPTION_CANCELED",

          data:
            normalized
        };
      }

      case "invoice.paid": {
        const subscriptionId =
          this.getSubscriptionId(
            object?.subscription
          );

        return {
          ...base,

          normalizedType:
            "INVOICE_PAID",

          data: {
            userId:
              this.getUserIdFromMetadata(
                metadata
              ),

            subscriptionId,

            invoiceId:
              object?.id ||
              null,

            paymentId:
              typeof object?.payment_intent ===
              "string"
                ? object.payment_intent
                : object?.payment_intent?.id ||
                  null,

            amount:
              object?.amount_paid ||
              0,

            currency:
              object?.currency ||
              null,

            periodStart:
              this.toDate(
                object?.period_start
              ),

            periodEnd:
              this.toDate(
                object?.period_end
              ),

            invoiceUrl:
              object?.hosted_invoice_url ||
              object?.invoice_pdf ||
              null,

            metadata: {
              ...metadata,

              stripeInvoiceNumber:
                object?.number ||
                null,

              amountDue:
                object?.amount_due ||
                0,

              attemptCount:
                object?.attempt_count ||
                0
            }
          }
        };
      }

      case "invoice.payment_failed": {
        const subscriptionId =
          this.getSubscriptionId(
            object?.subscription
          );

        return {
          ...base,

          normalizedType:
            "INVOICE_PAYMENT_FAILED",

          data: {
            userId:
              this.getUserIdFromMetadata(
                metadata
              ),

            subscriptionId,

            invoiceId:
              object?.id ||
              null,

            paymentId:
              typeof object?.payment_intent ===
              "string"
                ? object.payment_intent
                : object?.payment_intent?.id ||
                  null,

            amount:
              object?.amount_due ||
              0,

            currency:
              object?.currency ||
              null,

            periodStart:
              this.toDate(
                object?.period_start
              ),

            periodEnd:
              this.toDate(
                object?.period_end
              ),

            metadata: {
              ...metadata,

              stripeInvoiceNumber:
                object?.number ||
                null,

              attemptCount:
                object?.attempt_count ||
                0
            }
          }
        };
      }

      case "payment_intent.succeeded": {
        return {
          ...base,

          normalizedType:
            "PAYMENT_SUCCEEDED",

          data: {
            userId:
              this.getUserIdFromMetadata(
                metadata
              ),

            paymentId:
              object?.id ||
              null,

            amount:
              object?.amount_received ||
              object?.amount ||
              0,

            currency:
              object?.currency ||
              null,

            customerId:
              this.getCustomerId(
                object?.customer
              ),

            metadata
          }
        };
      }

      case "payment_intent.payment_failed": {
        return {
          ...base,

          normalizedType:
            "PAYMENT_FAILED",

          data: {
            userId:
              this.getUserIdFromMetadata(
                metadata
              ),

            paymentId:
              object?.id ||
              null,

            amount:
              object?.amount ||
              0,

            currency:
              object?.currency ||
              null,

            customerId:
              this.getCustomerId(
                object?.customer
              ),

            failureMessage:
              object?.last_payment_error?.message ||
              null,

            metadata
          }
        };
      }

      case "charge.refunded": {
        return {
          ...base,

          normalizedType:
            "PAYMENT_REFUNDED",

          data: {
            userId:
              this.getUserIdFromMetadata(
                metadata
              ),

            chargeId:
              object?.id ||
              null,

            paymentId:
              object?.payment_intent ||
              null,

            amountRefunded:
              object?.amount_refunded ||
              0,

            currency:
              object?.currency ||
              null,

            metadata
          }
        };
      }

      default: {
        return {
          ...base,

          normalizedType:
            "UNKNOWN",

          originalType:
            event.type,

          data:
            null
        };
      }
    }
  }
}

module.exports =
  new StripeProvider();