import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  GraduationCap,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  WandSparkles
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const defaultPeriods = [
  { id: "p1", label: "09:00 - 10:00" },
  { id: "p2", label: "10:00 - 11:00" },
  { id: "p3", label: "11:15 - 12:15" },
  { id: "p4", label: "12:15 - 01:15" },
  { id: "lunch-break", label: "01:15 - 02:00", isBreak: true },
  { id: "p5", label: "02:00 - 03:00" },
  { id: "p6", label: "03:00 - 04:00" }
];

const initialConfiguration = {
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  periods: defaultPeriods,
  classes: [],
  teachers: [],
  rooms: [],
  subjects: []
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.ok
      ? "The API returned an invalid response."
      : `The API request failed with status ${response.status}.`);
  }
  if (!response.ok) throw new Error(data.message || "The API request failed.");
  return data;
}

function enqueueConfigurationSave(queue, configuration) {
  const request = queue.current.catch(() => {}).then(() => apiRequest("/config", {
    method: "PUT",
    body: JSON.stringify({ configuration })
  }));
  queue.current = request;
  return request;
}

function getFormConfiguration(configuration, daysInput) {
  return {
    ...configuration,
    days: daysInput.split(",").map(day => day.trim()).filter(Boolean)
  };
}

function isConfigurationSaved(expected, response) {
  const actual = response.configuration;
  if (
    !actual ||
    !Array.isArray(actual.days) ||
    actual.days.length !== expected.days.length ||
    !expected.days.every((day, index) => actual.days[index] === day) ||
    !Array.isArray(actual.periods) ||
    actual.periods.length !== expected.periods.length ||
    !expected.periods.every((period, index) =>
      actual.periods[index]?.id === period.id &&
      actual.periods[index]?.label === period.label &&
      Boolean(actual.periods[index]?.isBreak) === Boolean(period.isBreak)
    )
  ) {
    return false;
  }

  return ["classes", "teachers", "rooms", "subjects"].every(key =>
    Array.isArray(actual[key]) &&
    actual[key].length === expected[key].length &&
    expected[key].every(item => actual[key].some(savedItem => savedItem.id === item.id))
  );
}

