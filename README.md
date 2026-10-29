# Smart Timetable Generator

A timetable planning app with an independent React frontend and Express API.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express + MongoDB/Mongoose
- Scheduling: constraint-based heuristic algorithm

## Features

- Multiple classes
- Multiple teachers
- Multiple rooms
- Classroom/lab room types
- Weekly subject periods
- Configurable lunch-break period that is excluded from scheduling
- Teacher conflict prevention
- Class conflict prevention
- Room conflict prevention
- Lab-room support
- Subject distribution across days
- Responsive timetable UI
- Persist classes, teachers, rooms, subjects, and schedule settings in MongoDB
- Save, reload, and delete generated timetables with MongoDB Atlas

## Run locally

1. Install Node.js 18+.
2. Install the workspace dependencies from the repository root:

```bash
npm install
```

3. Copy `backend/.env.example` to `backend/.env` and set `MONGODB_URI` with a MongoDB Atlas database user's credentials. URL-encode special characters in the password. Keep `.env` private and allow your current IP in Atlas Network Access.
4. Start both apps in development:

```bash
npm run dev
```

5. Open the React app at:

http://localhost:5173

The API runs independently at `http://localhost:5000`. To start only one service, run `npm run dev --workspace frontend` or `npm run dev --workspace backend`. For a production frontend bundle, run `npm run build` from the root.

The app loads the workspace configuration from MongoDB when it starts. Add classes, teachers, rooms, subjects, or schedule settings and the changes are automatically saved to MongoDB shortly after you stop editing. Changing a field on an already-saved class, teacher, room, or subject creates a new record and keeps the original; changing a newly added, not-yet-saved record edits that new record. Schedule days and periods continue to update in place. The status beside **Save data to database** shows whether changes are waiting, saving, or saved. You can also use that button to save immediately. If MongoDB or the API is unavailable, the app shows an error and retries loading the workspace when the connection returns.

The default schedule includes a lunch break after the fourth teaching period. For an existing saved schedule without one, use **Add lunch break**; the break is shown in the timetable and is never assigned a class. Validation runs in the frontend and API before saving or generating: it checks required names and IDs, duplicate days/periods, subject references and types, weekly-period values, laboratory room requirements, and whether each class/teacher/assigned room has enough available teaching slots.

On PowerShell systems where script execution blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

## API

### Health check

GET `/api/health`

### Generate timetable

POST `/api/generate`

Example body:

```json
{
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "periods": [
    {"id":"p1","label":"09:00-10:00"},
    {"id":"p2","label":"10:00-11:00"}
  ],
  "classes": [
    {"id":"c1","name":"B.Sc. Nursing Year 1"}
  ],
  "teachers": [
    {"id":"t1","name":"Dr. Sharma"}
  ],
  "rooms": [
    {"id":"r1","name":"Room 101","type":"classroom"},
    {"id":"lab1","name":"Science Lab","type":"lab"}
  ],
  "subjects": [
    {
      "id":"s1",
      "name":"Anatomy",
      "classId":"c1",
      "teacherId":"t1",
      "roomId":"r1",
      "weeklyPeriods":3,
      "type":"theory"
    }
  ]
}
```

### Workspace configuration

- `GET /api/config` loads the saved classes, teachers, rooms, subjects, days, and periods. If no resources have been migrated yet, it imports them from the previous workspace configuration or latest saved timetable.
- `PUT /api/config` saves `{ "configuration": { "days", "periods", "classes", "teachers", "rooms", "subjects" } }`. Settings are stored in `workspaceconfigs`; classes, teachers, rooms, and subjects are stored in their own MongoDB collections. The response includes `savedCounts` for every collection and schedule setting. Mongoose validates each resource, enforces unique IDs, and the API ensures subjects reference existing classes, teachers, and optional rooms. Saves use a transaction on replica-set or sharded MongoDB deployments.
- Mark a period with `"isBreak": true` to reserve it as a break. The generator skips break periods and includes them in the rendered timetable without assigning a subject.

### Saved timetables

- `GET /api/timetables` lists the 50 most recently updated timetables.
- `POST /api/timetables` saves `{ "name", "configuration", "result" }`.
- `GET /api/timetables/:id` loads a saved timetable.
- `DELETE /api/timetables/:id` deletes one.

The `Timetable` collection stores a generated schedule only after you generate it and select **Save**. Saving workspace data writes classes, teachers, rooms, subjects, days, and periods; it does not create a timetable without a generated result.

MongoDB connection status is available from `GET /api/health`. Generation works without MongoDB, while configuration and saved timetable endpoints require a working Atlas connection.

The frontend uses Vite's `/api` development proxy. For a separately deployed frontend, set `VITE_API_URL` to the API base URL, for example `https://api.example.com/api`, and configure `FRONTEND_ORIGIN` in the backend environment to the frontend origin.

## Production upgrades

For a larger college/university system, add:
- PostgreSQL/MySQL database
- Login and role-based access
- Faculty availability
- Room capacity
- fixed periods
- lunch/break periods
- maximum consecutive classes
- teacher workload limits
- drag-and-drop manual editing
- PDF/Excel export
- save/version timetable
- optimization with OR-Tools or a constraint solver
"# smart-timetable-generator-source" 
