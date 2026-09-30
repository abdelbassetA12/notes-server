 
const PaymentProvider =
  require("./paymentProvider");

/**
 * |--------------------------------------------------------------------------
 * Internal Provider
 * |--------------------------------------------------------------------------
 *
 * Provider داخلي.
 *
 * يستخدم:
 *
 * - الخطط المجانية
 * - الاختبارات
 * - التطوير المحلي
 *
 * لا يتعامل مع شركة دفع خارجية.
 *
 * |--------------------------------------------------------------------------
 */

class InternalProvider extends PaymentProvider {

  /**
   * |--------------------------------------------------------------------------
   * Create Customer
   * |--------------------------------------------------------------------------
   */

  async createCustomer(user) {

    if (!user) {
      throw new Error(
        "User is required to create internal customer."
      );
    }

    const userId =
      user._id ||
      user.id;

    if (!userId) {
      throw new Error(
        "User ID is required to create internal customer."
      );
    }

    const customerId =
      `internal_customer_${userId}`;

    return {
      provider: "internal",
      id: customerId,
      providerCustomerId: customerId,
      email: user.email || null,
      name:
        user.fullName ||
        user.username ||
        null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * Create Checkout
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

    /**
     * الخطة المجانية لا تحتاج
     * إلى Checkout خارجي.
     */

    if (!plan.isFree) {
      throw new Error(
        "Paid plans require an external payment provider."
      );
    }

    const userId =
      user._id ||
      user.id;

    const customerId =
      `internal_customer_${userId}`;

    return {
      provider: "internal",

      checkoutId: null,

      id: null,

      checkoutUrl: null,

      url: null,

      customerId,

      providerCustomerId:
        customerId,

      subscriptionId: null,

      mode: "internal",

      status: "completed",

      paymentStatus: "paid",

      billingCycle,

      planId:
        plan._id ||
        plan.id ||
        null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * Change Subscription
   * |--------------------------------------------------------------------------
   *
   * Internal provider لا يدير
   * اشتراكات مدفوعة خارجية.
   *
   * الخطط المجانية يتم التعامل معها
   * محليًا بواسطة subscriptionService.
   *
   * |--------------------------------------------------------------------------
   */

  async changeSubscription() {

    throw new Error(
      "Internal provider does not support paid subscription changes."
    );
  }

  /**
   * |--------------------------------------------------------------------------
   * Cancel Subscription
   * |--------------------------------------------------------------------------
   */

  async cancelSubscription({
    subscription,
    immediately = false
  }) {

    if (!subscription) {
      throw new Error(
        "Subscription is required."
      );
    }

    const subscriptionId =
      subscription._id
        ? subscription._id.toString()
        : subscription.id
          ? String(subscription.id)
          : null;

    if (!subscriptionId) {
      throw new Error(
        "Subscription ID is required."
      );
    }

    return {
      provider: "internal",

      success: true,

      subscriptionId,

      immediately: Boolean(
        immediately
      )
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * Reactivate Subscription
   * |--------------------------------------------------------------------------
   */

  async reactivateSubscription({
    subscription
  }) {

    if (!subscription) {
      throw new Error(
        "Subscription is required."
      );
    }

    const subscriptionId =
      subscription._id
        ? subscription._id.toString()
        : subscription.id
          ? String(subscription.id)
          : null;

    if (!subscriptionId) {
      throw new Error(
        "Subscription ID is required."
      );
    }

    return {
      provider: "internal",

      success: true,

      subscriptionId
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * Billing Portal
   * |--------------------------------------------------------------------------
   *
   * لا يوجد Portal خارجي
   * للـ Internal Provider.
   *
   * |--------------------------------------------------------------------------
   */

  async createBillingPortal() {

    return {
      provider: "internal",

      id: null,

      url: null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * Verify Webhook
   * |--------------------------------------------------------------------------
   *
   * Internal provider لا يستقبل
   * Webhooks من شركة خارجية.
   *
   * نعيد Event داخلي بسيط فقط
   * للاختبارات المستقبلية.
   *
   * |--------------------------------------------------------------------------
   */

  async verifyWebhook({
    request
  } = {}) {

    return {
      provider: "internal",

      valid: true,

      event:
        request?.body || null
    };
  }

  /**
   * |--------------------------------------------------------------------------
   * Normalize Webhook Event
   * |--------------------------------------------------------------------------
   */

  normalizeWebhookEvent(event) {

    const providerEventId =
      event?.id ||
      event?.providerEventId ||
      `internal_${Date.now()}`;

    const eventType =
      event?.type ||
      event?.eventType ||
      "internal";

    const normalizedType =
      event?.normalizedType ||
      "UNKNOWN";

    const data =
      event?.data ||
      {};

    return {
      provider: "internal",

      providerEventId,

      eventType,

      normalizedType,

      createdAt:
        event?.createdAt ||
        new Date(),

      data
    };
  }
}

module.exports =
  InternalProvider;
 
