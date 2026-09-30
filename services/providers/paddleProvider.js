const crypto = require("crypto");

const PaymentProvider =
  require("../payments/paymentProvider");

class PaddleProvider extends PaymentProvider {
  constructor() {
    super();

    this.apiKey =
      process.env.PADDLE_API_KEY || "";

    this.webhookSecret =
      process.env.PADDLE_WEBHOOK_SECRET || "";

    this.environment =
      (
        process.env.PADDLE_ENVIRONMENT ||
        "sandbox"
      ).toLowerCase();

    this.baseUrl =
      this.environment === "production"
        ? "https://api.paddle.com"
        : "https://sandbox-api.paddle.com";
  }

  /**
   * |--------------------------------------------------------------------------
   * | Internal helpers
   * |--------------------------------------------------------------------------
   */

  ensureConfigured() {
    if (!this.apiKey) {
      throw new Error(
        "PADDLE_API_KEY is not configured."
      );
    }
  }

  async request(
    path,
    {
      method = "GET",
      body = undefined
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
        data?.error?.detail ||
        data?.error?.message ||
        data?.errors?.[0]?.detail ||
        data?.errors?.[0]?.message ||
        `Paddle API request failed with status ${response.status}.`;

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

  getStripeLikePriceId(
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

    /**
     * Preferred structure:
     *
     * providerPrices: [
     *   {
     *     provider: "paddle",
     *     monthlyPriceId: "...",
     *     yearlyPriceId: "..."
     *   }
     * ]
     */

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
            ).toLowerCase() === "paddle"
        );

      if (providerPrice) {
        const priceId =
          cycle === "yearly"
            ? providerPrice.yearlyPriceId
            : providerPrice.monthlyPriceId;

        if (priceId) {
          return priceId;
        }
      }
    }

    /**
     * Optional legacy structure.
     */

    if (plan.paddlePriceIds) {
      return (
        cycle === "yearly"
          ? plan.paddlePriceIds.yearly
          : plan.paddlePriceIds.monthly
      ) || null;
    }

    if (plan.paddlePrices) {
      return (
        cycle === "yearly"
          ? plan.paddlePrices.yearly
          : plan.paddlePrices.monthly
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
  const email = String(user?.email || "").trim();

  if (!email) {
    throw new Error(
      "User email is required to create a Paddle customer."
    );
  }

  const headers = {
    Authorization: `Bearer ${this.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Paddle-Version": "1"
  };

  // --------------------------------------------------
  // 1. ابحث عن Customer موجود بنفس البريد
  //    نبحث في active + archived
  // --------------------------------------------------

  const searchUrl =
    `${this.baseUrl}/customers` +
    `?email=${encodeURIComponent(email)}` +
    `&status=active,archived`;

  const searchResponse = await fetch(searchUrl, {
    method: "GET",
    headers
  });

  const searchText = await searchResponse.text();

  let searchData = {};

  try {
    searchData = searchText
      ? JSON.parse(searchText)
      : {};
  } catch {
    searchData = {};
  }

  if (!searchResponse.ok) {
    throw new Error(
      searchData?.error?.detail ||
      searchData?.error?.message ||
      "Failed to search Paddle customer."
    );
  }

  const customers = Array.isArray(searchData?.data)
    ? searchData.data
    : [];

  const existingCustomer = customers.find(
    (customer) =>
      String(customer?.email || "")
        .trim()
        .toLowerCase() === email.toLowerCase()
  );

  // --------------------------------------------------
  // 2. Customer موجود بالفعل
  // --------------------------------------------------

  if (existingCustomer?.id) {
    // إذا كان archived نحاول إعادته إلى active
    if (existingCustomer.status === "archived") {
      const restoreResponse = await fetch(
        `${this.baseUrl}/customers/${existingCustomer.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: "active"
          })
        }
      );

      const restoreText =
        await restoreResponse.text();

      let restoreData = {};

      try {
        restoreData = restoreText
          ? JSON.parse(restoreText)
          : {};
      } catch {
        restoreData = {};
      }

      if (!restoreResponse.ok) {
        throw new Error(
          restoreData?.error?.detail ||
          restoreData?.error?.message ||
          "Failed to reactivate Paddle customer."
        );
      }

      const restoredCustomer =
        restoreData?.data;

