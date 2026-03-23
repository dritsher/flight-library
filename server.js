const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const sanitizeFilename = require("sanitize-filename");
const { XMLParser } = require("fast-xml-parser");

const app = express();
const PORT = 3002;

const ROOT = "/opt/flight-library";
const PROJECTS_DIR = path.join(ROOT, "projects");
const TEMP_DIR = path.join(ROOT, "app", "temp");

app.use(express.json());

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function safeBaseName(filename) {
  const cleaned = sanitizeFilename(filename || "").trim();
  return cleaned || "upload.kml";
}

function ensureArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function deepFindAll(obj, keyName, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (Object.prototype.hasOwnProperty.call(obj, keyName)) {
    results.push(obj[keyName]);
  }

  for (const key of Object.keys(obj)) {
    deepFindAll(obj[key], keyName, results);
  }

  return results;
}

function firstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseWhenValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseCoordTriple(text) {
  if (typeof text !== "string") return null;
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  const alt = parts.length >= 3 ? Number(parts[2]) : 0;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    lon,
    alt: Number.isFinite(alt) ? alt : 0
  };
}

function parseCoordinateString(text) {
  if (typeof text !== "string") return [];
  return text
    .trim()
    .split(/\s+/)
    .map((chunk) => {
      const parts = chunk.split(",");
      if (parts.length < 2) return null;

      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      const alt = parts.length >= 3 ? Number(parts[2]) : 0;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : 0
      };
    })
    .filter(Boolean);
}

function synthesizeTimes(points, startTime) {
  const base = startTime ? new Date(startTime) : new Date();
  return points.map((point, index) => {
    const time = new Date(base.getTime() + index * 5000).toISOString();
    return {
      time,
      lat: point.lat,
      lon: point.lon,
      alt: point.alt
    };
  });
}

function parseKmlContent(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    trimValues: true
  });

  const parsed = parser.parse(xmlText);

  const names = deepFindAll(parsed, "name").flatMap((v) => ensureArray(v));
  const title = firstNonEmptyString(names);

const gxTracks = deepFindAll(parsed, "gx:Track").flatMap((v) => ensureArray(v));
if (gxTracks.length > 0) {
  const allPoints = [];

  for (const track of gxTracks) {
    const rawWhenValues = ensureArray(track.when);
    const rawCoordValues = ensureArray(track["gx:coord"]);

    const whenValues = rawWhenValues.map(parseWhenValue);
    const coordValues = rawCoordValues.map(parseCoordTriple);

    const count = Math.min(whenValues.length, coordValues.length);

    for (let i = 0; i < count; i += 1) {
      const time = whenValues[i];
      const coord = coordValues[i];

      if (!time || !coord) {
        continue;
      }

      allPoints.push({
        time: time,
        lat: coord.lat,
        lon: coord.lon,
        alt: coord.alt
      });
    }
  }

  if (allPoints.length > 0) {
    allPoints.sort((a, b) => new Date(a.time) - new Date(b.time));

    const deduped = [];
    let lastKey = null;

    for (const point of allPoints) {
      const key = point.time + "|" + point.lat + "|" + point.lon + "|" + point.alt;
      if (key !== lastKey) {
        deduped.push(point);
        lastKey = key;
      }
    }

    return {
      title: title,
      points: deduped,
      timeMode: "source"
    };
  }
}


  const lineStrings = deepFindAll(parsed, "LineString").flatMap((v) => ensureArray(v));
  for (const lineString of lineStrings) {
    if (lineString && typeof lineString.coordinates === "string") {
      const coords = parseCoordinateString(lineString.coordinates);
      if (coords.length > 0) {
        return {
          title,
          points: synthesizeTimes(coords),
          timeMode: "synthetic_5s"
        };
      }
    }
  }

  const coordinateBlocks = deepFindAll(parsed, "coordinates").flatMap((v) => ensureArray(v));
  for (const block of coordinateBlocks) {
    if (typeof block === "string") {
      const coords = parseCoordinateString(block);
      if (coords.length > 0) {
        return {
          title,
          points: synthesizeTimes(coords),
          timeMode: "synthetic_5s"
        };
      }
    }
  }

  throw new Error("Could not find supported track data in KML");
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function ensureProjectStructure(projectId) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  await ensureDir(projectDir);
  await ensureDir(path.join(projectDir, "raw"));
  await ensureDir(path.join(projectDir, "processed"));
  await ensureDir(path.join(projectDir, "metadata"));
  await ensureDir(path.join(projectDir, "exports"));
  return projectDir;
}