function validateConfiguration(configuration) {
  if (!configuration.days.length || configuration.days.some(day => !day.trim())) {
    return "Add at least one non-empty teaching day.";
  }
  if (configuration.days.length > 7) return "A timetable cannot have more than seven teaching days.";
  if (new Set(configuration.days.map(day => day.trim().toLowerCase())).size !== configuration.days.length) {
    return "Teaching days must be unique.";
  }

  if (!configuration.periods.length) return "Add at least one period.";
  if (configuration.periods.some(period => !period.id.trim() || !period.label.trim())) {
    return "Every period needs an ID and a time label.";
  }
  if (new Set(configuration.periods.map(period => period.id.trim())).size !== configuration.periods.length) {
    return "Period IDs must be unique.";
  }
  if (new Set(configuration.periods.map(period => period.label.trim().toLowerCase())).size !== configuration.periods.length) {
    return "Period labels must be unique.";
  }
  const breakCount = configuration.periods.filter(period => period.isBreak === true).length;
  if (breakCount > 1) return "Only one lunch-break period is allowed.";
  const teachingPeriods = configuration.periods.length - breakCount;
  if (teachingPeriods < 1) return "Add at least one teaching period besides the lunch break.";

  const resources = [
    ["Class", configuration.classes],
    ["Teacher", configuration.teachers],
    ["Room", configuration.rooms],
    ["Subject", configuration.subjects]
  ];
  for (const [label, items] of resources) {
    if (items.some(item => !item.id.trim() || !item.name.trim())) {
      return `Every ${label.toLowerCase()} needs a name.`;
    }
    if (new Set(items.map(item => item.id.trim())).size !== items.length) {
      return `${label}s must have unique IDs.`;
    }
  }
  if (configuration.rooms.some(room => !["classroom", "lab"].includes(room.type))) {
    return "Every room must be a classroom or lab.";
  }

  const classMap = new Map(configuration.classes.map(item => [item.id, item]));
  const teacherMap = new Map(configuration.teachers.map(item => [item.id, item]));
  const roomMap = new Map(configuration.rooms.map(item => [item.id, item]));
  const classLoads = new Map();
  const teacherLoads = new Map();
  const roomLoads = new Map();
  const weeklyCapacity = configuration.days.length * teachingPeriods;
  for (const subject of configuration.subjects) {
    if (!classMap.has(subject.classId)) return `Subject "${subject.name}" must reference an existing class.`;
    if (!teacherMap.has(subject.teacherId)) return `Subject "${subject.name}" must reference an existing teacher.`;
    if (!Number.isInteger(subject.weeklyPeriods) || subject.weeklyPeriods < 1 || subject.weeklyPeriods > 20) {
      return `Subject "${subject.name}" weekly periods must be a whole number from 1 to 20.`;
    }
    const room = subject.roomId ? roomMap.get(subject.roomId) : null;
    if (subject.roomId && !room) return `Subject "${subject.name}" must reference an existing room or use auto assign.`;
    if (!["theory", "lab"].includes(subject.type)) return `Subject "${subject.name}" must be theory or lab.`;
    if (subject.type === "lab" && room && room.type !== "lab") {
      return `Lab subject "${subject.name}" must use a laboratory room.`;
    }
    if (subject.type === "lab" && !room && !configuration.rooms.some(candidate => candidate.type === "lab")) {
      return `Add a laboratory room before scheduling lab subject "${subject.name}".`;
    }
    classLoads.set(subject.classId, (classLoads.get(subject.classId) || 0) + subject.weeklyPeriods);
    teacherLoads.set(subject.teacherId, (teacherLoads.get(subject.teacherId) || 0) + subject.weeklyPeriods);
    if (room) roomLoads.set(room.id, (roomLoads.get(room.id) || 0) + subject.weeklyPeriods);
  }
  for (const [classId, sessions] of classLoads) {
    if (sessions > weeklyCapacity) {
      return `${classMap.get(classId).name} needs ${sessions} weekly subject periods, but only ${weeklyCapacity} teaching slots are available.`;
    }
  }
  for (const [teacherId, sessions] of teacherLoads) {
    if (sessions > weeklyCapacity) {
      return `${teacherMap.get(teacherId).name} is assigned ${sessions} weekly periods, more than the ${weeklyCapacity} available slots.`;
    }
  }
  for (const [roomId, sessions] of roomLoads) {
    if (sessions > weeklyCapacity) {
      return `${roomMap.get(roomId).name} is assigned ${sessions} weekly periods, more than the ${weeklyCapacity} available slots.`;
    }
  }
  return null;
}

const resourceFields = {
  classes: ["name"],
  teachers: ["name"],
  rooms: ["name", "type"],
  subjects: ["name", "classId", "teacherId", "roomId", "weeklyPeriods", "type"]
};

const resourcePrefixes = {
  classes: "c",
  teachers: "t",
  rooms: "r",
  subjects: "s"
};

function makeId(prefix) {
  return `${prefix}${crypto.randomUUID()}`;
}

function SectionHeading({ icon: Icon, number, title, count }) {
  return (
    <div className="section-heading">
      <span className="section-icon"><Icon size={18} aria-hidden="true" /></span>
      <div>
        <p className="eyebrow">{number}</p>
        <h2>{title}</h2>
      </div>
      {count !== undefined && <span className="count">{count}</span>}
    </div>
  );
}

