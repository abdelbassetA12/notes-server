const PaymentProvider =
  require("../payments/paymentProvider");

const {
  webhooks
} = require("@polar-sh/sdk/2026-10");

class PolarProvider extends PaymentProvider {
  constructor() {
    super();

    this.accessToken =
      process.env.POLAR_ACCESS_TOKEN || "";

    this.webhookSecret =
      process.env.POLAR_WEBHOOK_SECRET || "";

    this.environment =
      (
        process.env.POLAR_ENVIRONMENT ||
        "sandbox"
      ).toLowerCase();

    this.baseUrl =
      this.environment === "production"
        ? "https://api.polar.sh"
        : "https://sandbox-api.polar.sh";
  }

  ensureConfigured() {
    if (!this.accessToken) {
      throw new Error(
        "POLAR_ACCESS_TOKEN is not configured."
      );
    }
  }

  async request(
    path,
    {
      method = "GET",
      body
    } = {}
  ) {
    this.ensureConfigured();

    const response =
      await fetch(
        `${this.baseUrl}${path}`,
        {
          method,

          headers: {
            Authorization:
              `Bearer ${this.accessToken}`,

            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body:
            body === undefined
              ? undefined
              : JSON.stringify(body)
        }
      );

    const text =
      await response.text();

    let data = {};

    try {
      data =
        text
          ? JSON.parse(text)
          : {};
    } catch {
      data = {
        raw: text
      };
    }

    if (!response.ok) {
      const message =
        data?.detail ||
        data?.error ||
        data?.message ||
        `Polar API request failed with status ${response.status}.`;

      throw new Error(message);
    }

    return data;
  }

  getUserId(user) {
    return (
      user?._id ||
      user?.id ||
      null
    );
  }

  getUserName(user) {
    return (
      user?.fullName ||
      user?.name ||
      user?.username ||
      null
    );
  }

  getCustomerId(customer) {
    if (!customer) {
      return null;
    }

    if (typeof customer === "string") {
      return customer;
    }

    return (
      customer.id ||
      customer.providerCustomerId ||
      null
    );
  }

  getSubscriptionId(subscription) {
    if (!subscription) {
      return null;
    }

    if (typeof subscription === "string") {
      return subscription;
    }

    return (
      subscription.providerSubscriptionId ||
      subscription.subscriptionId ||
      subscription.id ||
      null
    );
  }

  /**
   * Polar uses Product IDs for checkout.
   *
   * Because our generic schema already has:
   *
   * monthlyPriceId
   * yearlyPriceId
   *
   * we store the corresponding Polar
   * recurring Product ID in those fields.
   */

  getProductId(
    plan,
    billingCycle
  ) {
    if (!plan) {
      return null;
    }

    const cycle =
      billingCycle === "yearly"
        ? "yearly"
        : "monthly";

    if (
      Array.isArray(
        plan.providerPrices
      )
    ) {
      const providerPrice =
        plan.providerPrices.find(
          (item) =>
            String(
              item?.provider || ""
            ).toLowerCase() === "polar"
        );

      if (providerPrice) {
        const productId =
          cycle === "yearly"
            ? providerPrice.yearlyPriceId
            : providerPrice.monthlyPriceId;

        if (productId) {
          return productId;
        }
      }
    }

    if (plan.polarProductIds) {
      return (
        cycle === "yearly"
          ? plan.polarProductIds.yearly
          : plan.polarProductIds.monthly
      ) || null;
    }

    return null;
  }

  getFrontendUrl() {
    return (
      process.env.CLIENT_URL ||
      "http://localhost:5173"
    ).replace(/\/$/, "");
  }

  /**
   * |--------------------------------------------------------------------------
   * | Customer
   * |--------------------------------------------------------------------------
   */

  async createCustomer(user) {
    if (!user) {
      throw new Error(
        "User is required to create a Polar customer."
      );
    }

    if (!user.email) {
      throw new Error(
        "User email is required to create a Polar customer."
      );
    }

    const userId =
      this.getUserId(user);

    const response =
      await this.request(
        "/v1/customers",
        {
          method: "POST",

          body: {
            email:
              user.email,

            name:
              this.getUserName(user),

            external_id:
              String(userId),

            metadata: {
              qevoraUserId:
                String(userId)
            }
          }
        }
      );

    const customer =
      response;

    if (!customer?.id) {
      throw new Error(
        "Polar customer was not created."
      );
    }

    return {
      provider: "polar",

      id:
        customer.id,

      providerCustomerId:
        customer.id,

      externalCustomerId:
        customer.external_id ||
        String(userId),

      email:
        customer.email ||
        user.email,

      name:
        customer.name ||
        null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Checkout
   * |--------------------------------------------------------------------------
   */

  async createCheckout({
    user,
    plan,
    billingCycle,
    customer
  }) {
    if (!user) {
      throw new Error(
        "User is required."
      );
    }

    if (!plan) {
      throw new Error(
        "Subscription plan is required."
      );
    }

    if (plan.isFree) {
      throw new Error(
        "Free plans do not require Polar Checkout."
      );
    }

    if (
      !["monthly", "yearly"].includes(
        billingCycle
      )
    ) {
      throw new Error(
        "Polar supports monthly or yearly billing for paid plans."
      );
    }

    const productId =
      this.getProductId(
        plan,
        billingCycle
      );

    if (!productId) {
      throw new Error(
        `No Polar product ID configured for plan "${plan.name}" (${billingCycle}).`
      );
    }

    const userId =
      this.getUserId(user);

    const customerId =
      this.getCustomerId(customer);

    const frontendUrl =
      this.getFrontendUrl();

    const response =
      await this.request(
        "/v1/checkouts",
        {
          method: "POST",

          body: {
            products: [
              productId
            ],

            customer_id:
              customerId || null,

            external_customer_id:
              String(userId),

            customer_email:
              user.email || null,

            customer_name:
              this.getUserName(user),

            metadata: {
              qevoraUserId:
                String(userId),

              planId:
                String(
                  plan._id ||
                  plan.id
                ),

              planSlug:
                plan.slug || "",

              billingCycle,

              provider:
                "polar"
            },

            success_url:
              `${frontendUrl}/subscription/success?provider=polar&checkout_id={CHECKOUT_ID}`,

            return_url:
              `${frontendUrl}/subscription`
          }
        }
      );

    if (!response?.url) {
      throw new Error(
        "Polar did not return a checkout URL."
      );
    }

    return {
      provider: "polar",

      checkoutId:
        response.id ||
        null,

      id:
        response.id ||
        null,

      checkoutUrl:
        response.url,

      url:
        response.url,

      customerId:
        response.customer_id ||
        customerId ||
        null,

      providerCustomerId:
        response.customer_id ||
        customerId ||
        null,

      subscriptionId:
        response.subscription_id ||
        null,

      mode:
        "subscription",

      status:
        response.status ||
        "open",

      paymentStatus:
        response.status ===
        "succeeded"
          ? "paid"
          : "pending",

      billingCycle,

      planId:
        plan._id ||
        plan.id ||
        null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Change subscription
   * |--------------------------------------------------------------------------
   */

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
        "New plan is required."
      );
    }

    const subscriptionId =
      this.getSubscriptionId(
        subscription
      );

    if (!subscriptionId) {
      throw new Error(
        "Polar subscription ID is required."
      );
    }

    const productId =
      this.getProductId(
        newPlan,
        billingCycle
      );

    if (!productId) {
      throw new Error(
        `No Polar product ID configured for plan "${newPlan.name}" (${billingCycle}).`
      );
    }

    const response =
      await this.request(
        `/v1/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            product_id:
              productId,

            proration_behavior:
              "prorate"
          }
        }
      );

    return {
      provider: "polar",

      success: true,

      subscriptionId,

      billingCycle,

      data:
        response || null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Cancel
   * |--------------------------------------------------------------------------
   */

  async cancelSubscription({
    subscription,
    immediately = false
  }) {
    const subscriptionId =
      this.getSubscriptionId(
        subscription
      );

    if (!subscriptionId) {
      throw new Error(
        "Polar subscription ID is required."
      );
    }

    let response;

    if (immediately) {
      response =
        await this.request(
          `/v1/subscriptions/${subscriptionId}`,
          {
            method: "DELETE"
          }
        );
    } else {
      response =
        await this.request(
          `/v1/subscriptions/${subscriptionId}`,
          {
            method: "PATCH",

            body: {
              cancel_at_period_end:
                true
            }
          }
        );
    }

    return {
      provider: "polar",

      success: true,

      subscriptionId,

      immediately:
        Boolean(immediately),

      data:
        response || null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Reactivate
   * |--------------------------------------------------------------------------
   */

  async reactivateSubscription({
    subscription
  }) {
    const subscriptionId =
      this.getSubscriptionId(
        subscription
      );

    if (!subscriptionId) {
      throw new Error(
        "Polar subscription ID is required."
      );
    }

    const response =
      await this.request(
        `/v1/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            cancel_at_period_end:
              false
          }
        }
      );

    return {
      provider: "polar",

      success: true,

      subscriptionId,

      data:
        response || null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Billing Portal
   * |--------------------------------------------------------------------------
   */

  async createBillingPortal({
    customer
  }) {
    const customerId =
      this.getCustomerId(
        customer
      );

    const externalCustomerId =
      customer?.externalCustomerId ||
      customer?.external_id ||
      null;

    let body;

    if (customerId) {
      body = {
        customer_id:
          customerId
      };
    } else if (
      externalCustomerId
    ) {
      body = {
        external_customer_id:
          externalCustomerId
      };
    } else {
      throw new Error(
        "Polar customer ID or external customer ID is required."
      );
    }

    const response =
      await this.request(
        "/v1/customer-sessions",
        {
          method: "POST",

          body
        }
      );

    return {
      provider: "polar",

      id:
        response?.id ||
        null,

      url:
        response?.customer_portal_url ||
        null,

      token:
        response?.token ||
        null,

      data:
        response || null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Webhook verification
   * |--------------------------------------------------------------------------
   */

  async verifyWebhook({
    request
  } = {}) {
    if (!this.webhookSecret) {
      throw new Error(
        "POLAR_WEBHOOK_SECRET is not configured."
      );
    }

    if (
      !Buffer.isBuffer(
        request?.body
      )
    ) {
      throw new Error(
        "Polar webhook requires the raw request body."
      );
    }

    const headers = {
      "webhook-id":
        request.headers[
          "webhook-id"
        ] || "",

      "webhook-timestamp":
        request.headers[
          "webhook-timestamp"
        ] || "",

      "webhook-signature":
        request.headers[
          "webhook-signature"
        ] || ""
    };

    return await webhooks.validateEvent(
      request.body,
      headers,
      this.webhookSecret
    );
  }

  /**
   * |--------------------------------------------------------------------------
   * | Normalize Webhook
   * |--------------------------------------------------------------------------
   */

  normalizeWebhookEvent(
    event
  ) {
    if (!event) {
      return null;
    }

    const eventType =
      event.type ||
      "";

    const eventId =
      event.id ||
      event.data?.id ||
      `polar_${Date.now()}`;

    const data =
      event.data ||
      {};

    let normalizedType =
      "UNKNOWN";

    switch (eventType) {
      case "subscription.created":
        normalizedType =
          "SUBSCRIPTION_CREATED";
        break;

      case "subscription.active":
        normalizedType =
          "SUBSCRIPTION_UPDATED";
        break;

      case "subscription.updated":
      case "subscription.uncanceled":
        normalizedType =
          "SUBSCRIPTION_UPDATED";
        break;

      case "subscription.canceled":
      case "subscription.revoked":
        normalizedType =
          "SUBSCRIPTION_CANCELED";
        break;

      case "subscription.past_due":
        normalizedType =
          "PAYMENT_FAILED";
        break;

      case "order.paid":
        normalizedType =
          "PAYMENT_SUCCEEDED";
        break;

      case "order.refunded":
      case "refund.created":
        normalizedType =
          "PAYMENT_REFUNDED";
        break;

      default:
        normalizedType =
          "UNKNOWN";
    }

    return {
      provider: "polar",

      providerEventId:
        String(eventId),

      eventType,

      normalizedType,

      createdAt:
        event.timestamp
          ? new Date(
              event.timestamp
            )
          : new Date(),

      data
    };
  }
}

module.exports =
  new PolarProvider();