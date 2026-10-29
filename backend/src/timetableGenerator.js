/*
  Constraint-based timetable generator.

  Hard constraints:
  - A teacher cannot teach two classes in the same period.
  - A class cannot have two subjects in the same period.
  - A room cannot be used twice in the same period.
  - Subject weekly periods must be satisfied.
  - A subject may optionally specify a teacher and room.
  - Lab subjects can request lab rooms.

  Soft constraints:
  - Spread a subject across different days.
  - Avoid repeating the same subject in adjacent periods.
  - Balance the number of sessions across days.
*/

const { validateConfiguration } = require("./configurationValidation");

function normalize(data) {
  const days = Array.isArray(data.days)
    ? data.days
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const periods = Array.isArray(data.periods)
    ? data.periods
    : [
        { id: "p1", label: "09:00-10:00" },
        { id: "p2", label: "10:00-11:00" },
        { id: "p3", label: "11:15-12:15" },
        { id: "p4", label: "12:15-01:15" },
        { id: "lunch-break", label: "01:15-02:00", isBreak: true },
        { id: "p5", label: "02:00-03:00" }
      ];

  return {
    days,
    periods,
    classes: data.classes || [],
    subjects: data.subjects || [],
    teachers: data.teachers || [],
    rooms: data.rooms || []
  };
}

function key(day, periodId) {
  return `${day}__${periodId}`;
}

function shuffledCopy(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function generateTimetable(input) {
  const data = normalize(input || {});
  const validationError = validateConfiguration(data);
  if (validationError) throw new Error(validationError);

  if (!data.classes.length) throw new Error("Add at least one class.");
  if (!data.subjects.length) throw new Error("Add at least one subject.");
  if (!data.teachers.length) throw new Error("Add at least one teacher.");
  if (!data.rooms.length) throw new Error("Add at least one room.");

  const classMap = new Map(data.classes.map(c => [c.id, c]));
  const teacherMap = new Map(data.teachers.map(t => [t.id, t]));
  const roomMap = new Map(data.rooms.map(r => [r.id, r]));

  const assignments = [];
  const teachingPeriods = data.periods.filter(period => period.isBreak !== true);
  const occupiedClass = new Set();
  const occupiedTeacher = new Set();
  const occupiedRoom = new Set();

  const subjectByClass = new Map();

  for (const subject of data.subjects) {
    if (!classMap.has(subject.classId)) {
      throw new Error(`Subject "${subject.name}" references an unknown class.`);
    }
    if (!teacherMap.has(subject.teacherId)) {
      throw new Error(`Subject "${subject.name}" references an unknown teacher.`);
    }
    if (subject.roomId && !roomMap.has(subject.roomId)) {
      throw new Error(`Subject "${subject.name}" references an unknown room.`);
    }

    const weekly = Math.max(1, Number(subject.weeklyPeriods || 1));
    const item = {
      ...subject,
      weeklyPeriods: weekly
    };

    if (!subjectByClass.has(subject.classId)) subjectByClass.set(subject.classId, []);
    subjectByClass.get(subject.classId).push(item);
  }

  // Harder subjects first: more weekly periods first, then labs.
  const requests = [];
  for (const [classId, subjects] of subjectByClass) {
    for (const subject of subjects) {
      for (let i = 0; i < subject.weeklyPeriods; i++) {
        requests.push({
          ...subject,
          classId,
          occurrence: i + 1
        });
      }
    }
  }

  requests.sort((a, b) => {
    const aScore = a.weeklyPeriods * 10 + (a.type === "lab" ? 5 : 0);
    const bScore = b.weeklyPeriods * 10 + (b.type === "lab" ? 5 : 0);
    return bScore - aScore;
  });

  const dayLoad = new Map();
  data.days.forEach(d => dayLoad.set(d, 0));

  function candidates(req) {
    const candidates = [];

    for (const day of shuffledCopy(data.days)) {
      for (const period of shuffledCopy(teachingPeriods)) {
        const k = key(day, period.id);
        const classBusy = occupiedClass.has(`${req.classId}__${k}`);
        const teacherBusy = occupiedTeacher.has(`${req.teacherId}__${k}`);

        if (classBusy || teacherBusy) continue;

        const roomCandidates = req.roomId
          ? [roomMap.get(req.roomId)]
          : data.rooms.filter(r => req.type === "lab" ? r.type === "lab" : true);

        for (const room of shuffledCopy(roomCandidates.filter(Boolean))) {
          if (occupiedRoom.has(`${room.id}__${k}`)) continue;

          const classSubjectAlreadyToday = assignments.some(a =>
            a.classId === req.classId &&
            a.day === day &&
            a.subjectId === req.id
          );

          const adjacentSameSubject = assignments.some(a =>
            a.classId === req.classId &&
            a.day === day &&
            a.subjectId === req.id &&
            Math.abs(data.periods.findIndex(p => p.id === a.periodId) -
                     data.periods.findIndex(p => p.id === period.id)) === 1
          );

          // Lower score is better.
          let score = dayLoad.get(day) * 3;
          if (classSubjectAlreadyToday) score += 15;
          if (adjacentSameSubject) score += 30;
          if (period.id === "p1" && req.type !== "lab") score += 2;

          candidates.push({ day, period, room, score });
        }
      }
    }

    return candidates.sort((a, b) => a.score - b.score);
  }

  function place(req) {
    const options = candidates(req);
    if (!options.length) return false;

    // Try the best candidates with light backtracking.
    for (const option of options.slice(0, 12)) {
      const k = key(option.day, option.period.id);

      assignments.push({
        id: `${req.classId}-${req.id}-${req.occurrence}-${assignments.length}`,
        classId: req.classId,
        className: classMap.get(req.classId).name,
        subjectId: req.id,
        subjectName: req.name,
        teacherId: req.teacherId,
        teacherName: teacherMap.get(req.teacherId).name,
        roomId: option.room.id,
        roomName: option.room.name,
        day: option.day,
        periodId: option.period.id,
        periodLabel: option.period.label,
        type: req.type || "theory"
      });

      occupiedClass.add(`${req.classId}__${k}`);
      occupiedTeacher.add(`${req.teacherId}__${k}`);
      occupiedRoom.add(`${option.room.id}__${k}`);
      dayLoad.set(option.day, dayLoad.get(option.day) + 1);

      return true;
    }

    return false;
  }

  for (const req of requests) {
    if (!place(req)) {
      return {
        success: false,
        message:
          `Could not place "${req.name}" for ${classMap.get(req.classId).name}. ` +
          `Try adding more periods/rooms/teachers or reducing weekly periods.`,
        timetable: [],
        conflicts: [
          {
            className: classMap.get(req.classId).name,
            subjectName: req.name,
            teacherName: teacherMap.get(req.teacherId).name
          }
        ]
      };
    }
  }

  const timetable = [];
  for (const cls of data.classes) {
    const grid = {};
    for (const day of data.days) {
      grid[day] = {};
      for (const period of data.periods) {
        grid[day][period.id] = null;
      }
    }

    assignments
      .filter(a => a.classId === cls.id)
      .forEach(a => {
        grid[a.day][a.periodId] = a;
      });

    timetable.push({
      classId: cls.id,
      className: cls.name,
      grid
    });
  }

  return {
    success: true,
    message: "Timetable generated successfully.",
    days: data.days,
    periods: data.periods,
    timetable,
    stats: {
      classes: data.classes.length,
      subjects: data.subjects.length,
      teachers: data.teachers.length,
      rooms: data.rooms.length,
      scheduledSessions: assignments.length
    }
  };
}

module.exports = { generateTimetable };