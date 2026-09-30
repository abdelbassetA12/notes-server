const InternalProvider =
  require("./internalProvider");

const StripeProvider =
  require("../providers/stripeProvider");

const PaddleProvider =
  require("../providers/paddleProvider");

const PolarProvider =
  require("../providers/polarProvider");

const LemonSqueezyProvider =
  require(
    "../providers/lemonSqueezyProvider"
  );

const providers = {
  internal:
    new InternalProvider(),

  stripe:
    StripeProvider,

  paddle:
    PaddleProvider,

  polar:
    PolarProvider,

  lemonsqueezy:
    LemonSqueezyProvider
};

function getProvider(
  providerName
) {
  const name =
    providerName ||
    process.env.PAYMENT_PROVIDER ||
    "internal";

  const provider =
    providers[name];

  if (!provider) {
    throw new Error(
      `Payment provider "${name}" is not configured.`
    );
  }

  return provider;
}

function registerProvider(
  name,
  provider
) {
  if (!name) {
    throw new Error(
      "Provider name is required."
    );
  }

  if (!provider) {
    throw new Error(
      "Provider instance is required."
    );
  }

  providers[name] =
    provider;
}

module.exports = {
  getProvider,
  registerProvider
};