async function listProjects() {
  await ensureDir(PROJECTS_DIR);
  const entries = await fsp.readdir(PROJECTS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const projects = [];
  for (const dir of dirs) {
    const projectFile = path.join(PROJECTS_DIR, dir, "project.json");
    if (!fs.existsSync(projectFile)) continue;

    try {
      const project = JSON.parse(await fsp.readFile(projectFile, "utf8"));
      projects.push(project);
    } catch (err) {
      console.error("Could not read project " + dir + ": " + err.message);
    }
  }

  projects.sort((a, b) => a.title.localeCompare(b.title));
  return projects;
}

async function getProject(projectId) {
  const projectFile = path.join(PROJECTS_DIR, projectId, "project.json");
  if (!fs.existsSync(projectFile)) return null;
  return JSON.parse(await fsp.readFile(projectFile, "utf8"));
}

async function listProjectFlights(projectId) {
  const metadataDir = path.join(PROJECTS_DIR, projectId, "metadata");
  await ensureDir(metadataDir);

  const entries = await fsp.readdir(metadataDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const flights = [];
  for (const name of files) {
    const fullPath = path.join(metadataDir, name);
    try {
      const metadata = JSON.parse(await fsp.readFile(fullPath, "utf8"));
      flights.push(metadata);
    } catch (err) {
      console.error("Could not read metadata " + name + ": " + err.message);
    }
  }

  flights.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));
  return flights;
}

async function getFlightMetadata(projectId, flightId) {
  const fullPath = path.join(PROJECTS_DIR, projectId, "metadata", path.basename(flightId) + ".json");
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(await fsp.readFile(fullPath, "utf8"));
}

async function saveFlightArtifacts(projectId, originalFilename, parsedTrack) {
  const projectDir = path.join(PROJECTS_DIR, projectId);
  const processedDir = path.join(projectDir, "processed");
  const metadataDir = path.join(projectDir, "metadata");

  const ext = path.extname(originalFilename);
  const base = path.basename(originalFilename, ext);
  const flightId = slugify(base) || ("flight-" + Date.now());

  let finalFlightId = flightId;
  let counter = 1;
  while (
    fs.existsSync(path.join(metadataDir, finalFlightId + ".json")) ||
    fs.existsSync(path.join(processedDir, finalFlightId + ".json"))
  ) {
    finalFlightId = flightId + "-" + counter;
    counter += 1;
  }

  const processedFilename = finalFlightId + ".json";
  const metadataFilename = finalFlightId + ".json";

  const firstPoint = parsedTrack.points[0] || null;
  const lastPoint = parsedTrack.points[parsedTrack.points.length - 1] || null;
  const now = new Date().toISOString();

  const processed = {
    flight: {
      id: finalFlightId,
      projectId,
      title: parsedTrack.title || base,
      sourceFilename: originalFilename,
      timeMode: parsedTrack.timeMode
    },
    points: parsedTrack.points
  };

  const metadata = {
    id: finalFlightId,
    projectId,
    title: parsedTrack.title || base,
    source: "kml_upload",
    rawFile: "raw/" + originalFilename,
    processedFile: "processed/" + processedFilename,
    metadataFile: "metadata/" + metadataFilename,
    pointCount: parsedTrack.points.length,
    timeMode: parsedTrack.timeMode,
    startTime: firstPoint ? firstPoint.time : null,
    endTime: lastPoint ? lastPoint.time : null,
    createdAt: now,
    updatedAt: now,
    rawUrl: "/flight-api/projects/" + encodeURIComponent(projectId) + "/raw/" + encodeURIComponent(originalFilename),
    trackUrl: "/flight-api/projects/" + encodeURIComponent(projectId) + "/flights/" + encodeURIComponent(finalFlightId) + "/track",
    viewerUrl: "/flight-admin/viewer?projectId=" + encodeURIComponent(projectId) + "&flightId=" + encodeURIComponent(finalFlightId),
    notes: "",
    tags: []
  };

  await fsp.writeFile(
    path.join(processedDir, processedFilename),
    JSON.stringify(processed, null, 2),
    "utf8"
  );

  await fsp.writeFile(
    path.join(metadataDir, metadataFilename),
    JSON.stringify(metadata, null, 2),
    "utf8"
  );

  return metadata;
}

