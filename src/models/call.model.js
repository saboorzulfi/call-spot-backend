const mongoose = require("mongoose");
const AutoIncrement = require("./autoIncrement.model");

const callSchema = new mongoose.Schema({
  doc_number: {
    type: Number
  },
  
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },

  call_origination_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  call_status: {
    call_state: {
      type: String,
      enum: ["scheduled", "in-progress", "answered", "un-answered", "missed", "missed by agent(s)"],
      default: "scheduled"
    },
    description: {
      type: String,
      default: "Call is scheduled"
    }
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

  start_time: {
    type: Date,
    default: Date.now
  },

  register_time: {
    type: Date,
    default: Date.now
  },

  site_url: {
    type: String,
    trim: true
  },

  // Lead data stored directly in call (like Go backend)
  lead_data: {
    type: Map,
    of: String,
    default: {}
  },

  // Agent details array (like Go backend)
  agents: [{
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent"
    },
    last_call_status: {
      type: String,
      enum: ["un-answered", "scheduled", "answered", "missed", "in-progress", "missed by agent(s)"],
      default: "scheduled"
    },

  }],


  call_details: {
    start_time: { type: Date },
    end_time: { type: Date },
    duration: { type: Number, default: 0 },
    recording_url: { type: String },
    transcript: { type: String }
  },

  recording_url: {
    type: String
  },

  campaign_name: {
    type: String,
    trim: true
  },

  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Campaign",
    required: true
  },

  // Sentiment analysis result (like Go backend)
  sentiment_analysis_result: {
    client_satisfaction: {
      type: String,
      enum: ["normal", "satisfied", "dissatisfied"],
      default: "normal"
    },
    operator_abusive_language: {
      type: String,
      enum: ["yes", "no"],
      default: "no"
    },
    client_abusive_language: {
      type: String,
      enum: ["yes", "no"],
      default: "no"
    },
    client_anger: {
      type: String,
      enum: ["yes", "no"],
      default: "no"
    },
    deal_success_chance: {
      type: String,
      default: "0"
    }
  },

  client_type: {
    type: String,
    default: "web"
  },

  previous_agents: [{
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent"
    },
    last_call_status: {
      type: String,
      enum: ["un-answered", "scheduled", "answered", "missed", "in-progress", "missed by agent(s)"],
      default: "scheduled"
    },
    agent: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Agent"
      },
      full_name: String,
      personal_phone: String,
      email: String
    }
  }],

  ringing_agent: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent"
    },
    last_call_status: {
      type: String,
      enum: ["un-answered", "scheduled", "answered", "missed", "in-progress", "missed by agent(s)"],
      default: "scheduled"
    }
  },

  conversational_id: {
    type: String,
    trim: true
  },

  re_trigger_time: [{
    type: Date
  }]

}, {
  timestamps: true
});

// Auto-increment doc_number
callSchema.pre("save", async function (next) {
  if (this.isNew) {
    this.created_at = new Date();
    this.updated_at = new Date();
    const nextSeq = await AutoIncrement.findOneAndUpdate(
      { name: "call_number" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.doc_number = nextSeq.seq;
  } else {
    this.updated_at = new Date();
  }
  next();
});

// Indexes for performance
callSchema.index({ account_id: 1 });
callSchema.index({ call_origination_id: 1 });
callSchema.index({ source_id: 1 });
callSchema.index({ source_type: 1 });
callSchema.index({ "call_status.call_state": 1 });
callSchema.index({ start_time: -1 });
callSchema.index({ created_at: -1 });

module.exports = mongoose.model("Call", callSchema);
