 
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const subscriptionRoutes =
  require("./routes/subscriptions");

const subscriptionWebhooks =
  require("./routes/subscriptionWebhooks");

const app = express();

/**
 * |--------------------------------------------------------------------------
 * Security
 * |--------------------------------------------------------------------------
 */

app.use(cookieParser());

app.use(helmet());

/**
 * |--------------------------------------------------------------------------
 * CORS
 * |--------------------------------------------------------------------------
 */

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true
  })
);

/**
 * |--------------------------------------------------------------------------
 * General Rate Limit
 * |--------------------------------------------------------------------------
 */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use(limiter);

/**
 * |--------------------------------------------------------------------------
 * Subscription Webhooks
 * |--------------------------------------------------------------------------
 *
 * مهم جدًا:
 *
 * Stripe يحتاج Raw Body للتحقق من Webhook Signature.
 *
 * لذلك نستخدم express.raw() لهذا المسار
 * قبل express.json().
 *
 * |--------------------------------------------------------------------------
 */

app.use(
  "/api/subscription-webhooks",
  express.raw({
    type: "application/json",
    limit: "10mb"
  })
);

/**
 * |--------------------------------------------------------------------------
 * JSON Body
 * |--------------------------------------------------------------------------
 *
 * جميع Routes العادية تستخدم JSON.
 *
 * Webhook Route تم التعامل معه أعلاه
 * باستخدام express.raw().
 *
 * |--------------------------------------------------------------------------
 */

app.use(
  express.json({
    limit: "10mb"
  })
);

/**
 * |--------------------------------------------------------------------------
 * Authentication
 * |--------------------------------------------------------------------------
 */

app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10
  })
);

app.use(
  "/api/auth",
  require("./routes/auth")
);

app.use(
  "/api/profile",
  require("./routes/profile")
);

/**
 * |--------------------------------------------------------------------------
 * Tasks System
 * |--------------------------------------------------------------------------
 */

app.use(
  "/api/occurrences",
  require("./routes/occurrences")
);

app.use(
  "/api/dashboard",
  require("./routes/dashboard")
);

app.use(
  "/api/categories",
  require("./routes/categories")
);

app.use(
  "/api/tasks",
  require("./routes/tasks")
);

/**
 * |--------------------------------------------------------------------------
 * Subscriptions
 * |--------------------------------------------------------------------------
 */

app.use(
  "/api/subscriptions",
  subscriptionRoutes
);

/**
 * |--------------------------------------------------------------------------
 * Subscription Webhooks
 * |--------------------------------------------------------------------------
 */

app.use(
  "/api/subscription-webhooks",
  subscriptionWebhooks
);

/**
 * |--------------------------------------------------------------------------
 * Other Routes
 * |--------------------------------------------------------------------------
 */

app.use(
  "/api/job-leads",
  require("./routes/jobLeads")
);

app.use(
  "/api/email-templates",
  require("./routes/emailTemplates")
);

/**
 * |--------------------------------------------------------------------------
 * MongoDB
 * |--------------------------------------------------------------------------
 */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(
      "MongoDB Connected Successfully"
    );
  })
  .catch((err) => {
    console.error(
      "MongoDB Connection Error:",
      err
    );
  });

/**
 * |--------------------------------------------------------------------------
 * HTTP Server
 * |--------------------------------------------------------------------------
 */

const server =
  http.createServer(app);

const PORT =
  process.env.PORT || 5000;

/**
 * |--------------------------------------------------------------------------
 * Start Server
 * |--------------------------------------------------------------------------
 */

server.listen(
  PORT,
  () => {
    console.log(
      `🚀 Server running on port ${PORT}`
    );
  }
);
 