function App() {
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [daysInput, setDaysInput] = useState(initialConfiguration.days.join(", "));
  const [periodCount, setPeriodCount] = useState(defaultPeriods.filter(period => !period.isBreak).length);
  const [scheduleName, setScheduleName] = useState("My timetable");
  const [generated, setGenerated] = useState(null);
  const [saved, setSaved] = useState([]);
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [databaseStatus, setDatabaseStatus] = useState("checking");
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [configurationSaveStatus, setConfigurationSaveStatus] = useState("loading");
  const [resourceEditRevision, setResourceEditRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const savedConfigurationRef = useRef(null);
  const savedResourcesRef = useRef(null);
  const latestConfigurationDataRef = useRef(configuration);
  const latestConfigurationRef = useRef(null);
  const resourceEditorActiveRef = useRef(false);
  const configurationSaveQueueRef = useRef(Promise.resolve());
  const currentConfiguration = getFormConfiguration(configuration, daysInput);
  const currentConfigurationSnapshot = JSON.stringify(currentConfiguration);
  latestConfigurationDataRef.current = configuration;
  latestConfigurationRef.current = currentConfigurationSnapshot;

  async function refreshSaved(selectedId = "") {
    const rows = await apiRequest("/timetables");
    setSaved(rows);
    setSelectedSavedId(selectedId);
  }

  useEffect(() => {
    let active = true;
    let retryTimer;

    async function loadWorkspace() {
      try {
        const health = await apiRequest("/health");
        if (!active) return;
        setDatabaseStatus(health.database);
        if (health.database !== "connected") {
          setConfigurationSaveStatus("waiting");
          retryTimer = window.setTimeout(loadWorkspace, 2500);
          return;
        }

        const [configData, rows] = await Promise.all([
          apiRequest("/config"),
          apiRequest("/timetables")
        ]);
        if (!active) return;

        setConfiguration(configData.configuration);
        setDaysInput(configData.configuration.days.join(", "));
        setPeriodCount(configData.configuration.periods.filter(period => !period.isBreak).length || 1);
        setSaved(rows);
        savedResourcesRef.current = configData.configuration;
        savedConfigurationRef.current = JSON.stringify(configData.configuration);
        setWorkspaceLoaded(true);
        setConfigurationSaveStatus("saved");
      } catch (error) {
        if (active) {
          setDatabaseStatus("offline");
          setConfigurationSaveStatus("offline");
          setNotice({ type: "error", text: error.message, source: "configuration" });
          retryTimer = window.setTimeout(loadWorkspace, 3000);
        }
      }
    }

    loadWorkspace();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, []);

  useEffect(() => {
    if (!workspaceLoaded || databaseStatus !== "connected") return undefined;
    if (resourceEditorActiveRef.current) return undefined;
    const snapshot = currentConfigurationSnapshot;
    if (snapshot === savedConfigurationRef.current) {
      setConfigurationSaveStatus("saved");
      return undefined;
    }

    setConfigurationSaveStatus("pending");
    const timer = window.setTimeout(() => {
      if (snapshot === savedConfigurationRef.current) return;
      setConfigurationSaveStatus("saving");
      enqueueConfigurationSave(configurationSaveQueueRef, currentConfiguration)
        .then(response => {
          if (!isConfigurationSaved(currentConfiguration, response)) {
            throw new Error("The database did not confirm all classes, teachers, rooms, subjects, and schedule settings. Please retry.");
          }
          savedResourcesRef.current = response.configuration;
          savedConfigurationRef.current = snapshot;
          if (latestConfigurationRef.current === snapshot) {
            setConfigurationSaveStatus("saved");
            setNotice(current => current?.source === "configuration" ? null : current);
          } else {
            setConfigurationSaveStatus("pending");
          }
        })
        .catch(error => {
          if (latestConfigurationRef.current === snapshot) {
            setConfigurationSaveStatus("error");
            setNotice({ type: "error", text: error.message, source: "configuration" });
          }
        });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [currentConfigurationSnapshot, databaseStatus, resourceEditRevision, workspaceLoaded]);

  function updateCollection(collection, id, field, value) {
    setGenerated(null);
    setConfiguration(current => ({
      ...current,
      [collection]: current[collection].map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    }));
  }

  function finishResourceEdit(collection, id) {
    resourceEditorActiveRef.current = false;
    setResourceEditRevision(revision => revision + 1);
    const savedResources = savedResourcesRef.current;
    const savedItem = savedResources?.[collection]?.find(item => item.id === id);
    if (!savedItem) return;

    const currentItem = latestConfigurationDataRef.current[collection].find(item => item.id === id);
    if (!currentItem) return;
    const fields = resourceFields[collection];
    if (fields.every(field => Object.is(currentItem[field], savedItem[field]))) return;

    const { _id, createdAt, updatedAt, ...itemFields } = currentItem;
    const newItem = { ...itemFields, id: makeId(resourcePrefixes[collection]) };
    setConfiguration(current => ({
      ...current,
      [collection]: [
        ...current[collection].map(item =>
          item.id === id ? { ...savedItem } : item
        ),
        newItem
      ]
    }));
    setNotice({
      type: "success",
      text: `Added as a new ${collection.slice(0, -1)}. The existing record was kept.`
    });
  }

  function addItem(collection) {
    if (collection === "subjects" && (!configuration.classes.length || !configuration.teachers.length)) {
      setNotice({
        type: "error",
        text: "Add at least one class and one teacher before adding a subject."
      });
      return;
    }
    const defaults = {
      classes: { id: makeId("c"), name: "New class" },
      teachers: { id: makeId("t"), name: "New teacher" },
      rooms: { id: makeId("r"), name: "New room", type: "classroom" },
      subjects: {
        id: makeId("s"),
        name: "New subject",
        classId: configuration.classes[0]?.id || "",
        teacherId: configuration.teachers[0]?.id || "",
        roomId: configuration.rooms[0]?.id || "",
        weeklyPeriods: 2,
        type: "theory"
      }
    };
    setGenerated(null);
    setConfiguration(current => ({ ...current, [collection]: [...current[collection], defaults[collection]] }));
  }

  function removeItem(collection, id) {
    setGenerated(null);
    setConfiguration(current => {
      const updated = {
        ...current,
        [collection]: current[collection].filter(item => item.id !== id)
      };

      if (collection === "classes") {
        updated.subjects = current.subjects.filter(subject => subject.classId !== id);
      } else if (collection === "teachers") {
        updated.subjects = current.subjects.filter(subject => subject.teacherId !== id);
      } else if (collection === "rooms") {
        updated.subjects = current.subjects.map(subject =>
          subject.roomId === id ? { ...subject, roomId: "" } : subject
        );
      }

      return updated;
    });
  }

  function buildPeriods() {
    const count = Math.min(12, Math.max(1, Number(periodCount) || 1));
    const periods = Array.from({ length: count }, (_, index) => ({
      id: `p${index + 1}`,
      label: `${9 + index}:00 - ${10 + index}:00`
    }));
    const lunchBreak = configuration.periods.find(period => period.isBreak === true);
    if (lunchBreak) periods.splice(Math.min(4, periods.length), 0, lunchBreak);
    setGenerated(null);
    setPeriodCount(count);
    setConfiguration(current => ({ ...current, periods }));
  }

  function addLunchBreak() {
    if (configuration.periods.some(period => period.isBreak === true)) return;
    const teachingPeriods = configuration.periods.filter(period => period.isBreak !== true);
    const insertAfter = Math.min(4, teachingPeriods.length);
    const lunchBreak = {
      id: makeId("break"),
      label: "01:15 - 02:00",
      isBreak: true
    };
    teachingPeriods.splice(insertAfter, 0, lunchBreak);
    setConfiguration(current => ({ ...current, periods: teachingPeriods }));
    setGenerated(null);
  }

  function removeLunchBreak() {
    setConfiguration(current => ({
      ...current,
      periods: current.periods.filter(period => period.isBreak !== true)
    }));
    setGenerated(null);
  }

  async function saveConfiguration() {
    const nextConfiguration = getFormConfiguration(configuration, daysInput);
    const validationError = validateConfiguration(nextConfiguration);
    if (validationError) {
      setConfigurationSaveStatus("error");
      setNotice({ type: "error", text: validationError, source: "configuration" });
      return;
    }
    setBusy(true);
    setConfigurationSaveStatus("saving");
    setNotice(null);
    const snapshot = JSON.stringify(nextConfiguration);
    try {
      const response = await enqueueConfigurationSave(configurationSaveQueueRef, nextConfiguration);
      if (!isConfigurationSaved(nextConfiguration, response)) {
        throw new Error("The database did not confirm all classes, teachers, rooms, subjects, and schedule settings. Please retry.");
      }
      savedResourcesRef.current = response.configuration;
      savedConfigurationRef.current = snapshot;
      setConfigurationSaveStatus(
        latestConfigurationRef.current === snapshot ? "saved" : "pending"
      );
      setGenerated(null);
      setNotice({
        type: "success",
        text: latestConfigurationRef.current === snapshot
          ? `Saved to MongoDB: ${["classes", "teachers", "rooms", "subjects", "days", "periods"].map(key => `${response.savedCounts[key]} ${key}`).join(", ")}.`
          : "Changes saved. Your latest edits are still being saved."
      });
    } catch (error) {
      setConfigurationSaveStatus("error");
      setNotice({ type: "error", text: error.message, source: "configuration" });
    } finally {
      setBusy(false);
    }
  }

  async function generateTimetable() {
    const nextConfiguration = getFormConfiguration(configuration, daysInput);
    const validationError = validateConfiguration(nextConfiguration);
    if (validationError) {
      setGenerated(null);
      setNotice({ type: "error", text: validationError });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiRequest("/generate", {
        method: "POST",
        body: JSON.stringify(nextConfiguration)
      });
      if (!result.success) throw new Error(result.message || "Unable to create this timetable.");
      setConfiguration(nextConfiguration);
      setGenerated({ configuration: nextConfiguration, result });
      setNotice({ type: "success", text: `${result.message} ${result.stats.scheduledSessions} sessions placed.` });
    } catch (error) {
      setGenerated(null);
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveTimetable() {
    if (!generated) return;
    setBusy(true);
    try {
      const savedTimetable = await apiRequest("/timetables", {
        method: "POST",
        body: JSON.stringify({
          name: scheduleName,
          configuration: generated.configuration,
          result: generated.result
        })
      });
      await refreshSaved(savedTimetable._id);
      setNotice({ type: "success", text: "Timetable saved to MongoDB." });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function loadTimetable() {
    if (!selectedSavedId) return;
    setBusy(true);
    try {
      const item = await apiRequest(`/timetables/${encodeURIComponent(selectedSavedId)}`);
      setConfiguration(item.configuration);
      setDaysInput(item.configuration.days.join(", "));
      setPeriodCount(item.configuration.periods.filter(period => !period.isBreak).length);
      setScheduleName(item.name);
      setGenerated({ configuration: item.configuration, result: item.result });
      setNotice({ type: "success", text: `Loaded ${item.name}.` });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function deleteTimetable() {
    if (!selectedSavedId) return;
    setBusy(true);
    try {
      await apiRequest(`/timetables/${encodeURIComponent(selectedSavedId)}`, { method: "DELETE" });
      await refreshSaved();
      setNotice({ type: "success", text: "Saved timetable deleted." });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  const databaseLabel = {
    checking: "Checking database",
    connected: "MongoDB connected",
    disconnected: "MongoDB offline",
    offline: "API offline"
  }[databaseStatus];
  const configurationSaveLabel = {
    loading: "Loading saved data...",
    waiting: "Waiting for MongoDB...",
    pending: "Unsaved changes",
    saving: "Saving changes...",
    saved: "All changes saved",
    error: "Save failed",
    offline: "API unavailable"
  }[configurationSaveStatus];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Smart Timetable home">
          <span className="brand-mark"><CalendarDays size={21} /></span>
          <span>Campus<span className="brand-light"> / Schedule</span></span>
        </a>
        <div className={`connection-status ${databaseStatus}`}>
          <span className="status-dot" />{databaseLabel}
        </div>
      </header>

      <main id="top" className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ACADEMIC PLANNING</p>
            <h1>Timetable builder</h1>
            <p className="intro">Set your teaching resources, then build a conflict-aware weekly schedule.</p>
          </div>
          <button className="button button-primary generate-button" onClick={generateTimetable} disabled={busy}>
            <WandSparkles size={17} />{busy ? "Working..." : "Generate timetable"}
          </button>
        </div>

        {notice && (
          <div className={`notice ${notice.type}`} role="status">
            {notice.type === "success" ? <Check size={17} /> : <CircleAlert size={17} />}
            <span>{notice.text}</span>
            <button className="icon-button notice-close" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
          </div>
        )}

        <section className="panel settings-panel">
          <SectionHeading icon={Clock3} number="01 / TIMING" title="Schedule settings" />
          <div className="settings-grid">
            <label className="field">
              <span>Teaching days <small>Separate days with commas</small></span>
              <input value={daysInput} onChange={event => setDaysInput(event.target.value)} />
            </label>
            <label className="field period-count-field">
              <span>Teaching periods per day</span>
              <input type="number" min="1" max="12" value={periodCount} onChange={event => setPeriodCount(event.target.value)} />
            </label>
            <button className="button button-secondary build-button" onClick={buildPeriods}>
              <RefreshCw size={16} />Build periods
            </button>
          </div>
          <div className="period-list">
            {configuration.periods.map((period, index) => (
              <label className={`field period-field${period.isBreak ? " lunch-period-field" : ""}`} key={period.id}>
                <span>{period.isBreak ? "Lunch break" : `Period ${String(configuration.periods.slice(0, index + 1).filter(item => !item.isBreak).length).padStart(2, "0")}`}</span>
                <input
                  value={period.label}
                  onChange={event => updateCollection("periods", period.id, "label", event.target.value)}
                  aria-label={`${period.isBreak ? "Lunch break" : "Period"} ${index + 1} time range`}
                />
              </label>
            ))}
          </div>
          <div className="configuration-actions">
            <span className={`configuration-save-status ${configurationSaveStatus}`} aria-live="polite">
              {configurationSaveLabel}
            </span>
            {configuration.periods.some(period => period.isBreak === true) ? (
              <button className="button button-secondary" onClick={removeLunchBreak} disabled={busy}>
                Remove lunch break
              </button>
            ) : (
              <button className="button button-secondary" onClick={addLunchBreak} disabled={busy}>
                Add lunch break
              </button>
            )}
            <button
              className="button button-secondary"
              onClick={saveConfiguration}
              disabled={busy || databaseStatus !== "connected" || !workspaceLoaded}
            >
              <Save size={16} />Save data to database
            </button>
          </div>
          <div className="saved-row">
            <label className="field saved-name">
              <span>Schedule name</span>
              <input value={scheduleName} maxLength={120} onChange={event => setScheduleName(event.target.value)} />
            </label>
            <button className="button button-secondary" onClick={saveTimetable} disabled={!generated || busy || databaseStatus !== "connected"}>
              <Save size={16} />Save
            </button>
            <label className="field saved-select">
              <span>Saved schedules</span>
              <span className="select-wrap">
                <select value={selectedSavedId} onChange={event => setSelectedSavedId(event.target.value)}>
                  <option value="">Choose a saved schedule</option>
                  {saved.map(item => (
                    <option key={item._id} value={item._id}>{item.name} · {new Date(item.updatedAt).toLocaleDateString()}</option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </span>
            </label>
            <button className="button button-secondary" onClick={loadTimetable} disabled={!selectedSavedId || busy}>
              <Download size={16} />Load
            </button>
            <button className="button button-danger" onClick={deleteTimetable} disabled={!selectedSavedId || busy} aria-label="Delete selected schedule">
              <Trash2 size={16} />
            </button>
          </div>
        </section>

        <div className="resource-grid">
          <section className="panel resource-panel">
            <SectionHeading icon={GraduationCap} number="02 / CLASSES" title="Classes" count={configuration.classes.length} />
            <div className="resource-list">
              {configuration.classes.map(item => (
                <div className="resource-row" key={item.id}>
                  <input
                    aria-label="Class name"
                    value={item.name}
                    onFocus={() => { resourceEditorActiveRef.current = true; }}
                    onChange={event => updateCollection("classes", item.id, "name", event.target.value)}
                    onBlur={() => finishResourceEdit("classes", item.id)}
                  />
                  <button className="icon-button" onClick={() => removeItem("classes", item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button className="add-button" onClick={() => addItem("classes")}><Plus size={16} />Add class</button>
          </section>

          <section className="panel resource-panel">
            <SectionHeading icon={Users} number="03 / PEOPLE" title="Teachers" count={configuration.teachers.length} />
            <div className="resource-list">
              {configuration.teachers.map(item => (
                <div className="resource-row" key={item.id}>
                  <input
                    aria-label="Teacher name"
                    value={item.name}
                    onFocus={() => { resourceEditorActiveRef.current = true; }}
                    onChange={event => updateCollection("teachers", item.id, "name", event.target.value)}
                    onBlur={() => finishResourceEdit("teachers", item.id)}
                  />
                  <button className="icon-button" onClick={() => removeItem("teachers", item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button className="add-button" onClick={() => addItem("teachers")}><Plus size={16} />Add teacher</button>
          </section>

          <section className="panel resource-panel">
            <SectionHeading icon={Building2} number="04 / SPACES" title="Rooms" count={configuration.rooms.length} />
            <div className="resource-list">
              {configuration.rooms.map(item => (
                <div className="resource-row resource-room" key={item.id}>
                  <input
                    aria-label="Room name"
                    value={item.name}
                    onFocus={() => { resourceEditorActiveRef.current = true; }}
                    onChange={event => updateCollection("rooms", item.id, "name", event.target.value)}
                    onBlur={() => finishResourceEdit("rooms", item.id)}
                  />
                  <select
                    aria-label="Room type"
                    value={item.type}
                    onFocus={() => { resourceEditorActiveRef.current = true; }}
                    onChange={event => updateCollection("rooms", item.id, "type", event.target.value)}
                    onBlur={() => finishResourceEdit("rooms", item.id)}
                  >
                    <option value="classroom">Classroom</option>
                    <option value="lab">Laboratory</option>
                  </select>
                  <button className="icon-button" onClick={() => removeItem("rooms", item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button className="add-button" onClick={() => addItem("rooms")}><Plus size={16} />Add room</button>
          </section>
        </div>

        <section className="panel subjects-panel">
          <div className="subjects-heading">
            <SectionHeading icon={BookOpen} number="05 / CURRICULUM" title="Subjects" count={configuration.subjects.length} />
            <button className="button button-secondary" onClick={() => addItem("subjects")}><Plus size={16} />Add subject</button>
          </div>
          <div className="subject-table-wrap">
            <table className="subject-table">
              <thead><tr><th>Subject</th><th>Class</th><th>Teacher</th><th>Room</th><th>Weekly periods</th><th>Type</th><th /></tr></thead>
              <tbody>
                {configuration.subjects.map(item => (
                  <tr key={item.id}>
                    <td><input
                      value={item.name}
                      aria-label="Subject name"
                      onFocus={() => { resourceEditorActiveRef.current = true; }}
                      onChange={event => updateCollection("subjects", item.id, "name", event.target.value)}
                      onBlur={() => finishResourceEdit("subjects", item.id)}
                    /></td>
                    <td><select
                      aria-label="Subject class"
                      value={item.classId}
                      onFocus={() => { resourceEditorActiveRef.current = true; }}
                      onChange={event => updateCollection("subjects", item.id, "classId", event.target.value)}
                      onBlur={() => finishResourceEdit("subjects", item.id)}
                    >
                      <option value="">Choose class</option>{configuration.classes.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select></td>
                    <td><select
                      aria-label="Subject teacher"
                      value={item.teacherId}
                      onFocus={() => { resourceEditorActiveRef.current = true; }}
                      onChange={event => updateCollection("subjects", item.id, "teacherId", event.target.value)}
                      onBlur={() => finishResourceEdit("subjects", item.id)}
                    >
                      <option value="">Choose teacher</option>{configuration.teachers.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select></td>
                    <td><select
                      aria-label="Subject room"
                      value={item.roomId}
                      onFocus={() => { resourceEditorActiveRef.current = true; }}
                      onChange={event => updateCollection("subjects", item.id, "roomId", event.target.value)}
                      onBlur={() => finishResourceEdit("subjects", item.id)}
                    >
                      <option value="">Auto assign</option>{configuration.rooms.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select></td>
                    <td><input
                      className="weekly-input"
                      type="number"
                      min="1"
                      max="20"
                      value={item.weeklyPeriods}
                      aria-label="Weekly periods"
                      onFocus={() => { resourceEditorActiveRef.current = true; }}
                      onChange={event => updateCollection("subjects", item.id, "weeklyPeriods", Number(event.target.value))}
                      onBlur={() => finishResourceEdit("subjects", item.id)}
                    /></td>
                    <td><select
                      aria-label="Subject type"
                      value={item.type}
                      onFocus={() => { resourceEditorActiveRef.current = true; }}
                      onChange={event => updateCollection("subjects", item.id, "type", event.target.value)}
                      onBlur={() => finishResourceEdit("subjects", item.id)}
                    >
                      <option value="theory">Theory</option><option value="lab">Lab</option>
                    </select></td>
                    <td><button className="icon-button" onClick={() => removeItem("subjects", item.id)} aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {generated && (
          <section className="results-section">
            <div className="results-heading">
              <div>
                <p className="eyebrow">GENERATED SCHEDULE</p>
                <h2>Weekly timetable</h2>
              </div>
              <span className="result-count">{generated.result.stats.scheduledSessions} sessions placed</span>
            </div>
            {generated.result.timetable.map(classSchedule => (
              <section className="panel timetable-panel" key={classSchedule.classId}>
                <h3>{classSchedule.className}</h3>
                <div className="timetable-scroll">
                  <table className="timetable">
                    <thead><tr><th>Day</th>{generated.result.periods.map(period => <th key={period.id}>{period.label}</th>)}</tr></thead>
                    <tbody>
                      {generated.result.days.map(day => (
                        <tr key={day}>
                          <th>{day}</th>
                          {generated.result.periods.map(period => {
                            const lesson = classSchedule.grid[day][period.id];
                            return (
                              <td key={period.id}>
                                {period.isBreak ? <div className="lesson lunch-break">
                                  <strong>Lunch break</strong><span>{period.label}</span>
                                </div> : lesson ? <div className={`lesson ${lesson.type}`}>
                                  <strong>{lesson.subjectName}</strong><span>{lesson.teacherName}</span><span>{lesson.roomName}</span>
                                </div> : <span className="free-slot">Free</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </section>
        )}
      </main>
      <footer className="footer"><span>SMART TIMETABLE GENERATOR</span><span>Schedule planning workspace</span></footer>
    </div>
  );
}

export default App;