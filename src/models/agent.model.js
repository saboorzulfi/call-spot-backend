const mongoose = require("mongoose");
const AutoIncrement = require("./autoIncrement.model");

const agentSchema = new mongoose.Schema({
  doc_number: {
    type: Number
  },
  
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  
  full_name: {
    type: String,
    required: true,
    trim: true
  },
  personal_phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    trim: true
  },
  
  is_active: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ["free", "in-progress"],
    default: "free"
  },
  is_multi_calls_allowed: {
    type: Boolean,
    default: false
  },
  
  call_stats: {
    total: {
      type: Number,
      default: 0
    },
    answered: {
      type: Number,
      default: 0
    },
    no_answer: {
      type: Number,
      default: 0
    },
    missed: {
      type: Number,
      default: 0
    }
  },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  deleted_at: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

agentSchema.index({ account_id: 1 });
agentSchema.index({ personal_phone: 1 });
agentSchema.index({ email: 1 });
agentSchema.index({ created_at: -1 });

agentSchema.pre("save", async function (next) {
  if (this.isNew) {
    this.created_at = new Date();
    this.updated_at = new Date();
    
    const nextSeq = await AutoIncrement.findOneAndUpdate(
      { name: "agent_number" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.doc_number = nextSeq.seq;
  } else {
    this.updated_at = new Date();
  }
  
  next();
});

agentSchema.methods.isAvailable = function() {
  return this.is_active && !this.deleted_at;
};

agentSchema.statics.findByPhoneNumber = function(phoneNumber) {
  return this.findOne({
    personal_phone: phoneNumber,
    is_active: true,
    deleted_at: null
  });
};

agentSchema.statics.findByAccount = function(accountId) {
  return this.find({
    account_id: accountId,
    deleted_at: null
  }).sort({ created_at: -1 });
};

agentSchema.statics.findActiveAgents = function(accountId) {
  return this.find({
    account_id: accountId,
    is_active: true,
    deleted_at: null
  }).sort({ created_at: -1 });
};

const Agent = mongoose.model("Agent", agentSchema);

module.exports = Agent;
