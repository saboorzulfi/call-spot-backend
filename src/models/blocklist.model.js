const mongoose = require("mongoose");
const AutoIncrement = require("./autoIncrement.model");

const blocklistSchema = new mongoose.Schema({
  doc_number: {
    type: Number
  },

  account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true
  },

  source: {
    type: String,
    required: true,
    trim: true
  },

  block_type: {
    type: String,
    enum: ["phone", "ip"],
    required: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true,
});

// Combined pre-save middleware
blocklistSchema.pre("save", async function (next) {
  if (this.isNew) {
    // Auto-increment doc_number
    const nextSeq = await AutoIncrement.findOneAndUpdate(
      { name: "blocklist_number" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.doc_number = nextSeq.seq;
  }

  // Normalize phone numbers (same as Go backend)
  if (this.block_type === "phone") {
    this.source = this.source.replace(/[\s\-\(\)]/g, "");
  }

  next();
});

// Indexes for performance
blocklistSchema.index({ account_id: 1 });
blocklistSchema.index({ source: 1 });
blocklistSchema.index({ block_type: 1 });
blocklistSchema.index({ created_at: -1 });

// Compound index for efficient lookups
blocklistSchema.index({ account_id: 1, source: 1 });

module.exports = mongoose.model("Blocklist", blocklistSchema);