      return {
        provider: "paddle",
        id:
          restoredCustomer?.id ||
          existingCustomer.id,
        providerCustomerId:
          restoredCustomer?.id ||
          existingCustomer.id,
        email:
          restoredCustomer?.email ||
          existingCustomer.email,
        name:
          restoredCustomer?.name ||
          existingCustomer.name ||
          null
      };
    }

    return {
      provider: "paddle",
      id: existingCustomer.id,
      providerCustomerId: existingCustomer.id,
      email: existingCustomer.email,
      name: existingCustomer.name || null
    };
  }

  // --------------------------------------------------
  // 3. لا يوجد Customer -> أنشئ واحداً
  // --------------------------------------------------

  const createResponse = await fetch(
    `${this.baseUrl}/customers`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        name: this.getUserName(user),
        custom_data: {
          qevoraUserId: String(
            this.getUserId(user)
          )
        }
      })
    }
  );

  const createText =
    await createResponse.text();

  let createData = {};

  try {
    createData = createText
      ? JSON.parse(createText)
      : {};
  } catch {
    createData = {};
  }

  // --------------------------------------------------
  // 4. حماية إضافية:
  //    لو حدث Race Condition وكان Customer
  //    قد أنشئ بين البحث والإنشاء
  // --------------------------------------------------

  if (!createResponse.ok) {
    const errorCode =
      createData?.error?.code || "";

    const errorDetail =
      createData?.error?.detail || "";

    const conflictIdMatch =
      errorDetail.match(
        /ctm_[a-z0-9]+/i
      );

    if (
      createResponse.status === 409 ||
      errorCode === "customer_already_exists"
    ) {
      const conflictingCustomerId =
        conflictIdMatch?.[0];

      if (conflictingCustomerId) {
        const existingResponse =
          await fetch(
            `${this.baseUrl}/customers/${conflictingCustomerId}`,
            {
              method: "GET",
              headers
            }
          );

        const existingText =
          await existingResponse.text();

        let existingData = {};

        try {
          existingData = existingText
            ? JSON.parse(existingText)
            : {};
        } catch {
          existingData = {};
        }

        if (
          existingResponse.ok &&
          existingData?.data?.id
        ) {
          return {
            provider: "paddle",
            id: existingData.data.id,
            providerCustomerId:
              existingData.data.id,
            email:
              existingData.data.email ||
              email,
            name:
              existingData.data.name ||
              null
          };
        }
      }
    }

    throw new Error(
      errorDetail ||
      createData?.error?.message ||
      "Failed to create Paddle customer."
    );
  }

  const customer =
    createData?.data;

  if (!customer?.id) {
    throw new Error(
      "Paddle did not return a customer ID."
    );
  }

  return {
    provider: "paddle",
    id: customer.id,
    providerCustomerId: customer.id,
    email: customer.email,
    name: customer.name || null
  };
}
 

 
 

/*
  async createCustomer(user) {
    if (!user) {
      throw new Error(
        "User is required to create a Paddle customer."
      );
    }

    const email =
      user.email;

    if (!email) {
      throw new Error(
        "User email is required to create a Paddle customer."
      );
    }

    const response =
      await this.request(
        "/customers",
        {
          method: "POST",

          body: {
            email,

            name:
              this.getUserName(user),

            custom_data: {
              qevoraUserId:
                String(
                  this.getUserId(user)
                )
            }
          }
        }
      );

    const customer =
      response?.data;

    if (!customer?.id) {
      throw new Error(
        "Paddle customer was not created."
      );
    }

    return {
      provider: "paddle",

      id:
        customer.id,

      providerCustomerId:
        customer.id,

      email:
        customer.email,

      name:
        customer.name || null
    };
  }*/

  /**
   * |--------------------------------------------------------------------------
   * | Checkout
   * |--------------------------------------------------------------------------
   */
