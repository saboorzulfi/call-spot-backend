const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema({
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  phone: {
    type: String,
    required: true,
    trim: true
  },

  source_type: {
    type: String,
    enum: ["website", "facebook", "tiktok", "google", "import"],
    default: "website"
  },

  source_id: {
    type: String,
    required: true,
    trim: true
  },

  site_url: {
    type: String,
    trim: true
  },

  data_fields: {
    type: Map,
    of: String,
    default: {}
  },

  last_call_status: {
    agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent"
    },
    call_status: {
      type: String,
      enum: ["un-answered", "scheduled", "answered", "missed", "in-progress", "missed by agent(s)"],
      default: "scheduled"
    },
    call_time: {
      type: Date
    },
    call_duration: {
      type: Number,
      default: 0
    }
  },

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save middleware to normalize phone numbers
leadSchema.pre("save", function (next) {
  if (this.phone) {
    this.phone = this.phone.replace(/[\s\-\(\)]/g, "");
  }
  next();
});

// Indexes for performance
leadSchema.index({ account_id: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ source_type: 1 });
leadSchema.index({ source_id: 1 });
leadSchema.index({ created_at: -1 });

// Compound unique index on account_id and phone (like Go backend)
leadSchema.index({ account_id: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model("Lead", leadSchema);

