const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  role: { type: String, required: true },
  event: { type: String, required: true },  // "Login" or "Logout"
  timestamp: { type: Date, default: Date.now }
});

const Log = mongoose.model("Log", logSchema);
module.exports = Log;