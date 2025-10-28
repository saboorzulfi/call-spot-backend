const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const AutoIncrement = require("./autoIncrement.model");

const accountSchema = new mongoose.Schema({
  doc_number: {
    type: Number
  },
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account"
  },

  full_name: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  profile_image_path: {
    type: String,
  },
  profileImage: {
    type: String,
  },
  phone: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
    required: true,
  },

  // Authentication & Role
  role: {
    type: String,
    default: "admin",
  },
  request_password: {
    type: String,
  },
  login_key: {
    type: String,
  },
  loginKey: {
    type: String,
  },

  // Social Media Integration
  tiktok_access_token: {
    type: String,
  },
  tiktok_account_data: {
    advertisers: [{
      advertiser_id: String,
      advertiser_name: String
    }]
  },
  facebook_access_token: {
    type: String,
  },
  facebook_account_data: {
    ad_accounts: [{
      ad_account_id: String,
      ad_account_name: String
    }]
  },
  facebook_user_id: {
    type: String,
  },
  google_account_data: {
    customer_accounts: [{
      customer_id: String,
      customer_name: String
    }]
  },
  google_data: {
    refresh_token: String,
    id_token: String,
    granted_scopes: String
  },

  // Business Features
  campaign_settings: {
    facebook_campaign_setting: {
      auto_create_campaigns: { type: Boolean, default: false }
    },
    tiktok_campaign_setting: {
      auto_create_campaigns: { type: Boolean, default: false }
    }
  },
  campaign_identifier: {
    type: String,
  },
  crm_data: {
    link: String,
    email: String,
    password: String
  },
  sip_balance_data: {
    sip_balance: String,
    updated_at: { type: Date, default: Date.now }
  },

  // WhatsApp Integration
  whatsapp_token: {
    type: String,
  },
  phone_number_id: {
    type: String,
  },
  whatsapp_business_account_id: {
    type: String,
  },

  // AI & Agent Features
  ai_agent_phone_number: {
    type: String,
  },
  ai_agent_ids: [{
    type: String
  }],
  agent_phone_number_id: {
    type: String,
  },

  // Settings & Preferences
  time_zone: {
    type: String,
  },
  language: {
    type: String,
  },
  time_format: {
    type: String,
  },
  disable_analytics_identifier: {
    type: Boolean,
    default: false
  },

  // Subscription & Billing
  subscription_start_date: {
    type: String,
  },
  subscription_end_date: {
    type: String,
  },

  // API Keys & External Services
  api_key_info: {
    key: String,
    permissions: [String],
    created_at: { type: Date, default: Date.now },
    expires_at: Date
  },
  mandrill_account_key: {
    type: String,
  },
  template_label: {
    type: String,
  },
  eleven_labs_api_key: {
    type: String,
  },

  // SkyLead Integration
  skylead_settings: {
    skylead_integration_key: String,
    skylead_base_url: String
  },

  // Access Control
  active: {
    type: Boolean,
    default: true,
  },
  fs_access_allowed: {
    type: Boolean,
    default: true,
  },

  // Legacy Fields (keeping for backward compatibility)
  currentStatus: {
    type: String,
    default: "active",
  },
  otpCode: { type: Number, default: null },
  otpExpiry: { type: Date, default: null },
  otpVerified: { type: Boolean, default: null },
  numberOfAttempts: { type: Number, default: null },
  isDelete: {
    type: Boolean,
    default: false,
  },
  dateOfEntry: Date,
  expiryDate: Date,

  deleted_at: { type: Date },
  last_login: { type: Date },
  lastLogin: { type: Date },
}, 
{timestamps: true});

accountSchema.index({ role: 1 });
accountSchema.index({ active: 1 });
accountSchema.index({ created_at: -1 });

accountSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcryptjs.hash(this.password, 8);
  }

  if (this.isNew) {
    const nextSeq = await AutoIncrement.findOneAndUpdate(
      { name: "account_number" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.doc_number = nextSeq.seq;
  } 

  next();
});

accountSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();
  if (update.$set && update.$set.password) {
    update.$set.password = await bcryptjs.hash(update.$set.password, 8);
  }
  next();
});

accountSchema.methods.isPasswordCorrect = function (password, inputPassword) {
  return bcryptjs.compare(password, inputPassword);
};

const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
