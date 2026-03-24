const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const sanitizeFilename = require("sanitize-filename");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { loadModelLibrary } = require("../services/modelLibrary");
const { loadRegistrationLibrary } = require("../services/registrationLibrary");

const {
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
  getFlightTrack,
  dedupeTrackPoints,
  saveFlightArtifacts,
  saveUpdatedFlightTrack,
  deleteFlight
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

router.delete("/flight-api/projects/:projectId/flights/:flightId", async (req, res) => {
  try {
    const { projectId, flightId } = req.params;

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const existingMetadata = await getFlightMetadata(projectId, flightId);
    if (!existingMetadata) {
      return res.status(404).json({ error: "Flight not found" });
    }

    const deleted = await deleteFlight(projectId, flightId);

    if (!deleted) {
      return res.status(404).json({ error: "Flight files not found" });
    }

    res.json({
      ok: true,
      deletedFlightId: flightId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete flight" });
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

router.post("/flight-api/projects/:projectId/flights/:flightId/append", upload.array("kmlFiles", 10), async (req, res) => {
  try {
    const { projectId, flightId } = req.params;

    const project = await getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const existingMetadata = await getFlightMetadata(projectId, flightId);
    const existingTrack = await getFlightTrack(projectId, flightId);

    if (!existingMetadata || !existingTrack) {
      return res.status(404).json({ error: "Flight not found" });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const appendedPoints = [];

    for (const file of files) {
      try {
        const xmlText = await fsp.readFile(file.path, "utf8");
        const parsedTrack = parseKmlContent(xmlText);
        appendedPoints.push(...parsedTrack.points);
      } finally {
        await fsp.unlink(file.path).catch(() => {});
      }
    }

    const mergedPoints = [...(existingTrack.points || []), ...appendedPoints];

    mergedPoints.sort((a, b) => new Date(a.time) - new Date(b.time));

    const dedupedPoints = dedupeTrackPoints(mergedPoints);

    const updatedMetadata = await saveUpdatedFlightTrack(
      projectId,
      flightId,
      dedupedPoints,
      existingMetadata
    );

    res.json({
      ok: true,
      flight: updatedMetadata,
      appendedPoints: appendedPoints.length,
      totalPoints: dedupedPoints.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to append KML to flight" });
  }
});


router.post("/flight-api/exports/start", async (req, res) => {
  try {
    const { projectId, flightId, fps } = req.body || {};
    if (!projectId || !flightId) {
      return res.status(400).json({ error: "projectId and flightId are required" });
    }

    const exportId = "export-" + Date.now();
    const exportDir = path.join(EXPORTS_DIR, projectId, flightId, exportId);
    await ensureDir(exportDir);

    const metadata = {
      exportId,
      projectId,
      flightId,
      fps: Number(fps || 30),
      createdAt: new Date().toISOString()
    };

    await fsp.writeFile(
      path.join(exportDir, "export.json"),
      JSON.stringify(metadata, null, 2),
      "utf8"
    );

    await writeExportStatus(projectId, flightId, exportId, {
      exportId,
      projectId,
      flightId,
      state: "collecting_frames",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      framesUploaded: 0,
      movieUrl: null,
      error: null
    });

    res.status(201).json({
      exportId,
      uploadUrlBase: "/flight-api/exports/" + encodeURIComponent(exportId),
      exportDir
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start export" });
  }
});

router.post("/flight-api/exports/:exportId/frame", async (req, res) => {
  try {
    const { exportId } = req.params;
    const { projectId, flightId, filename, imageBase64, utcTime, frame } = req.body || {};

    if (!projectId || !flightId || !filename || !imageBase64) {
      return res.status(400).json({ error: "Missing required frame fields" });
    }

    const exportDir = path.join(EXPORTS_DIR, projectId, flightId, exportId);
    await ensureDir(exportDir);

    const buffer = Buffer.from(imageBase64, "base64");
    await fsp.writeFile(path.join(exportDir, filename), buffer);

    const manifestPath = path.join(exportDir, "frames.json");
    let manifest = [];
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
    }

    manifest.push({ frame, filename, utcTime });

    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    await writeExportStatus(projectId, flightId, exportId, {
      exportId,
      projectId,
      flightId,
      state: "collecting_frames",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      framesUploaded: manifest.length,
      movieUrl: null,
      error: null
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save frame" });
  }
});

router.post("/flight-api/exports/:exportId/finish", async (req, res) => {
  try {
    const { exportId } = req.params;
    const { projectId, flightId, fps } = req.body || {};

    if (!projectId || !flightId) {
      return res.status(400).json({ error: "projectId and flightId are required" });
    }

    const exportDir = getExportDir(projectId, flightId, exportId);
    const outputPath = path.join(exportDir, "output.mp4");
    const movieUrl =
      "/exports/" +
      encodeURIComponent(projectId) + "/" +
      encodeURIComponent(flightId) + "/" +
      encodeURIComponent(exportId) + "/output.mp4";

    await writeExportStatus(projectId, flightId, exportId, {
      exportId,
      projectId,
      flightId,
      state: "encoding",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      framesUploaded: 0,
      movieUrl: null,
      error: null
    });

    const ffmpeg = execFile("ffmpeg", [
      "-y",
      "-framerate", String(Number(fps || 30)),
      "-i", path.join(exportDir, "frame_%04d.png"),
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-crf", "20",
      "-preset", "veryfast",
      outputPath
    ], async (err) => {
      if (err) {
        console.error("ffmpeg failed", err);
        try {
          await writeExportStatus(projectId, flightId, exportId, {
            exportId,
            projectId,
            flightId,
            state: "failed",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            framesUploaded: 0,
            movieUrl: null,
            error: err.message || "ffmpeg failed"
          });
        } catch (writeErr) {
          console.error("Could not write failed status", writeErr);
        }
        return;
      }

      try {
        await writeExportStatus(projectId, flightId, exportId, {
          exportId,
          projectId,
          flightId,
          state: "done",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          framesUploaded: 0,
          movieUrl,
          error: null
        });
      } catch (writeErr) {
        console.error("Could not write done status", writeErr);
      }
    });

    ffmpeg.on("error", async (err) => {
      console.error("ffmpeg spawn error", err);
      try {
        await writeExportStatus(projectId, flightId, exportId, {
          exportId,
          projectId,
          flightId,
          state: "failed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          framesUploaded: 0,
          movieUrl: null,
          error: err.message || "ffmpeg spawn error"
        });
      } catch (writeErr) {
        console.error("Could not write spawn-error status", writeErr);
      }
    });

    res.json({
      ok: true,
      state: "encoding",
      exportId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start movie build" });
  }
});

router.get("/flight-api/exports/:exportId/status", async (req, res) => {
  try {
    const { exportId } = req.params;
    const { projectId, flightId } = req.query || {};

    if (!projectId || !flightId) {
      return res.status(400).json({ error: "projectId and flightId are required" });
    }

    const status = await readExportStatus(projectId, flightId, exportId);

    if (!status) {
      return res.status(404).json({ error: "Export status not found" });
    }

    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read export status" });
  }
});


function getExportDir(projectId, flightId, exportId) {
  return path.join(EXPORTS_DIR, projectId, flightId, exportId);
}

function getStatusPath(projectId, flightId, exportId) {
  return path.join(getExportDir(projectId, flightId, exportId), "status.json");
}

async function writeExportStatus(projectId, flightId, exportId, status) {
  const exportDir = getExportDir(projectId, flightId, exportId);
  await ensureDir(exportDir);
  await fsp.writeFile(
    getStatusPath(projectId, flightId, exportId),
    JSON.stringify(status, null, 2),
    "utf8"
  );
}

async function readExportStatus(projectId, flightId, exportId) {
  const statusPath = getStatusPath(projectId, flightId, exportId);
  if (!fs.existsSync(statusPath)) {
    return null;
  }
  return JSON.parse(await fsp.readFile(statusPath, "utf8"));
}

router.get("/flight-api/models", async (req, res) => {
  try {
    const models = await loadModelLibrary();
    res.json({ models });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load model library" });
  }
});

router.get("/flight-api/registrations", async (req, res) => {
  try {
    const registrations = await loadRegistrationLibrary();
    res.json({ registrations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load registrations" });
  }
});

module.exports = router;
