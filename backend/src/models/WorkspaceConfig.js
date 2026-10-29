const mongoose = require("mongoose");
const configurationSchema = require("./configurationSchema");

const periodSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, minlength: 1 },
  label: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  isBreak: { type: Boolean, default: false }
}, { _id: false });

const workspaceConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "default" },
  days: {
    type: [{ type: String, required: true, trim: true, minlength: 1, maxlength: 30 }],
    default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  },
  periods: {
    type: [periodSchema],
    default: [
      { id: "p1", label: "09:00 - 10:00" },
      { id: "p2", label: "10:00 - 11:00" },
      { id: "p3", label: "11:15 - 12:15" },
      { id: "p4", label: "12:15 - 01:15" },
      { id: "lunch-break", label: "01:15 - 02:00", isBreak: true },
      { id: "p5", label: "02:00 - 03:00" },
      { id: "p6", label: "03:00 - 04:00" }
    ]
  },
  configuration: { type: configurationSchema, required: false }
}, { timestamps: true });

module.exports = mongoose.models.WorkspaceConfig ||
  mongoose.model("WorkspaceConfig", workspaceConfigSchema);
