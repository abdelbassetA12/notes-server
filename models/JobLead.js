const mongoose = require("mongoose");

const jobLeadSchema = new mongoose.Schema({

  // =====================================
  // OWNER
  // =====================================

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // =====================================
  // COMPANY INFORMATION
  // =====================================

  companyName: {
    type: String,
    required: true,
    trim: true
  },

  type: {
    type: String,
    enum: [
      "hotel",
      "restaurant"
    ],
    required: true
  },

  country: {
    type: String,
    required: true,
    trim: true
  },

  city: {
    type: String,
    required: true,
    trim: true
  },

  website: {
    type: String,
    trim: true
  },

  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  phone: {
    type: String,
    trim: true
  },

  // =====================================
  // CONTACT PERSON
  // =====================================

  contactPerson: {
    type: String,
    trim: true
  },

  position: {
    type: String,
    trim: true
  },

  // =====================================
  // JOB INFORMATION
  // =====================================

  desiredJob: {
    type: String,
    trim: true
  },

  contractType: {
    type: String,
    enum: [
      "full_time",
      "part_time",
      "seasonal",
      "internship",
      "any"
    ],
    default: "any"
  },

  languageRequired: [String],

  // =====================================
  // APPLICATION TRACKING
  // =====================================

  status: {
    type: String,
    enum: [
      "not_contacted",
      "email_sent",
      "waiting_reply",
      "follow_up",
      "interview",
      "accepted",
      "rejected"
    ],
    default: "not_contacted"
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

  emailSentDate: Date,

  lastFollowUpDate: Date,

  interviewDate: Date,

  // =====================================
  // NOTES
  // =====================================

  notes: {
    type: String,
    trim: true
  },

  // =====================================
  // FILES
  // =====================================

  cvSent: {
    type: Boolean,
    default: false
  },

  coverLetterSent: {
    type: Boolean,
    default: false
  },

  attachments: [
    {
      name: String,
      url: String
    }
  ],

  // =====================================
  // LINKS
  // =====================================

  linkedin: String,

  careersPage: String,

  // =====================================
  // FAVORITE
  // =====================================

  favorite: {
    type: Boolean,
    default: false
  },

  archived: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// =====================================
// INDEXES
// =====================================

jobLeadSchema.index({
  companyName: "text",
  city: "text",
  country: "text",
  email: "text"
});

jobLeadSchema.index({
  user: 1
});

jobLeadSchema.index({
  status: 1
});

jobLeadSchema.index({
  type: 1
});

module.exports = mongoose.model(
  "JobLead",
  jobLeadSchema
);