const upload = multer({
  dest: TEMP_DIR,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 20
  }
});

app.get("/flight-api/projects", async (req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

app.post("/flight-api/projects", async (req, res) => {
  try {
    const title = (req.body.title || "").trim();
    const description = (req.body.description || "").trim();
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];

    if (!title) {
      return res.status(400).json({ error: "Project title is required" });
    }

    const projectId = slugify(title);
    if (!projectId) {
      return res.status(400).json({ error: "Could not generate a valid project ID" });
    }

    const projectDir = path.join(PROJECTS_DIR, projectId);
    const projectFile = path.join(projectDir, "project.json");

    if (fs.existsSync(projectFile)) {
      return res.status(409).json({ error: "A project with that ID already exists", projectId });
    }

    await ensureProjectStructure(projectId);

    const now = new Date().toISOString();
    const project = {
      id: projectId,
      title,
      description,
      createdAt: now,
      updatedAt: now,
      tags
    };

    await fsp.writeFile(projectFile, JSON.stringify(project, null, 2), "utf8");

    res.status(201).json({ project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

app.get("/flight-api/projects/:projectId", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    res.json({ project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load project" });
  }
});

app.get("/flight-api/projects/:projectId/flights", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const flights = await listProjectFlights(req.params.projectId);
    res.json({ project, flights });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list flights" });
  }
});

app.get("/flight-api/projects/:projectId/flights/:flightId", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const flight = await getFlightMetadata(req.params.projectId, req.params.flightId);
    if (!flight) {
      return res.status(404).json({ error: "Flight not found" });
    }

    res.json({ project, flight });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load flight" });
  }
});

app.get("/flight-api/projects/:projectId/flights/:flightId/track", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const filename = path.basename(req.params.flightId) + ".json";
    const fullPath = path.join(PROJECTS_DIR, req.params.projectId, "processed", filename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "Track not found" });
    }

    res.type("application/json").send(await fsp.readFile(fullPath, "utf8"));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load track" });
  }
});

app.get("/flight-api/projects/:projectId/raw/:filename", async (req, res) => {
  try {
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const filename = path.basename(req.params.filename);
    const fullPath = path.join(PROJECTS_DIR, req.params.projectId, "raw", filename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.download(fullPath, filename);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to download file" });
  }
});

app.post("/flight-api/projects/:projectId/upload", upload.array("kmlFiles", 20), async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const project = await getProject(projectId);

    if (!project) {
      if (req.files) {
        for (const file of req.files) {
          await fsp.unlink(file.path).catch(() => {});
        }
      }
      return res.status(404).json({ error: "Project not found" });
    }

    const projectDir = path.join(PROJECTS_DIR, projectId);
    const rawDir = path.join(projectDir, "raw");
    await ensureDir(rawDir);

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const saved = [];
    const errors = [];

    for (const file of files) {
      try {
        const originalName = safeBaseName(file.originalname);
        const lower = originalName.toLowerCase();

        if (!lower.endsWith(".kml")) {
          await fsp.unlink(file.path).catch(() => {});
          errors.push({ filename: originalName, error: "Not a .kml file" });
          continue;
        }

        let finalName = originalName;
        let counter = 1;
        let destination = path.join(rawDir, finalName);

        while (fs.existsSync(destination)) {
          const ext = path.extname(originalName);
          const base = path.basename(originalName, ext);
          finalName = base + "-" + counter + ext;
          destination = path.join(rawDir, finalName);
          counter += 1;
        }

        await fsp.rename(file.path, destination);

        const xmlText = await fsp.readFile(destination, "utf8");
        const parsedTrack = parseKmlContent(xmlText);
        const metadata = await saveFlightArtifacts(projectId, finalName, parsedTrack);

        saved.push(metadata);
      } catch (err) {
        console.error(err);
        errors.push({
          filename: file.originalname,
          error: err.message || "Could not parse KML"
        });
        await fsp.unlink(file.path).catch(() => {});
      }
    }

    const now = new Date().toISOString();
    project.updatedAt = now;
    const projectFile = path.join(PROJECTS_DIR, projectId, "project.json");
    await fsp.writeFile(projectFile, JSON.stringify(project, null, 2), "utf8");

    res.status(201).json({
      message: "Upload complete",
      saved,
      errors
    });
  } catch (err) {
    console.error(err);

    if (req.files) {
      for (const file of req.files) {
        await fsp.unlink(file.path).catch(() => {});
      }
    }

    res.status(500).json({ error: "Failed to upload files" });
  }
});

