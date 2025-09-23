const mongoose = require("mongoose");
const AutoIncrement = require("./autoIncrement.model");

const agentGroupSchema = new mongoose.Schema({
  doc_number: {
    type: Number
  },
  
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },
  
  agent_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent"
  }],
  
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
  
  is_default: {
    type: Boolean,
    default: false
  },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

agentGroupSchema.index({ account_id: 1 });
agentGroupSchema.index({ name: 1 });
agentGroupSchema.index({ is_default: 1 });
agentGroupSchema.index({ created_at: -1 });

agentGroupSchema.virtual('agent_count').get(function() {
  return this.agent_ids ? this.agent_ids.length : 0;
});

agentGroupSchema.pre("save", async function(next) {
  if (this.isNew) {
    this.created_at = new Date();
    this.updated_at = new Date();
    
    const nextSeq = await AutoIncrement.findOneAndUpdate(
      { name: "agent_group_number" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.doc_number = nextSeq.seq;
  } else {
    this.updated_at = new Date();
  }
  
  if (this.is_default) {
    await this.constructor.updateMany(
      { account_id: this.account_id, _id: { $ne: this._id } },
      { $set: { is_default: false } }
    );
  }
  
  next();
});

agentGroupSchema.methods.addAgent = function(agentId) {
  if (!this.agent_ids.includes(agentId)) {
    this.agent_ids.push(agentId);
  }
  return this.save();
};

agentGroupSchema.methods.removeAgent = function(agentId) {
  this.agent_ids = this.agent_ids.filter(id => !id.equals(agentId));
  return this.save();
};

agentGroupSchema.statics.findByName = function(name, accountId) {
  return this.findOne({
    name: name,
    account_id: accountId
  });
};

agentGroupSchema.statics.findByAccount = function(accountId) {
  return this.find({
    account_id: accountId
  }).sort({ created_at: -1 });
};

const AgentGroup = mongoose.model("AgentGroup", agentGroupSchema);

module.exports = AgentGroup;
