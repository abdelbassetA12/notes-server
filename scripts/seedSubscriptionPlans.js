require("dotenv").config();

const mongoose =
  require("mongoose");

const SubscriptionPlan =
  require(
    "../models/SubscriptionPlan"
  );


/*
|--------------------------------------------------------------------------
| الخطط الافتراضية
|--------------------------------------------------------------------------
|
| عدل الأسعار والمميزات قبل إطلاق المشروع.
|
|--------------------------------------------------------------------------
*/

const plans = [

  {
    name: "Free",

    slug: "free",

    description:
      "الخطة الأساسية المجانية.",

    isFree: true,

    pricing: {
      monthly: 0,
      yearly: 0,
      currency: "USD"
    },

    trialDays: 0,

    features: [
      {
        key: "basic_analytics",
        enabled: true
      },

      {
        key: "custom_theme",
        enabled: false
      },

      {
        key: "advanced_analytics",
        enabled: false
      },

      {
        key: "marketplace",
        enabled: true
      }
    ],

    limits: {
      products: 5,
      links: 10,
      storage: 100,
      teamMembers: 1
    },

    sortOrder: 1,

    active: true
  },


  {
    name: "Pro",

    slug: "pro",

    description:
      "خطة احترافية للمستخدمين الذين يحتاجون إلى إمكانيات أكبر.",

    isFree: false,

    pricing: {
      monthly: 9.99,
      yearly: 99,
      currency: "USD"
    },

    providerPrices: [
  {
    provider: "stripe",
    monthlyPriceId: "",
    yearlyPriceId: ""
  },
  {
  provider: "paddle",
  monthlyPriceId: "pri_01m3q9vh0rwwxjxw26v345hd1a",
  yearlyPriceId: "pri_01m3q9yt8k5yecr6czdbnyage3"
},
  {
    provider: "polar",
    monthlyPriceId: "",
    yearlyPriceId: ""
  },
  {
    provider: "lemonsqueezy",
    monthlyPriceId: "",
    yearlyPriceId: ""
  }
],

    

    trialDays: 7,

    features: [
      {
        key: "basic_analytics",
        enabled: true
      },

      {
        key: "custom_theme",
        enabled: true
      },

      {
        key: "advanced_analytics",
        enabled: true
      },

      {
        key: "marketplace",
        enabled: true
      }
    ],

    limits: {
      products: 100,
      links: -1,
      storage: 5000,
      teamMembers: 3
    },

    sortOrder: 2,

    active: true
  },


  {
    name: "Business",

    slug: "business",

    description:
      "خطة متقدمة للأعمال والمستخدمين المحترفين.",

    isFree: false,

    pricing: {
      monthly: 29.99,
      yearly: 299,
      currency: "USD"
    },

    providerPrices: [
  {
    provider: "stripe",
    monthlyPriceId: "",
    yearlyPriceId: ""
  },
  {
    provider: "paddle",
    monthlyPriceId: "",
    yearlyPriceId: ""
  },
  {
    provider: "polar",
    monthlyPriceId: "",
    yearlyPriceId: ""
  },
  {
    provider: "lemonsqueezy",
    monthlyPriceId: "",
    yearlyPriceId: ""
  }
],

   

    trialDays: 14,

    features: [
      {
        key: "basic_analytics",
        enabled: true
      },

      {
        key: "custom_theme",
        enabled: true
      },

      {
        key: "advanced_analytics",
        enabled: true
      },

      {
        key: "marketplace",
        enabled: true
      }
    ],

    limits: {
      products: -1,
      links: -1,
      storage: -1,
      teamMembers: 10
    },

    sortOrder: 3,

    active: true
  }

];


async function seed() {

  try {

    if (
      !process.env.MONGO_URI
    ) {

      throw new Error(
        "MONGO_URI is missing from .env"
      );
    }


    await mongoose.connect(
      process.env.MONGO_URI
    );


    console.log(
      "MongoDB connected."
    );


    /*
     * upsert:
     *
     * إذا كانت الخطة موجودة:
     * يتم تحديثها.
     *
     * إذا لم تكن موجودة:
     * يتم إنشاؤها.
     */

    for (
      const plan
      of plans
    ) {

      await SubscriptionPlan.findOneAndUpdate(

        {
          slug:
            plan.slug
        },

        plan,

        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }

      );


      console.log(
        `Plan "${plan.name}" ready.`
      );
    }


    console.log(
      "Subscription plans seeded successfully."
    );


    await mongoose.disconnect();

    process.exit(0);

  } catch (error) {

    console.error(
      "Seed error:",
      error
    );


    await mongoose.disconnect();

    process.exit(1);
  }
}


seed();