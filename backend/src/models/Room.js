const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  type: { type: String, enum: ["classroom", "lab"], default: "classroom", required: true }
}, { timestamps: true });

module.exports = mongoose.models.Room || mongoose.model("Room", roomSchema);
