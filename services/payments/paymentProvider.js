/*
|--------------------------------------------------------------------------
| PaymentProvider
|--------------------------------------------------------------------------
|
| هذا هو العقد الموحد لأي شركة دفع.
|
| لا نكتب Stripe هنا.
|
| أي شركة دفع نضيفها لاحقًا يجب أن توفر نفس العمليات.
|
|--------------------------------------------------------------------------
*/
 

class PaymentProvider {

  async createCustomer(user) {
    throw new Error(
      "createCustomer() must be implemented"
    );
  }

  async createCheckout({
    user,
    plan,
    billingCycle,
    customer
  }) {
    throw new Error(
      "createCheckout() must be implemented"
    );
  }

  async changeSubscription({
    subscription,
    newPlan,
    billingCycle
  }) {
    throw new Error(
      "changeSubscription() must be implemented"
    );
  }

  async cancelSubscription({
    subscription,
    immediately = false
  }) {
    throw new Error(
      "cancelSubscription() must be implemented"
    );
  }

  async reactivateSubscription({
    subscription
  }) {
    throw new Error(
      "reactivateSubscription() must be implemented"
    );
  }

  async createBillingPortal({
    customer
  }) {
    throw new Error(
      "createBillingPortal() must be implemented"
    );
  }

  async verifyWebhook({
    request
  }) {
    throw new Error(
      "verifyWebhook() must be implemented"
    );
  }

  normalizeWebhookEvent(event) {
    throw new Error(
      "normalizeWebhookEvent() must be implemented"
    );
  }
}

module.exports = PaymentProvider;