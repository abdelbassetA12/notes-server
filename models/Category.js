const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  color: {
    type: String,
    default: "#6366F1"
  },

  icon: {
    type: String,
    default: "folder"
  },

  isDefault: {
    type: Boolean,
    default: false
  }
},
{
  timestamps: true
}
);

module.exports = mongoose.model(
  "Category",
  categorySchema
);