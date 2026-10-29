const mongoose = require("mongoose");

const classSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, unique: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 }
}, { timestamps: true });

module.exports = mongoose.models.Class || mongoose.model("Class", classSchema);