app.get("/flight-admin/", async (req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Flight Library Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1100px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.5;
    }
    h1, h2, h3 {
      margin-bottom: 0.4em;
    }
    form {
      border: 1px solid #ccc;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }
    input, textarea, select, button {
      display: block;
      width: 100%;
      margin-top: 8px;
      margin-bottom: 16px;
      padding: 10px;
      font-size: 16px;
      box-sizing: border-box;
    }
    button {
      width: auto;
      cursor: pointer;
    }
    .project, .flight {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .meta {
      color: #555;
      font-size: 14px;
    }
    .error {
      color: #a00;
      margin-bottom: 16px;
      white-space: pre-wrap;
    }
    .success {
      color: #0a6;
      margin-bottom: 16px;
      white-space: pre-wrap;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    a {
      text-decoration: none;
    }
    .actions a {
      margin-right: 12px;
    }
  </style>
</head>
<body>
  <h1>Flight Library Admin</h1>

  <div class="two-col">
    <div>
      <form id="projectForm">
        <h2>Create Project</h2>
        <label for="title">Title</label>
        <input id="title" name="title" required>

        <label for="description">Description</label>
        <textarea id="description" name="description" rows="4"></textarea>

        <button type="submit">Create Project</button>
        <div id="projectMessage" class="error"></div>
      </form>

      <form id="uploadForm">
        <h2>Upload KML Files</h2>

        <label for="projectSelect">Project</label>
        <select id="projectSelect" name="projectId" required></select>

        <label for="kmlFiles">Choose one or more .kml files</label>
        <input id="kmlFiles" name="kmlFiles" type="file" accept=".kml" multiple required>

        <button type="submit">Upload</button>
        <div id="uploadMessage"></div>
      </form>
    </div>

    <div>
      <h2>Projects</h2>
      <div id="projects">Loading...</div>
    </div>
  </div>

  <h2>Flights in Selected Project</h2>
  <div id="flights">Select a project to view flights.</div>

  <script>
    async function loadProjects() {
      const res = await fetch("/flight-api/projects");
      const data = await res.json();

      const projectsContainer = document.getElementById("projects");
      const select = document.getElementById("projectSelect");

      if (!data.projects || data.projects.length === 0) {
        projectsContainer.innerHTML = "<p>No projects yet.</p>";
        select.innerHTML = "";
        document.getElementById("flights").innerHTML = "<p>Create a project first.</p>";
        return [];
      }

      projectsContainer.innerHTML = data.projects.map(project => \`
        <div class="project">
          <h3>\${project.title}</h3>
          <div class="meta"><strong>ID:</strong> \${project.id}</div>
          <div class="meta"><strong>Created:</strong> \${project.createdAt}</div>
          <p>\${project.description || ""}</p>
        </div>
      \`).join("");

      select.innerHTML = data.projects.map(project => \`
        <option value="\${project.id}">\${project.title}</option>
      \`).join("");

      return data.projects;
    }

    async function loadFlights(projectId) {
      const container = document.getElementById("flights");
      container.textContent = "Loading...";

      const res = await fetch("/flight-api/projects/" + encodeURIComponent(projectId) + "/flights");
      const data = await res.json();

      if (!res.ok) {
        container.innerHTML = "<p>Could not load flights.</p>";
        return;
      }

      if (!data.flights || data.flights.length === 0) {
        container.innerHTML = "<p>No parsed flights yet.</p>";
        return;
      }

      container.innerHTML = data.flights.map(flight => \`
        <div class="flight">
          <h3>\${flight.title || flight.id}</h3>
          <div class="meta"><strong>ID:</strong> \${flight.id}</div>
          <div class="meta"><strong>Points:</strong> \${flight.pointCount}</div>
          <div class="meta"><strong>Time mode:</strong> \${flight.timeMode}</div>
          <div class="meta"><strong>Start:</strong> \${flight.startTime || ""}</div>
          <div class="meta"><strong>End:</strong> \${flight.endTime || ""}</div>
          <div class="actions">
            <a href="\${flight.viewerUrl}" target="_blank">View in Cesium</a>
            <a href="\${flight.rawUrl}" target="_blank">Download raw KML</a>
            <a href="\${flight.trackUrl}" target="_blank">Open processed JSON</a>
          </div>
        </div>
      \`).join("");
    }

    document.getElementById("projectForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      const msg = document.getElementById("projectMessage");
      msg.className = "error";
      msg.textContent = "";

      const title = document.getElementById("title").value.trim();
      const description = document.getElementById("description").value.trim();

      const res = await fetch("/flight-api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description })
      });

      const data = await res.json();

      if (!res.ok) {
        msg.textContent = data.error || "Could not create project";
        return;
      }

      msg.className = "success";
      msg.textContent = "Project created.";
      document.getElementById("projectForm").reset();

      const projects = await loadProjects();
      if (projects.length > 0) {
        document.getElementById("projectSelect").value = data.project.id;
        await loadFlights(data.project.id);
      }
    });

    document.getElementById("projectSelect").addEventListener("change", async (event) => {
      const projectId = event.target.value;
      if (projectId) {
        await loadFlights(projectId);
      }
    });

    document.getElementById("uploadForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      const msg = document.getElementById("uploadMessage");
      msg.className = "";
      msg.textContent = "";

      const projectId = document.getElementById("projectSelect").value;
      const fileInput = document.getElementById("kmlFiles");

      if (!projectId) {
        msg.className = "error";
        msg.textContent = "Choose a project first.";
        return;
      }

      if (!fileInput.files || fileInput.files.length === 0) {
        msg.className = "error";
        msg.textContent = "Choose at least one KML file.";
        return;
      }

      const formData = new FormData();
      for (const file of fileInput.files) {
        formData.append("kmlFiles", file);
      }

      const res = await fetch("/flight-api/projects/" + encodeURIComponent(projectId) + "/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        msg.className = "error";
        msg.textContent = data.error || "Upload failed.";
        return;
      }

      const lines = [];
      lines.push("Parsed " + data.saved.length + " file(s).");
      if (data.errors && data.errors.length > 0) {
        lines.push("Some files had errors:");
        for (const err of data.errors) {
          lines.push("- " + err.filename + ": " + err.error);
        }
      }

      msg.className = data.errors && data.errors.length > 0 ? "error" : "success";
      msg.textContent = lines.join("\\n");

      document.getElementById("uploadForm").reset();
      await loadFlights(projectId);
    });

    async function init() {
      const projects = await loadProjects();
      if (projects.length > 0) {
        await loadFlights(projects[0].id);
      }
    }

    init();
  </script>
</body>
</html>
  `);
});

app.get("/flight-admin/viewer", async (req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Flight Viewer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cesium.com/downloads/cesiumjs/releases/1.118/Build/Cesium/Cesium.js"></script>
  <link href="https://cesium.com/downloads/cesiumjs/releases/1.118/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
  <style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Arial, sans-serif;
}

#app {
  position: fixed;
  inset: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
}

#sidebar {
  border-right: 1px solid #ccc;
  padding: 16px;
  overflow: auto;
  background: #fafafa;
  min-width: 0;
  min-height: 0;
}

#cesiumPane {
  min-width: 0;
  min-height: 0;
  position: relative;
}

#cesiumContainer {
  position: absolute;
  inset: 0;
}
    .meta {
      font-size: 14px;
      color: #555;
      margin-bottom: 8px;
    }
    label, select, button {
      display: block;
      width: 100%;
      margin-bottom: 12px;
      font-size: 15px;
      box-sizing: border-box;
    }
    select, button {
      padding: 8px;
    }
    a {
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="sidebar">
      <h2>Flight Viewer</h2>
      <div id="status">Loading...</div>

      <label for="projectSelect">Project</label>
      <select id="projectSelect"></select>

      <label for="flightSelect">Flight</label>
      <select id="flightSelect"></select>

      <button id="loadButton">Load Flight</button>

      <p><a href="/flight-admin/">Back to admin</a></p>

      <div id="details"></div>

<label for="cameraMode">Camera mode</label>
<select id="cameraMode">
  <option value="overview">Overview</option>
  <option value="follow">Follow</option>
</select>

<label for="speedSelect">Speed</label>
<select id="speedSelect">
  <option value="20">20x</option>
  <option value="50">50x</option>
  <option value="100" selected>100x</option>
  <option value="200">200x</option>
</select>
    </div>
      <div id="cesiumPane">
    <div id="cesiumContainer"></div>
  </div>
  </div>

  <script>
    const params = new URLSearchParams(window.location.search);
    let currentProjectId = params.get("projectId") || "";
    let currentFlightId = params.get("flightId") || "";
    let viewer = null;

let cameraMode = "overview";
let followHandler = null;
let currentBoundingSphere = null;
let currentEntity = null;

document.getElementById("cameraMode").addEventListener("change", function (event) {
  cameraMode = event.target.value;
  applyCameraMode();
});

document.getElementById("speedSelect").addEventListener("change", function (event) {
  if (viewer) {
    viewer.clock.multiplier = Number(event.target.value);
  }
});


    function setStatus(text) {
      document.getElementById("status").textContent = text;
    }

    function escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

function setOverviewCamera() {
  if (!viewer || !currentBoundingSphere) {
    return;
  }

  removeFollowMode();

  viewer.trackedEntity = undefined;

  viewer.camera.flyToBoundingSphere(currentBoundingSphere, {
    duration: 0,
    offset: new Cesium.HeadingPitchRange(
      0,
      Cesium.Math.toRadians(-90),
      currentBoundingSphere.radius * 2.5
    )
  });
}

function setFollowCamera() {
  if (!viewer || !currentEntity) {
    return;
  }

  removeFollowMode();

  followHandler = function () {
    const position = currentEntity.position.getValue(viewer.clock.currentTime);
    if (!position) {
      return;
    }

    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(
        0,
        Cesium.Math.toRadians(-85),
        1500000
      )
    );
  };

  viewer.scene.preRender.addEventListener(followHandler);
}

