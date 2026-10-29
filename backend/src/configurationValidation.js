function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueValues(values) {
  return new Set(values).size === values.length;
}

function validateNamedResources(resources, label) {
  if (!Array.isArray(resources)) return `${label} must be an array.`;
  const ids = [];
  for (const [index, resource] of resources.entries()) {
    if (!isRecord(resource)) return `${label} item ${index + 1} must be an object.`;
    if (typeof resource.id !== "string" || !resource.id.trim()) {
      return `Every ${label.toLowerCase().slice(0, -1)} must have a non-empty ID.`;
    }
    if (typeof resource.name !== "string" || !resource.name.trim()) {
      return `${label.slice(0, -1)} ${index + 1} must have a name.`;
    }
    if (resource.name.trim().length > 120) {
      return `${label.slice(0, -1)} names cannot be longer than 120 characters.`;
    }
    ids.push(resource.id.trim());
  }
  if (!uniqueValues(ids)) return `${label} IDs must be unique.`;
  return null;
}

function validateConfiguration(configuration) {
  if (!isRecord(configuration)) return "Configuration must be an object.";

  const requiredArrays = ["days", "periods", "classes", "teachers", "rooms", "subjects"];
  for (const key of requiredArrays) {
    if (!Array.isArray(configuration[key])) {
      return `Configuration ${key} must be an array.`;
    }
  }

  const days = configuration.days.map(day => typeof day === "string" ? day.trim() : "");
  if (!days.length || days.some(day => !day)) {
    return "Add at least one non-empty teaching day.";
  }
  if (days.length > 7) return "A timetable cannot have more than seven teaching days.";
  if (!uniqueValues(days.map(day => day.toLocaleLowerCase()))) {
    return "Teaching days must be unique.";
  }
  if (days.some(day => day.length > 30)) {
    return "Teaching day names cannot be longer than 30 characters.";
  }

  if (!configuration.periods.length) return "Add at least one period.";
  const periodIds = [];
  const periodLabels = [];
  let breakCount = 0;
  for (const [index, period] of configuration.periods.entries()) {
    if (!isRecord(period)) return `Period ${index + 1} must be an object.`;
    if (typeof period.id !== "string" || !period.id.trim()) {
      return `Period ${index + 1} must have an ID.`;
    }
    if (typeof period.label !== "string" || !period.label.trim()) {
      return `Period ${index + 1} must have a time label.`;
    }
    if (period.label.trim().length > 80) {
      return `Period ${index + 1} label cannot be longer than 80 characters.`;
    }
    periodIds.push(period.id.trim());
    periodLabels.push(period.label.trim().toLocaleLowerCase());
    if (period.isBreak === true) breakCount += 1;
    else if (period.isBreak !== undefined && typeof period.isBreak !== "boolean") {
      return `Period ${index + 1} break setting must be true or false.`;
    }
  }
  if (!uniqueValues(periodIds)) return "Period IDs must be unique.";
  if (!uniqueValues(periodLabels)) return "Period labels must be unique.";
  if (breakCount > 1) return "Only one lunch-break period is allowed.";
  if (breakCount === configuration.periods.length) {
    return "Add at least one teaching period besides the lunch break.";
  }

  const resourceSets = [
    [configuration.classes, "Classes"],
    [configuration.teachers, "Teachers"],
    [configuration.rooms, "Rooms"]
  ];
  for (const [resources, label] of resourceSets) {
    const error = validateNamedResources(resources, label);
    if (error) return error;
  }

  for (const [index, room] of configuration.rooms.entries()) {
    if (!["classroom", "lab"].includes(room.type)) {
      return `Room ${index + 1} must be a classroom or lab.`;
    }
  }

  const subjectError = validateNamedResources(configuration.subjects, "Subjects");
  if (subjectError) return subjectError;

  const classIds = new Set(configuration.classes.map(item => item.id.trim()));
  const teacherIds = new Set(configuration.teachers.map(item => item.id.trim()));
  const roomMap = new Map(configuration.rooms.map(item => [item.id.trim(), item]));
  const classLoads = new Map();
  const teacherLoads = new Map();
  const roomLoads = new Map();
  const teachingSlots = days.length * configuration.periods.filter(period => period.isBreak !== true).length;

  for (const subject of configuration.subjects) {
    if (typeof subject.classId !== "string" || !classIds.has(subject.classId.trim())) {
      return `Subject "${subject.name.trim()}" must reference an existing class.`;
    }
    if (typeof subject.teacherId !== "string" || !teacherIds.has(subject.teacherId.trim())) {
      return `Subject "${subject.name.trim()}" must reference an existing teacher.`;
    }
    if (
      (subject.roomId !== undefined && subject.roomId !== null && typeof subject.roomId !== "string") ||
      (typeof subject.roomId === "string" && subject.roomId.trim() && !roomMap.has(subject.roomId.trim()))
    ) {
      return `Subject "${subject.name.trim()}" must reference an existing room or use auto assign.`;
    }
    if (!Number.isInteger(subject.weeklyPeriods) || subject.weeklyPeriods < 1 || subject.weeklyPeriods > 20) {
      return `Subject "${subject.name.trim()}" weekly periods must be a whole number from 1 to 20.`;
    }
    if (!["theory", "lab"].includes(subject.type)) {
      return `Subject "${subject.name.trim()}" must be theory or lab.`;
    }
    const roomId = typeof subject.roomId === "string" ? subject.roomId.trim() : "";
    const room = roomId ? roomMap.get(roomId) : null;
    if (subject.type === "lab" && room && room.type !== "lab") {
      return `Lab subject "${subject.name.trim()}" must use a laboratory room.`;
    }
    if (subject.type === "lab" && !room && !configuration.rooms.some(candidate => candidate.type === "lab")) {
      return `Add a laboratory room before scheduling lab subject "${subject.name.trim()}".`;
    }

    classLoads.set(subject.classId, (classLoads.get(subject.classId) || 0) + subject.weeklyPeriods);
    teacherLoads.set(subject.teacherId, (teacherLoads.get(subject.teacherId) || 0) + subject.weeklyPeriods);
    if (room) roomLoads.set(room.id, (roomLoads.get(room.id) || 0) + subject.weeklyPeriods);
  }

  for (const [classId, sessions] of classLoads) {
    if (sessions > teachingSlots) {
      const className = configuration.classes.find(item => item.id === classId).name.trim();
      return `${className} needs ${sessions} weekly subject periods, but only ${teachingSlots} teaching slots are available.`;
    }
  }
  for (const [teacherId, sessions] of teacherLoads) {
    if (sessions > teachingSlots) {
      const teacherName = configuration.teachers.find(item => item.id === teacherId).name.trim();
      return `${teacherName} is assigned ${sessions} weekly periods, more than the ${teachingSlots} available slots.`;
    }
  }
  for (const [roomId, sessions] of roomLoads) {
    if (sessions > teachingSlots) {
      const roomName = roomMap.get(roomId).name.trim();
      return `${roomName} is assigned ${sessions} weekly periods, more than the ${teachingSlots} available slots.`;
    }
  }

  return null;
}

module.exports = { validateConfiguration };