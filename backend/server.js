require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { generateTimetable } = require("./src/timetableGenerator");
const Timetable = require("./src/models/Timetable");
const WorkspaceConfig = require("./src/models/WorkspaceConfig");
const ClassModel = require("./src/models/Class");
const Teacher = require("./src/models/Teacher");
const Room = require("./src/models/Room");
const Subject = require("./src/models/Subject");
const { validateConfiguration } = require("./src/configurationValidation");

const app = express();
const PORT = process.env.PORT || 5000;
const defaultConfiguration = {
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  periods: [
    { id: "p1", label: "09:00 - 10:00" },
    { id: "p2", label: "10:00 - 11:00" },
    { id: "p3", label: "11:15 - 12:15" },
    { id: "p4", label: "12:15 - 01:15" },
    { id: "lunch-break", label: "01:15 - 02:00", isBreak: true },
    { id: "p5", label: "02:00 - 03:00" },
    { id: "p6", label: "03:00 - 04:00" }
  ],
  classes: [],
  teachers: [],
  rooms: [],
  subjects: []
};
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "smart-timetable-generator-api",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.post("/api/generate", (req, res) => {
  const validationError = validateConfiguration(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }
  try {
    res.json(generateTimetable(req.body));
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Unable to generate timetable."
    });
  }
});

function requireDatabase(_req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "MongoDB is not connected. Set MONGODB_URI in backend/.env."
    });
  }
  next();
}

async function loadResources() {
  const [classes, teachers, rooms, subjects] = await Promise.all([
    ClassModel.find().select("id name").sort({ createdAt: 1 }).lean(),
    Teacher.find().select("id name").sort({ createdAt: 1 }).lean(),
    Room.find().select("id name type").sort({ createdAt: 1 }).lean(),
    Subject.find().select("id name classId teacherId roomId weeklyPeriods type").sort({ createdAt: 1 }).lean()
  ]);
  return { classes, teachers, rooms, subjects };
}

async function replaceResources(Model, documents, session) {
  if (documents.length) {
    const operations = documents.map(document => ({
      replaceOne: {
        filter: { id: document.id },
        replacement: document,
        upsert: true
      }
    }));
    await Model.bulkWrite(operations, session ? { session } : {});
  }
  await Model.deleteMany(
    documents.length ? { id: { $nin: documents.map(document => document.id) } } : {},
    session ? { session } : {}
  );
}

function supportsTransactions() {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  return ["ReplicaSetWithPrimary", "Sharded", "LoadBalanced"].includes(topologyType);
}

function validateResources(resources) {
  const modelDocuments = [
    [ClassModel, resources.classes],
    [Teacher, resources.teachers],
    [Room, resources.rooms],
    [Subject, resources.subjects]
  ];

  for (const [Model, documents] of modelDocuments) {
    const ids = documents.map(document => document?.id);
    if (ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
      return "Every resource must have a unique, non-empty ID.";
    }
    for (const document of documents) {
      const error = new Model(document).validateSync();
      if (error) return error.message;
    }
  }
  return null;
}

async function migrateLegacyResources(legacyConfiguration) {
  if (!legacyConfiguration) return false;
  const resources = [
    [ClassModel, legacyConfiguration.classes || []],
    [Teacher, legacyConfiguration.teachers || []],
    [Room, legacyConfiguration.rooms || []],
    [Subject, legacyConfiguration.subjects || []]
  ];
  if (!resources.some(([, documents]) => documents.length)) return false;
  for (const [Model, documents] of resources) {
    if (documents.length) await Model.insertMany(documents, { ordered: true });
  }
  return true;
}

