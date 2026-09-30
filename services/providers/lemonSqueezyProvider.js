const crypto = require("crypto");

const PaymentProvider =
  require("../payments/paymentProvider");

class LemonSqueezyProvider
  extends PaymentProvider {
  constructor() {
    super();

    this.apiKey =
      process.env.LEMONSQUEEZY_API_KEY ||
      "";

    this.webhookSecret =
      process.env.LEMONSQUEEZY_WEBHOOK_SECRET ||
      "";

    this.storeId =
      process.env.LEMONSQUEEZY_STORE_ID ||
      "";

    this.baseUrl =
      "https://api.lemonsqueezy.com/v1";
  }

  ensureConfigured() {
    if (!this.apiKey) {
      throw new Error(
        "LEMONSQUEEZY_API_KEY is not configured."
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
              `Bearer ${this.apiKey}`,

            Accept:
              "application/vnd.api+json",

            "Content-Type":
              "application/vnd.api+json"
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
      const errorDetail =
        data?.errors?.[0]?.detail ||
        data?.errors?.[0]?.title ||
        data?.error ||
        `Lemon Squeezy API request failed with status ${response.status}.`;

      throw new Error(
        errorDetail
      );
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
   * Lemon Squeezy uses Variant IDs.
   *
   * We store the corresponding Variant ID
   * inside monthlyPriceId / yearlyPriceId
   * to keep our generic schema unchanged.
   */

  getVariantId(
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
            ).toLowerCase() ===
            "lemonsqueezy"
        );

      if (providerPrice) {
        const variantId =
          cycle === "yearly"
            ? providerPrice.yearlyPriceId
            : providerPrice.monthlyPriceId;

        if (variantId) {
          return variantId;
        }
      }
    }

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
            ).toLowerCase() ===
            "lemon_squeezy"
        );

      if (providerPrice) {
        const variantId =
          cycle === "yearly"
            ? providerPrice.yearlyPriceId
            : providerPrice.monthlyPriceId;

        if (variantId) {
          return variantId;
        }
      }
    }

    if (
      plan.lemonSqueezyVariantIds
    ) {
      return (
        cycle === "yearly"
          ? plan.lemonSqueezyVariantIds.yearly
          : plan.lemonSqueezyVariantIds.monthly
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
   *
   * Lemon Squeezy checkout does not require
   * a local customer ID.
   *
   * The user's identity is carried through
   * checkout_data.custom.
   */

  async createCustomer(user) {
    if (!user) {
      throw new Error(
        "User is required."
      );
    }

    const userId =
      this.getUserId(user);

    const customerId =
      `lemonsqueezy_customer_${userId}`;

    return {
      provider:
        "lemonsqueezy",

      id:
        customerId,

      providerCustomerId:
        customerId,

      externalCustomerId:
        String(userId),

      email:
        user.email ||
        null,

      name:
        this.getUserName(user)
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
    billingCycle
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
        "Free plans do not require Lemon Squeezy Checkout."
      );
    }

    if (
      !["monthly", "yearly"].includes(
        billingCycle
      )
    ) {
      throw new Error(
        "Lemon Squeezy supports monthly or yearly billing for paid plans."
      );
    }

    if (!this.storeId) {
      throw new Error(
        "LEMONSQUEEZY_STORE_ID is not configured."
      );
    }

    const variantId =
      this.getVariantId(
        plan,
        billingCycle
      );

    if (!variantId) {
      throw new Error(
        `No Lemon Squeezy variant ID configured for plan "${plan.name}" (${billingCycle}).`
      );
    }

    const userId =
      this.getUserId(user);

    const frontendUrl =
      this.getFrontendUrl();

    const response =
      await this.request(
        "/checkouts",
        {
          method: "POST",

          body: {
            data: {
              type:
                "checkouts",

              attributes: {
                checkout_data: {
                  email:
                    user.email ||
                    undefined,

                  name:
                    this.getUserName(
                      user
                    ) ||
                    undefined,

                  custom: {
                    qevoraUserId:
                      String(
                        userId
                      ),

                    planId:
                      String(
                        plan._id ||
                        plan.id
                      ),

                    planSlug:
                      plan.slug ||
                      "",

                    billingCycle,

                    provider:
                      "lemonsqueezy"
                  }
                },

                product_options: {
                  redirect_url:
                    `${frontendUrl}/subscription/success?provider=lemonsqueezy`
                },

                checkout_options: {
                  embed: false
                }
              },

              relationships: {
                store: {
                  data: {
                    type:
                      "stores",

                    id:
                      String(
                        this.storeId
                      )
                  }
                },

                variant: {
                  data: {
                    type:
                      "variants",

                    id:
                      String(
                        variantId
                      )
                  }
                }
              }
            }
          }
        }
      );

    const checkout =
      response?.data;

    const checkoutUrl =
      checkout?.attributes
        ?.urls?.checkout ||
      checkout?.attributes
        ?.checkout_url ||
      checkout?.links?.self ||
      null;

    if (!checkoutUrl) {
      throw new Error(
        "Lemon Squeezy did not return a checkout URL."
      );
    }

    return {
      provider:
        "lemonsqueezy",

      checkoutId:
        checkout?.id ||
        null,

      id:
        checkout?.id ||
        null,

      checkoutUrl,

      url:
        checkoutUrl,

      customerId:
        null,

      providerCustomerId:
        null,

      subscriptionId:
        null,

      mode:
        "subscription",

      status:
        checkout?.attributes
          ?.status ||
        "created",

      paymentStatus:
        "pending",

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
        "Lemon Squeezy subscription ID is required."
      );
    }

    const variantId =
      this.getVariantId(
        newPlan,
        billingCycle
      );

    if (!variantId) {
      throw new Error(
        `No Lemon Squeezy variant ID configured for plan "${newPlan.name}" (${billingCycle}).`
      );
    }

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            data: {
              type:
                "subscriptions",

              id:
                String(
                  subscriptionId
                ),

              attributes: {
                variant_id:
                  Number(
                    variantId
                  )
              }
            }
          }
        }
      );

    return {
      provider:
        "lemonsqueezy",

      success: true,

      subscriptionId,

      billingCycle,

      data:
        response?.data ||
        null
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
        "Lemon Squeezy subscription ID is required."
      );
    }

    if (immediately) {
      /**
       * Lemon Squeezy's DELETE cancellation
       * ends future payment collection.
       */

      const response =
        await this.request(
          `/subscriptions/${subscriptionId}`,
          {
            method: "DELETE"
          }
        );

      return {
        provider:
          "lemonsqueezy",

        success: true,

        subscriptionId,

        immediately: true,

        data:
          response?.data ||
          null
      };
    }

    /**
     * Regular cancellation keeps the
     * subscription in its grace period
     * until ends_at.
     */

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            data: {
              type:
                "subscriptions",

              id:
                String(
                  subscriptionId
                ),

              attributes: {
                cancelled:
                  true
              }
            }
          }
        }
      );

    return {
      provider:
        "lemonsqueezy",

      success: true,

      subscriptionId,

      immediately: false,

      data:
        response?.data ||
        null
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
        "Lemon Squeezy subscription ID is required."
      );
    }

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            data: {
              type:
                "subscriptions",

              id:
                String(
                  subscriptionId
                ),

              attributes: {
                cancelled:
                  false
              }
            }
          }
        }
      );

    return {
      provider:
        "lemonsqueezy",

      success: true,

      subscriptionId,

      data:
        response?.data ||
        null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Customer portal
   * |--------------------------------------------------------------------------
   */

  async createBillingPortal({
    customer,
    subscription
  }) {
    const subscriptionId =
      this.getSubscriptionId(
        subscription
      );

    if (!subscriptionId) {
      throw new Error(
        "Lemon Squeezy subscription ID is required."
      );
    }

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}`
      );

    const attributes =
      response?.data
        ?.attributes || {};

    const portalUrl =
      attributes
        ?.urls
        ?.customer_portal_update_subscription ||
      attributes
        ?.urls
        ?.customer_portal ||
      null;

    return {
      provider:
        "lemonsqueezy",

      id:
        response?.data?.id ||
        null,

      url:
        portalUrl,

      data:
        response?.data ||
        null
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
        "LEMONSQUEEZY_WEBHOOK_SECRET is not configured."
      );
    }

    const signature =
      request?.headers?.[
        "x-signature"
      ];

    if (!signature) {
      throw new Error(
        "Lemon Squeezy X-Signature header is missing."
      );
    }

    const rawBody =
      Buffer.isBuffer(
        request?.body
      )
        ? request.body.toString(
            "utf8"
          )
        : typeof request?.body ===
            "string"
          ? request.body
          : JSON.stringify(
              request?.body || {}
            );

    const expected =
      crypto
        .createHmac(
          "sha256",
          this.webhookSecret
        )
        .update(
          rawBody,
          "utf8"
        )
        .digest("hex");

    if (
      signature.length !==
      expected.length
    ) {
      throw new Error(
        "Invalid Lemon Squeezy webhook signature."
      );
    }

    const valid =
      crypto.timingSafeEqual(
        Buffer.from(
          signature,
          "utf8"
        ),
        Buffer.from(
          expected,
          "utf8"
        )
      );

    if (!valid) {
      throw new Error(
        "Invalid Lemon Squeezy webhook signature."
      );
    }

    try {
      return JSON.parse(
        rawBody
      );
    } catch {
      throw new Error(
        "Invalid Lemon Squeezy webhook JSON."
      );
    }
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
      event?.meta?.event_name ||
      event?.event_name ||
      "";

    const eventId =
      event?.meta?.webhook_id ||
      event?.meta?.event_id ||
      event?.data?.id ||
      `lemonsqueezy_${Date.now()}`;

    const data =
      event?.data ||
      {};

    let normalizedType =
      "UNKNOWN";

    switch (eventType) {
      case "subscription_created":
        normalizedType =
          "SUBSCRIPTION_CREATED";
        break;

      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_unpaused":
        normalizedType =
          "SUBSCRIPTION_UPDATED";
        break;

      case "subscription_cancelled":
        normalizedType =
          "SUBSCRIPTION_CANCELED";
        break;

      case "subscription_expired":
        normalizedType =
          "SUBSCRIPTION_CANCELED";
        break;

      case "subscription_payment_success":
      case "subscription_payment_recovered":
        normalizedType =
          "PAYMENT_SUCCEEDED";
        break;

      case "subscription_payment_failed":
        normalizedType =
          "PAYMENT_FAILED";
        break;

      case "order_refunded":
        normalizedType =
          "PAYMENT_REFUNDED";
        break;

      default:
        normalizedType =
          "UNKNOWN";
    }

    return {
      provider:
        "lemonsqueezy",

      providerEventId:
        String(eventId),

      eventType,

      normalizedType,

      createdAt:
        event?.meta?.created_at
          ? new Date(
              event.meta.created_at
            )
          : new Date(),

      data
    };
  }
}

module.exports =
  new LemonSqueezyProvider();