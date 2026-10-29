const mongoose = require("mongoose");
const configurationSchema = require("./configurationSchema");

const timetableSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  configuration: { type: configurationSchema, required: true },
  result: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

module.exports = mongoose.models.Timetable || mongoose.model("Timetable", timetableSchema);