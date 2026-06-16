const mongoose = require("mongoose");

const taskOccurrenceSchema =
new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RecurringTask",
    required: true
  },

  date: {
    type: String,
    required: true
  },

  title: String,

  categoryName: String,
  categoryColor:String,
  categoryIcon:String,
  preferredTime:String,

  priority: String,

  targetValue: Number,

  targetUnit: String,

  progressValue: {
    type: Number,
    default: 0
  },

  completed: {
    type: Boolean,
    default: false
  },

  completedAt: Date
},
{
  timestamps: true
}
);

taskOccurrenceSchema.index(
{
  task: 1,
  date: 1
},
{
  unique: true
}
);

module.exports = mongoose.model(
  "TaskOccurrence",
  taskOccurrenceSchema
);