app.get("/api/config", requireDatabase, async (_req, res) => {
  try {
    let [settings, resources] = await Promise.all([
      WorkspaceConfig.findOne({ key: "default" }).lean(),
      loadResources()
    ]);
    const hasResources = Object.values(resources).some(items => items.length);

    if (!hasResources) {
      const latestTimetable = await Timetable.findOne()
        .sort({ updatedAt: -1 })
        .select("configuration")
        .lean();
      const legacyConfiguration = settings?.configuration ||
        latestTimetable?.configuration;
      if (await migrateLegacyResources(legacyConfiguration)) {
        resources = await loadResources();
      }
    }

    res.json({
      configuration: {
        days: settings?.days?.length ? settings.days : defaultConfiguration.days,
        periods: settings?.periods?.length ? settings.periods : defaultConfiguration.periods,
        ...resources
      }
    });
  } catch (error) {
    console.error(`Unable to load workspace configuration: ${error.message}`);
    res.status(500).json({ message: "Unable to load workspace configuration." });
  }
});

app.put("/api/config", requireDatabase, async (req, res) => {
  const configuration = req.body?.configuration;
  const validationError = validateConfiguration(configuration);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  const resourceValidationError = validateResources(configuration);
  if (resourceValidationError) {
    return res.status(400).json({ message: resourceValidationError });
  }

  const useTransaction = supportsTransactions();
  const session = useTransaction ? await mongoose.startSession() : null;
  try {
    let settings;
    const saveConfiguration = async () => {
      await replaceResources(ClassModel, configuration.classes, session);
      await replaceResources(Teacher, configuration.teachers, session);
      await replaceResources(Room, configuration.rooms, session);
      await replaceResources(Subject, configuration.subjects, session);
      settings = await WorkspaceConfig.findOneAndUpdate(
        { key: "default" },
        { $set: { days: configuration.days, periods: configuration.periods } },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
          ...(session ? { session } : {})
        }
      ).lean();
    };
    if (session) {
      await session.withTransaction(saveConfiguration);
    } else {
      await saveConfiguration();
    }

    const resources = await loadResources();
    res.json({
      configuration: {
        days: settings.days,
        periods: settings.periods,
        ...resources
      },
      savedCounts: {
        days: settings.days.length,
        periods: settings.periods.length,
        classes: resources.classes.length,
        teachers: resources.teachers.length,
        rooms: resources.rooms.length,
        subjects: resources.subjects.length
      },
      updatedAt: settings.updatedAt
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError" || error.code === 11000) {
      return res.status(400).json({ message: error.message });
    }
    console.error(`Unable to save workspace configuration: ${error.message}`);
    res.status(500).json({ message: "Unable to save workspace configuration." });
  } finally {
    if (session) await session.endSession();
  }
});

app.get("/api/timetables", requireDatabase, async (_req, res) => {
  try {
    const timetables = await Timetable.find()
      .select("name createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json(timetables);
  } catch (error) {
    res.status(500).json({ message: "Unable to load saved timetables." });
  }
});

app.post("/api/timetables", requireDatabase, async (req, res) => {
  const { name, configuration, result } = req.body || {};
  if (typeof name !== "string" || !name.trim() || !configuration || !result?.success) {
    return res.status(400).json({
      message: "A name, configuration, and successfully generated timetable are required."
    });
  }

  try {
    const timetable = await Timetable.create({ name: name.trim(), configuration, result });
    res.status(201).json(timetable);
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({ message: error.message });
    }
    console.error(`Unable to save timetable: ${error.message}`);
    res.status(500).json({ message: "Unable to save this timetable." });
  }
});

app.get("/api/timetables/:id", requireDatabase, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid timetable ID." });
  }
  try {
    const timetable = await Timetable.findById(req.params.id).lean();
    if (!timetable) return res.status(404).json({ message: "Timetable not found." });
    res.json(timetable);
  } catch (error) {
    res.status(500).json({ message: "Unable to load this timetable." });
  }
});

app.delete("/api/timetables/:id", requireDatabase, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid timetable ID." });
  }
  try {
    const timetable = await Timetable.findByIdAndDelete(req.params.id);
    if (!timetable) return res.status(404).json({ message: "Timetable not found." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Unable to delete timetable." });
  }
});

function start() {
  app.listen(PORT, () => {
    console.log(`Timetable API running at http://localhost:${PORT}`);
  });

  if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log("Connected to MongoDB."))
      .catch(error => console.error(`MongoDB connection failed: ${error.message}`));
  } else {
    console.warn("MONGODB_URI is not set; database features are unavailable.");
  }
}

start();