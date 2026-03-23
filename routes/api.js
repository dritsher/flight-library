const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const sanitizeFilename = require("sanitize-filename");

const {
  PROJECTS_DIR,
  TEMP_DIR,
  slugify,
  ensureDir,
  ensureProjectStructure,
  listProjects,
  getProject,
  listProjectFlights,
  getFlightMetadata,
  saveFlightArtifacts
} = require("../services/storage");

const { parseKmlContent } = require("../services/kmlParser");

const router = express.Router();

function safeBaseName(filename) {
  const cleaned = sanitizeFilename(filename || "").trim();
  return cleaned || "upload.kml";
}

const upload = multer({
  dest: TEMP_DIR,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 20
  }
});

router.get("/flight-api/projects", async (req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

router.post("/flight-api/projects", async (req, res) => {
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

router.get("/flight-api/projects/:projectId", async (req, res) => {
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

router.get("/flight-api/projects/:projectId/flights", async (req, res) => {
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

router.get("/flight-api/projects/:projectId/flights/:flightId", async (req, res) => {
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

router.get("/flight-api/projects/:projectId/flights/:flightId/track", async (req, res) => {
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

router.get("/flight-api/projects/:projectId/raw/:filename", async (req, res) => {
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

router.post("/flight-api/projects/:projectId/upload", upload.array("kmlFiles", 20), async (req, res) => {
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

    const rawDir = path.join(PROJECTS_DIR, projectId, "raw");
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

module.exports = router;
