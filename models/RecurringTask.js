const mongoose = require("mongoose");

const recurringTaskSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category"
  },

  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    default: ""
  },

  priority: {
    type: String,
    enum: [
      "low",
      "medium",
      "high"
    ],
    default: "medium"
  },

  frequencyType: {
    type: String,
    enum: [
      "daily",
      "weekly",
      "every_x_days",
      "specific_days",
      "monthly"
    ],
    required: true
  },

  everyXDays: {
    type: Number,
    default: null
  },

  weekDays: [
    {
      type: Number
    }
  ],

  monthDay: {
    type: Number,
    default: null
  },

  targetValue: {
    type: Number,
    default: 1
  },

  targetUnit: {
    type: String,
    enum: [
      "minutes",
      "hours",
      "pages",
      "times",
      "steps",
      "tasks",
      "custom"
    ],
    default: "times"
  },

  weeklyTarget: {
    type: Number,
    default: null
  },

  preferredTime: {
    type: String,
    default: ""
  },

  startDate: {
    type: Date,
    default: Date.now
  },

  active: {
    type: Boolean,
    default: true
  }
},
{
  timestamps: true
}
);

module.exports = mongoose.model(
  "RecurringTask",
  recurringTaskSchema
);