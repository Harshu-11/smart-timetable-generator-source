const mongoose = require("mongoose");

const { Schema } = mongoose;

function uniqueIds(items) {
  const ids = items.map(item => item?.id);
  return new Set(ids).size === ids.length;
}

function uniqueIdsValidator(label) {
  return {
    validator: uniqueIds,
    message: `${label} IDs must be unique.`
  };
}

const periodSchema = new Schema({
  id: { type: String, required: true, trim: true, minlength: 1 },
  label: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  isBreak: { type: Boolean, default: false }
}, { _id: false });

const classSchema = new Schema({
  id: { type: String, required: true, trim: true, minlength: 1 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 }
}, { _id: false });

const teacherSchema = new Schema({
  id: { type: String, required: true, trim: true, minlength: 1 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 }
}, { _id: false });

const roomSchema = new Schema({
  id: { type: String, required: true, trim: true, minlength: 1 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  type: { type: String, enum: ["classroom", "lab"], default: "classroom", required: true }
}, { _id: false });

const subjectSchema = new Schema({
  id: { type: String, required: true, trim: true, minlength: 1 },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
  classId: { type: String, required: true, trim: true, minlength: 1 },
  teacherId: { type: String, required: true, trim: true, minlength: 1 },
  roomId: { type: String, trim: true, default: "" },
  weeklyPeriods: { type: Number, required: true, min: 1, max: 20, default: 1 },
  type: { type: String, enum: ["theory", "lab"], default: "theory", required: true }
}, { _id: false });

const configurationSchema = new Schema({
  days: {
    type: [{ type: String, required: true, trim: true, minlength: 1, maxlength: 30 }],
    required: true
  },
  periods: {
    type: [periodSchema],
    required: true,
    validate: uniqueIdsValidator("Period")
  },
  classes: {
    type: [classSchema],
    required: true,
    validate: uniqueIdsValidator("Class")
  },
  teachers: {
    type: [teacherSchema],
    required: true,
    validate: uniqueIdsValidator("Teacher")
  },
  rooms: {
    type: [roomSchema],
    required: true,
    validate: uniqueIdsValidator("Room")
  },
  subjects: {
    type: [subjectSchema],
    required: true,
    validate: uniqueIdsValidator("Subject")
  }
}, { _id: false });

module.exports = configurationSchema;