function removeFollowMode() {
  if (followHandler && viewer) {
    viewer.scene.preRender.removeEventListener(followHandler);
    followHandler = null;
  }

  if (viewer) {
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.trackedEntity = undefined;
  }
}

function applyCameraMode() {
  if (cameraMode === "follow") {
    setFollowCamera();
  } else {
    setOverviewCamera();
  }
}

    async function loadProjects() {
      const res = await fetch("/flight-api/projects");
      const data = await res.json();
      const select = document.getElementById("projectSelect");

      select.innerHTML = (data.projects || []).map(project => \`
        <option value="\${project.id}">\${project.title}</option>
      \`).join("");

      if (!currentProjectId && data.projects && data.projects.length > 0) {
        currentProjectId = data.projects[0].id;
      }

      select.value = currentProjectId;
    }

    async function loadFlights(projectId) {
      const res = await fetch("/flight-api/projects/" + encodeURIComponent(projectId) + "/flights");
      const data = await res.json();
      const select = document.getElementById("flightSelect");

      select.innerHTML = (data.flights || []).map(flight => \`
        <option value="\${flight.id}">\${flight.title || flight.id}</option>
      \`).join("");

      if ((!currentFlightId || !Array.from(select.options).some(o => o.value === currentFlightId)) && data.flights && data.flights.length > 0) {
        currentFlightId = data.flights[0].id;
      }

      if (currentFlightId) {
        select.value = currentFlightId;
      }

      return data.flights || [];
    }

    async function loadFlightMetadata(projectId, flightId) {
      const res = await fetch("/flight-api/projects/" + encodeURIComponent(projectId) + "/flights/" + encodeURIComponent(flightId));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load flight metadata");
      return data.flight;
    }

    async function loadTrack(projectId, flightId) {
      const res = await fetch("/flight-api/projects/" + encodeURIComponent(projectId) + "/flights/" + encodeURIComponent(flightId) + "/track");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load track");
      return data;
    }

function initViewer() {
  if (viewer) {
    return;
  }

  try {
    const container = document.getElementById("cesiumContainer");
    console.log("cesiumContainer exists?", !!container);

    Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxMTc3ZDU0ZC1mYzc2LTQ3ZmItYjgxMi0yODk1MTM2Mzc5MDUiLCJpZCI6NDA2MzUyLCJpYXQiOjE3NzM5NTUwMTh9.yFats_C0_kXHPkZlvw2bqGHVNcXxD0if-nHRR8VwaKk";

viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider()
});

//    viewer.scene.requestRenderMode = false;

    console.log("viewer initialized", viewer);
setTimeout(function () {
  viewer.resize();
}, 0);
  } catch (err) {
    console.error("initViewer failed", err);
    viewer = null;
  }
}



async function renderFlight(projectId, flightId) {
  setStatus("Loading flight...");

  const metadata = await loadFlightMetadata(projectId, flightId);
  const track = await loadTrack(projectId, flightId);


  initViewer();

if (!viewer) {
  throw new Error("Viewer failed to initialize");
}

console.log("[renderFlight] start", {
  hasFollowCallback: !!viewer.__followCallback,
  trackedEntity: !!viewer.trackedEntity
});

  if (viewer.__followCallback) {
    viewer.scene.preRender.removeEventListener(viewer.__followCallback);
    viewer.__followCallback = null;
  }

  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  viewer.entities.removeAll();
  viewer.trackedEntity = undefined;

console.log("[renderFlight] after cleanup", {
  hasFollowCallback: !!viewer.__followCallback,
  trackedEntity: !!viewer.trackedEntity
});

if (!viewer.__cameraChangedInstalled) {
  viewer.__cameraChangedInstalled = true;

  viewer.camera.changed.addEventListener(function () {
    console.log("[camera.changed]");
  });

  viewer.camera.percentageChanged = 0.000001;
}

  const points = track.points || [];
  if (points.length === 0) {
    throw new Error("This flight has no points");
  }

  points.sort((a, b) => new Date(a.time) - new Date(b.time));
console.log("first time", points[0].time);
console.log("last time", points[points.length - 1].time);

  const positionProperty = new Cesium.SampledPositionProperty();

  for (const point of points) {
    const time = Cesium.JulianDate.fromIso8601(point.time);
    const position = Cesium.Cartesian3.fromDegrees(
      point.lon,
      point.lat,
      point.alt || 0
    );
    positionProperty.addSample(time, position);
  }

  positionProperty.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: Cesium.LinearApproximation
  });

  const polylinePositions = points.map(point =>
    Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.alt || 0)
  );

  viewer.entities.add({
    polyline: {
      positions: polylinePositions,
      width: 2,
      material: Cesium.Color.CYAN
    }
  });

const boundingSphere = Cesium.BoundingSphere.fromPoints(polylinePositions);
currentBoundingSphere = Cesium.BoundingSphere.fromPoints(polylinePositions);

  const start = Cesium.JulianDate.fromIso8601(points[0].time);
  const stop = Cesium.JulianDate.fromIso8601(points[points.length - 1].time);

  viewer.clock.startTime = start.clone();
  viewer.clock.stopTime = stop.clone();
  viewer.clock.currentTime = start.clone();
  viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
  viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  viewer.clock.multiplier = 100;
  viewer.clock.shouldAnimate = true;

if (viewer.timeline) {
  viewer.timeline.zoomTo(start, stop);
}


  const entity = viewer.entities.add({
    availability: new Cesium.TimeIntervalCollection([
      new Cesium.TimeInterval({ start: start, stop: stop })
    ]),
    position: positionProperty,
    point: {
      pixelSize: 10,
      color: Cesium.Color.RED
    },
    path: {
      show: true,
      resolution: 1,
      leadTime: 0,
      trailTime: 1e9,
      width: 3,
      material: Cesium.Color.YELLOW
    },
    description: metadata.title || metadata.id
  });

currentEntity = entity;

if (viewer.__dotLogger) {
  viewer.scene.postRender.removeEventListener(viewer.__dotLogger);
  viewer.__dotLogger = null;
}

viewer.__dotLogger = function () {
  const position = entity.position.getValue(viewer.clock.currentTime);
  if (!position) {
    return;
  }

  const win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, position);
  if (win) {
    console.log("[dot screen]", {
      x: win.x,
      y: win.y,
      canvasWidth: viewer.scene.canvas.clientWidth,
      canvasHeight: viewer.scene.canvas.clientHeight
    });
  }
};

viewer.scene.postRender.addEventListener(viewer.__dotLogger);

viewer.trackedEntity = undefined;

setTimeout(function () {
  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration: 0,
    offset: new Cesium.HeadingPitchRange(
      0,
      Cesium.Math.toRadians(-90),
      boundingSphere.radius * 3.5
    )
  });
}, 500);

//viewer.zoomTo(viewer.entities);


  document.getElementById("details").innerHTML =
    "<h3>" + escapeHtml(metadata.title || metadata.id) + "</h3>" +
    '<div class="meta"><strong>ID:</strong> ' + escapeHtml(metadata.id) + "</div>" +
    '<div class="meta"><strong>Points:</strong> ' + escapeHtml(metadata.pointCount) + "</div>" +
    '<div class="meta"><strong>Time mode:</strong> ' + escapeHtml(metadata.timeMode) + "</div>" +
    '<div class="meta"><strong>Start:</strong> ' + escapeHtml(metadata.startTime || "") + "</div>" +
    '<div class="meta"><strong>End:</strong> ' + escapeHtml(metadata.endTime || "") + "</div>" +
    '<p><a href="' + metadata.rawUrl + '" target="_blank">Download raw KML</a></p>' +
    '<p><a href="' + metadata.trackUrl + '" target="_blank">Open processed JSON</a></p>';

  const url = new URL(window.location.href);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("flightId", flightId);
  window.history.replaceState({}, "", url.toString());

applyCameraMode();

  setStatus("Loaded.");
}



    async function loadCurrentFlight() {
      currentProjectId = document.getElementById("projectSelect").value;
      currentFlightId = document.getElementById("flightSelect").value;

      if (!currentProjectId || !currentFlightId) {
        setStatus("Choose a project and flight.");
        return;
      }

      try {
        await renderFlight(currentProjectId, currentFlightId);
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Could not load flight.");
      }
    }

    document.getElementById("projectSelect").addEventListener("change", async (event) => {
      currentProjectId = event.target.value;
      currentFlightId = "";
      await loadFlights(currentProjectId);
    });

    document.getElementById("loadButton").addEventListener("click", async () => {
      await loadCurrentFlight();
    });

    async function init() {
      try {
        await loadProjects();
        await loadFlights(currentProjectId);
        if (currentProjectId && currentFlightId) {
          await loadCurrentFlight();
        } else {
          setStatus("Choose a flight and click Load Flight.");
        }
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Could not initialize viewer.");
      }
    }

    init();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, async () => {
  await ensureDir(PROJECTS_DIR);
  await ensureDir(TEMP_DIR);
  console.log("Flight Library running on http://127.0.0.1:" + PORT);
});
