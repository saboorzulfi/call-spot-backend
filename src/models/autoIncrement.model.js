const mongoose = require("mongoose");

const autoIncrementSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

const AutoIncrement = mongoose.model("AutoIncrement", autoIncrementSchema);

module.exports = AutoIncrement;
