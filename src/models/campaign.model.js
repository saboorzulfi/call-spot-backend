const mongoose = require("mongoose");
const AutoIncrement = require("./autoIncrement.model");

const campaignSchema = new mongoose.Schema({
  doc_number: {
    type: Number
  },
  
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
  site_url: {
    type: String,
    trim: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  company_name: {
    type: String,
    trim: true
  },

  call_stats: {
    total: { type: Number, default: 0 },
    answered: { type: Number, default: 0 },
    no_answer: { type: Number, default: 0 },
    missed: { type: Number, default: 0 }
  },

  custom_data: {
    unit_type: { type: String },
    developer_id: { type: String },
    project_id: { type: String },
    lead_source: { type: String },
    campaign_id: { type: String },
    email_lead_data: { type: Boolean, default: false },
    whatsapp_lead_data: { type: Boolean, default: false },
    email_lead_data_admin: {
      enabled: { type: Boolean, default: false },
      emails: { type: String }
    },
    whatsApp_to_lead: {
      answered: {
        enabled: { type: Boolean, default: false },
        message: { type: String }
      },
      "un-answered": {
        enabled: { type: Boolean, default: false },
        message: { type: String }
      }
    }
  },

  design: {
    logo: { type: String },
    title_color: { type: String, default: "#ffffff" },
    sub_text_color: { type: String, default: "#ffffff" },
    background_image: { type: String },
    background_color: { type: String, default: "#ffffff" },
    form_background_color: { type: String, default: "#ffffff" },
    form_button_color: { type: String, default: "#90cdf4" },
    form_text_color: { type: String, default: "#ffffff" },
    widget_button_color: { type: String, default: "#90cdf4" },
    widget_button_icon: { type: String },
    widget_button_icon_color: { type: String },
    font_family: { type: String },
    sticky_button_state: { type: Boolean, default: false }
  },

  call_routing: {
    agents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Agent" }],
    agent_groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "AgentGroup" }],
    ai_agent_id: { type: String },
    agent_type: { type: String },
    use_investor_agents: { type: Boolean, default: false },
    investor_agent_groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "AgentGroup" }],
    investor_agents: [{ type: mongoose.Schema.Types.ObjectId, ref: "Agent" }],
    timezone: { type: String, default: "Asia/Muscat" },
    working_hours: [{
      day: { type: Number }, // 0-6 (Sunday-Saturday)
      start_time: [{ type: Number }],
      end_time: [{ type: Number }]
    }],
    call_type: { 
      type: String, 
      enum: ["CallTypeAll", "CallTypeSequential", "CallTypeRoundRobin", "CallTypeTodayPriority", "CallTypeBlindSequence"],
      default: "CallTypeRoundRobin"
    },
    keywords: [{
      identifier_key: { type: String },
      identifier_value: { type: String }
    }],
    agent_hangup: {
      enabled: { type: Boolean, default: false },
      max_calls: { type: String }
    },
    disable_agents: {
      enabled: { type: Boolean, default: false },
      disable_time: { type: String }
    },
    trigger_missed: {
      enabled: { type: Boolean, default: false },
      trigger_delay: { type: String },
      max_attempts: { type: String }
    }
  },

  texts: {
    title_text: { type: String, default: "Get call within 55 seconds" },
    sub_text: { type: String, default: "Leave your number below" },
    button_text: { type: String, default: "Call me!" },
    out_title_text: { type: String, default: "Get call within 55 seconds" },
    out_sub_text: { type: String, default: "Leave your number below" },
    out_button_text: { type: String, default: "Call me!" }
  },

  calls: {
    message_enabled: { type: Boolean, default: false },
    message_for_answered_agent: { type: String },
    polly_voice: { type: String }
  },

  tiktok_data: {
    tiktok_advertiser_id: { type: String },
    tiktok_form_id: { type: String }
  },

  facebook_data: {
    facebook_page_id: { type: String },
    facebook_page_name: { type: String },
    facebook_form_id: { type: String },
    facebook_form_name: { type: String },
    facebook_page_token: { type: String }
  },

  google_widget_data: {
    google_sheet_name: { type: String },
    google_sheet_id: { type: String }
  },

  custom_fields: {
    widget_custom_field: [{
      name: { type: String },
      id: { type: String },
      default: { type: String }
    }]
  },

  auto_created: {
    type: Boolean,
    default: false
  },
  deleted_at: {
    type: Date
  }
}, { timestamps: true });

// Auto-increment doc_number
campaignSchema.pre("save", async function (next) {
  if (this.isNew) {
    this.created_at = new Date();
    this.updated_at = new Date();
    const nextSeq = await AutoIncrement.findOneAndUpdate(
      { name: "campaign_number" },
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
campaignSchema.index({ account_id: 1 });
campaignSchema.index({ name: 1 });
campaignSchema.index({ is_active: 1 });
campaignSchema.index({ created_at: -1 });

module.exports = mongoose.model("Campaign", campaignSchema);