async createCheckout({ user, plan, billingCycle, customer }) {
  if (!user) {
    throw new Error("User is required.");
  }

  if (!plan) {
    throw new Error("Subscription plan is required.");
  }

  if (plan.isFree) {
    throw new Error("Free plans do not require Paddle Checkout.");
  }

  if (!["monthly", "yearly"].includes(billingCycle)) {
    throw new Error(
      "Paddle supports monthly or yearly billing for paid plans."
    );
  }

  const customerId = this.getCustomerId(customer);

  if (!customerId) {
    throw new Error("Paddle customer ID is required.");
  }

  const priceId = this.getStripeLikePriceId(
    plan,
    billingCycle
  );

  if (!priceId) {
    throw new Error(
      `No Paddle price ID configured for plan "${plan.name}" (${billingCycle}).`
    );
  }

  const userId = this.getUserId(user);

  const frontendUrl = this.getFrontendUrl();

  const response = await this.request("/transactions", {
    method: "POST",

    body: {
      items: [
        {
          price_id: priceId,
          quantity: 1
        }
      ],

      customer_id: customerId,

      collection_mode: "automatic",

      custom_data: {
        qevoraUserId: String(userId),
        planId: String(plan._id || plan.id),
        planSlug: plan.slug || "",
        billingCycle,
        provider: "paddle"
      },

      checkout: {
        url: `${frontendUrl}/subscription/success`
      }
    }
  });

  const transaction = response?.data;

  if (!transaction) {
    throw new Error(
      "Paddle did not return a transaction."
    );
  }

  /*
   * Paddle Hosted Checkout URL
   */
  const checkoutUrl =
    transaction?.checkout?.url ||
    null;

  if (!checkoutUrl) {
    console.error(
      "PADDLE TRANSACTION:",
      JSON.stringify(transaction, null, 2)
    );

    throw new Error(
      "Paddle did not return a checkout URL."
    );
  }

  console.log(
    "PADDLE CHECKOUT URL:",
    checkoutUrl
  );

  return {
    provider: "paddle",

    checkoutId:
      transaction.id || null,

    id:
      transaction.id || null,

    transactionId:
      transaction.id || null,

    checkoutUrl,

    url: checkoutUrl,

    customerId,

    providerCustomerId:
      customerId,

    subscriptionId:
      transaction.subscription_id || null,

    mode: "subscription",

    status:
      transaction.status || "ready",

    paymentStatus:
      transaction.status === "completed"
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
        "Paddle subscription ID is required."
      );
    }

    if (
      !["monthly", "yearly"].includes(
        billingCycle
      )
    ) {
      throw new Error(
        "Paddle supports monthly or yearly billing for paid plans."
      );
    }

    const newPriceId =
      this.getStripeLikePriceId(
        newPlan,
        billingCycle
      );

    if (!newPriceId) {
      throw new Error(
        `No Paddle price ID configured for plan "${newPlan.name}" (${billingCycle}).`
      );
    }

    /**
     * We first retrieve the Paddle
     * subscription because Paddle
     * requires the complete recurring
     * item list when updating items.
     */

    const current =
      await this.request(
        `/subscriptions/${subscriptionId}`
      );

    const paddleSubscription =
      current?.data;

    const currentItems =
      Array.isArray(
        paddleSubscription?.items
      )
        ? paddleSubscription.items
        : [];

    if (!currentItems.length) {
      throw new Error(
        "Paddle subscription has no recurring items."
      );
    }

    const items =
      currentItems.map(
        (item, index) => {
          if (index === 0) {
            return {
              price_id:
                newPriceId,

              quantity:
                item.quantity || 1
            };
          }

          return {
            price_id:
              item.price?.id ||
              item.price_id,

            quantity:
              item.quantity || 1
          };
        }
      );

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            items,

            proration_billing_mode:
              "prorated_immediately"
          }
        }
      );

    return {
      provider: "paddle",

      success: true,

      subscriptionId,

      billingCycle,

      data:
        response?.data || null
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
        "Paddle subscription ID is required."
      );
    }

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}/cancel`,
        {
          method: "POST",

          body: {
            effective_from:
              immediately
                ? "immediately"
                : "next_billing_period"
          }
        }
      );

    return {
      provider: "paddle",

      success: true,

      subscriptionId,

      immediately:
        Boolean(immediately),

      data:
        response?.data || null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * | Reactivate
   * |--------------------------------------------------------------------------
   *
   * Paddle cannot reinstate a subscription
   * after it has actually become canceled.
   *
   * But if cancellation was only scheduled
   * for the end of the billing period, we can
   * remove that scheduled change.
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
        "Paddle subscription ID is required."
      );
    }

    const current =
      await this.request(
        `/subscriptions/${subscriptionId}`
      );

    const paddleSubscription =
      current?.data;

    if (
      paddleSubscription?.status ===
      "canceled"
    ) {
      throw new Error(
        "A canceled Paddle subscription cannot be reinstated. A new subscription must be created."
      );
    }

    if (
      !paddleSubscription?.scheduled_change
    ) {
      return {
        provider: "paddle",

        success: true,

        subscriptionId,

        data:
          paddleSubscription
      };
    }

    const response =
      await this.request(
        `/subscriptions/${subscriptionId}`,
        {
          method: "PATCH",

          body: {
            scheduled_change:
              null
          }
        }
      );

    return {
      provider: "paddle",

      success: true,

      subscriptionId,

      data:
        response?.data || null
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
    const customerId =
      this.getCustomerId(customer);

    if (!customerId) {
      throw new Error(
        "Paddle customer ID is required."
      );
    }

    const subscriptionId =
      this.getSubscriptionId(
        subscription
      );

    const body = {};

    if (subscriptionId) {
      body.subscription_ids = [
        subscriptionId
      ];
    }

    const response =
      await this.request(
        `/customers/${customerId}/portal-sessions`,
        {
          method: "POST",
          body
        }
      );

    const data =
      response?.data || {};

    /**
     * Paddle returns authenticated
     * customer portal URLs.
     */

    const urls =
      data?.urls ||
      data?.customer_portal_urls ||
      {};

    const url =
      urls?.general?.overview ||
      urls?.overview ||
      data?.url ||
      null;

    return {
      provider: "paddle",

      id:
        data?.id || null,

      url,

      data
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
        "PADDLE_WEBHOOK_SECRET is not configured."
      );
    }

    const signature =
      request?.headers?.[
        "paddle-signature"
      ] ||
      request?.headers?.[
        "Paddle-Signature"
      ];

    if (!signature) {
      throw new Error(
        "Paddle-Signature header is missing."
      );
    }

    const rawBody =
      Buffer.isBuffer(
        request?.body
      )
        ? request.body.toString("utf8")
        : typeof request?.body ===
            "string"
          ? request.body
          : JSON.stringify(
              request?.body || {}
            );

    const parts =
      String(signature)
        .split(";")
        .map((part) =>
          part.trim()
        );

    let timestamp = null;
    const signatures = [];

    for (const part of parts) {
      const separator =
        part.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const key =
        part.slice(
          0,
          separator
        );

      const value =
        part.slice(
          separator + 1
        );

      if (key === "ts") {
        timestamp = value;
      }

      if (key === "h1") {
        signatures.push(value);
      }
    }

    if (
      !timestamp ||
      !signatures.length
    ) {
      throw new Error(
        "Invalid Paddle-Signature header."
      );
    }

    const timestampNumber =
      Number(timestamp);

    if (
      !Number.isFinite(
        timestampNumber
      )
    ) {
      throw new Error(
        "Invalid Paddle webhook timestamp."
      );
    }

    /**
     * Paddle recommends a five-second
     * timestamp tolerance for replay
     * protection.
     */

    const age =
      Math.abs(
        Date.now() / 1000 -
          timestampNumber
      );

    if (age > 5) {
      throw new Error(
        "Paddle webhook timestamp is outside the allowed tolerance."
      );
    }

    const signedPayload =
      `${timestamp}:${rawBody}`;

    const expected =
      crypto
        .createHmac(
          "sha256",
          this.webhookSecret
        )
        .update(
          signedPayload,
          "utf8"
        )
        .digest("hex");

    const isValid =
      signatures.some(
        (received) => {
          if (
            received.length !==
            expected.length
          ) {
            return false;
          }

          return crypto.timingSafeEqual(
            Buffer.from(
              received,
              "utf8"
            ),
            Buffer.from(
              expected,
              "utf8"
            )
          );
        }
      );

    if (!isValid) {
      throw new Error(
        "Invalid Paddle webhook signature."
      );
    }

    let event;

    try {
      event =
        JSON.parse(
          rawBody
        );
    } catch {
      throw new Error(
        "Invalid Paddle webhook JSON."
      );
    }

    return event;
  }

  /**
   * |--------------------------------------------------------------------------
   * | Normalize webhook
   * |--------------------------------------------------------------------------
   */

  normalizeWebhookEvent(
    event
  ) {
    if (!event) {
      return null;
    }

    const eventType =
      event.event_type ||
      event.type ||
      "";

    const eventId =
      event.event_id ||
      event.id ||
      event.notification_id ||
      `paddle_${Date.now()}`;

    const data =
      event.data ||
      {};

    let normalizedType =
      "UNKNOWN";

    switch (eventType) {
      case "transaction.paid":
      case "transaction.completed":
        normalizedType =
          "PAYMENT_SUCCEEDED";
        break;

      case "transaction.payment_failed":
      case "transaction.past_due":
        normalizedType =
          "PAYMENT_FAILED";
        break;

      case "subscription.created":
        normalizedType =
          "SUBSCRIPTION_CREATED";
        break;

      case "subscription.activated":
      case "subscription.trialing":
      case "subscription.updated":
      case "subscription.resumed":
        normalizedType =
          "SUBSCRIPTION_UPDATED";
        break;

      case "subscription.canceled":
        normalizedType =
          "SUBSCRIPTION_CANCELED";
        break;

      default:
        normalizedType =
          "UNKNOWN";
    }

    return {
      provider: "paddle",

      providerEventId:
        String(eventId),

      eventType,

      normalizedType,

      createdAt:
        event.occurred_at
          ? new Date(
              event.occurred_at
            )
          : new Date(),

      data
    };
  }
}

module.exports =
  new PaddleProvider();