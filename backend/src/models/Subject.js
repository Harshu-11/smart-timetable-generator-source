const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  classId: { type: String, required: true, trim: true },
  teacherId: { type: String, required: true, trim: true },
  roomId: { type: String, trim: true, default: "" },
  weeklyPeriods: { type: Number, required: true, min: 1, max: 20, default: 1 },
  type: { type: String, enum: ["theory", "lab"], default: "theory", required: true }
}, { timestamps: true });

module.exports = mongoose.models.Subject || mongoose.model("Subject", subjectSchema);
