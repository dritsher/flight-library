const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ROOT = "/opt/flight-library";
const PROJECTS_DIR = path.join(ROOT, "projects");
const EXPORTS_DIR = path.join(ROOT, "exports");
const TEMP_DIR = path.join(ROOT, "app", "temp");

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
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

module.exports = {
  ROOT,
  PROJECTS_DIR,
  EXPORTS_DIR,
  TEMP_DIR,
  slugify,
  ensureDir,
  ensureProjectStructure,
  listProjects,
  getProject,
  listProjectFlights,
  getFlightMetadata,
  saveFlightArtifacts
};
