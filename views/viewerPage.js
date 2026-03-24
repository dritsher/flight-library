function viewerPage({ cesiumToken = "", maptilerApiKey = "" } = {}) {
  return `<!doctype html>
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
#sidebarToggle {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  width: 40px;
  height: 40px;
  border: 1px solid #bbb;
  background: white;
  border-radius: 8px;
  cursor: pointer;
}

#app.sidebar-collapsed {
  grid-template-columns: 0 minmax(0, 1fr);
}

#app.sidebar-collapsed #sidebar {
  padding: 0;
  border-right: none;
  overflow: hidden;
}

#app.sidebar-collapsed #sidebar > * {
  display: none;
}

#timelinePanel {
  margin-top: 20px;
}

#timelineReadout {
  font-size: 13px;
  margin-bottom: 12px;
}

#timelineWrap {
  display: flex;
  justify-content: center;
  margin: 12px 0 16px 0;
}

#verticalTimeline {
  position: relative;
  width: 44px;
  height: 320px;
  user-select: none;
  touch-action: none;
}

#timelineTrack {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translateX(-50%);
  width: 8px;
  height: 100%;
  background: #ddd;
  border-radius: 999px;
}

#timelinePlayhead {
  position: absolute;
  left: 50%;
  width: 28px;
  height: 4px;
  background: #d22;
  transform: translateX(-50%);
  border-radius: 999px;
}

.timelineMarker {
  position: absolute;
  left: 50%;
  width: 36px;
  height: 3px;
  transform: translateX(-50%);
  border-radius: 999px;
}

.timelineMarker.in {
  background: #1a7f37;
}

.timelineMarker.out {
  background: #b54708;
}

#timelineButtons button {
  margin-bottom: 8px;
}
  </style>
</head>
<body>
  <div id="app">
    <button id="sidebarToggle" title="Toggle sidebar">☰</button>
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

<label>
  <input type="checkbox" id="showModel" checked>
  Show aircraft model
</label>
<label>
  <input type="checkbox" id="showTrackLine" checked>
  Show blue track line
</label>
<select id="modelSelect">
  <option value="">Auto</option>
</select>
<label for="cameraMode">Camera mode</label>
<select id="cameraMode">
  <option value="overview">Overview</option>
  <option value="follow">Follow</option>
  <option value="chase">Chase</option>
  <option value="lead">Lead</option>
  <option value="side">Side</option>
  <option value="tail">Tail</option>
</select>

<label for="speedSelect">Speed</label>
<select id="speedSelect">
  <option value="20">20x</option>
  <option value="50">50x</option>
  <option value="100" selected>100x</option>
  <option value="200">200x</option>
</select>
<label for="resolutionSelect">Resolution</label>
<h3>Export</h3>

<label for="exportFps">Export FPS</label>
<select id="exportFps">
  <option value="24">24</option>
  <option value="30" selected>30</option>
  <option value="60">60</option>
</select>
<label for="exportSpeedSelect">Export Speed</label>
<select id="exportSpeedSelect">
  <option value="1">1x</option>
  <option value="10">10x</option>
  <option value="100" selected>100x</option>
  <option value="1000">1000x</option>
</select>
<select id="resolutionSelect">
  <option value="1280x720">720p</option>
  <option value="1920x1080" selected>1080p Landscape</option>
  <option value="1080x1920" selected>1080p Vertical</option>
  <option value="3840x2160">4K</option>
</select>
<div id="exportProgressWrap" style="margin-top:12px;">
  <div style="font-size:13px; margin-bottom:6px;">
    <strong>Export Progress:</strong>
    <span id="exportProgressLabel">Idle</span>
  </div>
  <div style="width:100%; height:14px; background:#ddd; border-radius:999px; overflow:hidden;">
    <div
      id="exportProgressBar"
      style="width:0%; height:100%; background:#2d7ef7; transition:width 0.15s ease;"
    ></div>
  </div>
</div>
<button id="exportFramesButton" type="button">Export In/Out Frames</button>
<button id="captureFrame">Capture Frame</button>
<h3>Timeline</h3>

<div id="timelinePanel">
  <div id="timelineReadout">
    <div><strong>Current:</strong> <span id="currentTimeLabel">--</span></div>
    <div><strong>In:</strong> <span id="inTimeLabel">--</span></div>
    <div><strong>Out:</strong> <span id="outTimeLabel">--</span></div>
  </div>

  <div id="timelineWrap">
    <div id="verticalTimeline">
      <div id="timelineTrack"></div>
      <div id="timelineInMarker" class="timelineMarker in"></div>
      <div id="timelineOutMarker" class="timelineMarker out"></div>
      <div id="timelinePlayhead"></div>
    </div>
  </div>

  <div id="timelineButtons">
    <button id="markInButton" type="button">Mark In</button>
    <button id="markOutButton" type="button">Mark Out</button>
    <button id="jumpInButton" type="button">Jump to In</button>
    <button id="jumpOutButton" type="button">Jump to Out</button>
    <button id="resetRangeButton" type="button">Reset Range</button>
  </div>
  <label for="basemapSelect">Basemap</label>
  <select id="basemapSelect">
    <option value="cesium-default">Cesium Default</option>
<!--//    <option value="maptiler-streets">MapTiler Streets</option>
//    <option value="maptiler-satellite">MapTiler Satellite</option>
//      <option value="cesium-night">Earth at Night</option>
--!>      <option value="arcgis-satellite">ArcGIS Satellite</option>
      <option value="arcgis-hillshade">ArcGIS Hillshade</option>
  </select>
</div>
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
let currentBasemap = "cesium-default";
let followHandler = null;
let currentBoundingSphere = null;
let currentEntity = null;

let flightStartJulian = null;
let flightStopJulian = null;
let inPointJulian = null;
let outPointJulian = null;

let currentTrackEntity = null;
let userHasManuallySelectedModel = false;

let availableModels = [];
let registrationMap = {};
let modelsByAircraftType = {};

const MAPTILER_API_KEY = ${JSON.stringify(maptilerApiKey)};

document.getElementById("cameraMode").addEventListener("change", async function (event) {
  cameraMode = event.target.value;
    if (viewer && currentProjectId && currentFlightId) {
    const savedTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
    await loadCurrentFlight(savedTime);
  } else {
    applyCameraMode();
  }
});

document.getElementById("speedSelect").addEventListener("change", function (event) {
  if (viewer) {
    viewer.clock.multiplier = Number(event.target.value);
  }
});

document.getElementById("showModel").addEventListener("change", async function () {
  if (currentProjectId && currentFlightId && viewer) {
    const savedTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
    await loadCurrentFlight(savedTime);
  }
});

document.getElementById("captureFrame").addEventListener("click", function () {
  viewer.scene.requestRender();
  viewer.render();

  const canvas = viewer.scene.canvas;
  const dataUrl = canvas.toDataURL("image/png");

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "frame.png";
  link.click();
});

///////////////////////////
//// HELPER FUNCTIONS /////
///////////////////////////

async function createImageryProviderForBasemap(basemap) {
  if (basemap === "maptiler-streets") {
    return new Cesium.UrlTemplateImageryProvider({
      url:
        "https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=" +
        encodeURIComponent(MAPTILER_API_KEY),
      credit: "© MapTiler © OpenStreetMap contributors"
    });
  }

  if (basemap === "maptiler-satellite") {
    return new Cesium.UrlTemplateImageryProvider({
      url:
        "https://api.maptiler.com/tiles/satellite-v2/256/{z}/{x}/{y}.jpg?key=" +
        encodeURIComponent(MAPTILER_API_KEY),
      credit: "© MapTiler"
    });
  }

  if (basemap === "cesium-night") {
    return await Cesium.IonImageryProvider.fromAssetId(3812);
  }

  if (basemap === "arcgis-satellite") {
    return await Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
      Cesium.ArcGisBaseMapType.SATELLITE
    );
  }

  if (basemap === "arcgis-hillshade") {
    return await Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
      Cesium.ArcGisBaseMapType.HILLSHADE
    );
  }

  return await Cesium.IonImageryProvider.fromAssetId(2);
}

async function applyBasemap(basemap) {
  if (!viewer) return;

  const provider = await createImageryProviderForBasemap(basemap);

  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(provider);

  currentBasemap = basemap;
}

function densifyTrackPoints(points, maxStepSeconds = 30) {
  if (!Array.isArray(points) || points.length < 2) {
    return points || [];
  }

  const densified = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];

    densified.push(a);

    const t1 = new Date(a.time).getTime();
    const t2 = new Date(b.time).getTime();
    const dtSeconds = (t2 - t1) / 1000;

    if (!Number.isFinite(dtSeconds) || dtSeconds <= maxStepSeconds) {
      continue;
    }

    const steps = Math.floor(dtSeconds / maxStepSeconds);

    for (let s = 1; s <= steps; s += 1) {
      const ratio = s / (steps + 1);

      densified.push({
        time: new Date(t1 + ratio * (t2 - t1)).toISOString(),
        lat: a.lat + (b.lat - a.lat) * ratio,
        lon: a.lon + (b.lon - a.lon) * ratio,
        alt: (a.alt || 0) + ((b.alt || 0) - (a.alt || 0)) * ratio
      });
    }
  }

  densified.push(points[points.length - 1]);
  return densified;
}

function densifyTrackPointsGeodesic(points, maxStepSeconds = 30) {
  if (!Array.isArray(points) || points.length < 2) {
    return points || [];
  }

  const densified = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];

    densified.push(a);

    const t1 = new Date(a.time).getTime();
    const t2 = new Date(b.time).getTime();
    const dtSeconds = (t2 - t1) / 1000;

    if (!Number.isFinite(dtSeconds) || dtSeconds <= maxStepSeconds) {
      continue;
    }

    const startCartographic = Cesium.Cartographic.fromDegrees(a.lon, a.lat);
    const endCartographic = Cesium.Cartographic.fromDegrees(b.lon, b.lat);
    const geodesic = new Cesium.EllipsoidGeodesic(startCartographic, endCartographic);

    const steps = Math.floor(dtSeconds / maxStepSeconds);

    for (let s = 1; s <= steps; s += 1) {
      const ratio = s / (steps + 1);

      const cartographic = geodesic.interpolateUsingFraction(ratio);

      densified.push({
        time: new Date(t1 + ratio * (t2 - t1)).toISOString(),
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lon: Cesium.Math.toDegrees(cartographic.longitude),
        alt: (a.alt || 0) + ((b.alt || 0) - (a.alt || 0)) * ratio
      });
    }
  }

  densified.push(points[points.length - 1]);
  return densified;
}


function inferAircraftType(metadata) {
  const text = ((metadata.title || "") + " " + (metadata.id || "")).toUpperCase();

  if (text.includes("A320")) return "A320";
  if (text.includes("A321")) return "A321";
  if (text.includes("A319")) return "A319";
  if (text.includes("B738") || text.includes("737-800")) return "B738";
  if (text.includes("B739") || text.includes("737-900")) return "B739";
  if (text.includes("B737") || text.includes("737")) return "B737";
  if (text.includes("B752") || text.includes("757-200")) return "B752";
  if (text.includes("B763") || text.includes("767-300")) return "B763";
  if (text.includes("B762") || text.includes("767-200")) return "B762";
  if (text.includes("B777") || text.includes("777")) return "B777";
  if (text.includes("B787") || text.includes("787")) return "B787";
  if (text.includes("C172") || text.includes("CESSNA 172")) return "C172";
  if (text.includes("PC12") || text.includes("PILATUS PC-12")) return "PC12";

  return "";
}

async function loadModelConfig() {
  const [modelsRes, registrationsRes] = await Promise.all([
    fetch("/flight-api/models"),
    fetch("/flight-api/registrations")
  ]);

  const modelsData = await modelsRes.json();
  const registrationsData = await registrationsRes.json();

  if (!modelsRes.ok) {
    throw new Error(modelsData.error || "Could not load model library");
  }

  if (!registrationsRes.ok) {
    throw new Error(registrationsData.error || "Could not load registrations");
  }

  availableModels = modelsData.models || [];
  modelsByAircraftType = {};

  for (const model of availableModels) {
    modelsByAircraftType[model.aircraftType] = model;
  }

  registrationMap = {};

  for (const row of registrationsData.registrations || []) {
    registrationMap[row.registration] = {
      aircraftType: row.aircraftType,
      livery: row.livery || "default"
    };
  }
}


function extractRegistration(metadata) {
  const text = [
    metadata.title || "",
    metadata.id || "",
    metadata.rawFile || "",
    metadata.sourceFilename || ""
  ].join(" ").toUpperCase();

  console.log("[extractRegistration text]", text);

  const match = text.match(/N[0-9A-Z]{2,6}/);
  console.log("[extractRegistration match]", match);

  return match ? match[0] : "";
}


function chooseModelForFlight(metadata) {
  const manualAircraftType = document.getElementById("modelSelect")?.value || "";

  if (manualAircraftType) {
    return modelsByAircraftType[manualAircraftType] || null;
  }

  const registration = extractRegistration(metadata);

  if (registration && registrationMap[registration]) {
    const mappedType = registrationMap[registration].aircraftType;
    if (mappedType && modelsByAircraftType[mappedType]) {
      return modelsByAircraftType[mappedType];
    }
  }

  const inferredType = inferAircraftType(metadata);

  if (inferredType && modelsByAircraftType[inferredType]) {
    return modelsByAircraftType[inferredType];
  }

  return modelsByAircraftType["GENERIC"] || null;
}



function populateModelPicker() {
  const select = document.getElementById("modelSelect");
  if (!select) return;

  select.innerHTML =
    '<option value="">Auto</option>' +
    availableModels.map((model) =>
      '<option value="' + model.aircraftType + '">' + model.label + " (" + model.aircraftType + ")</option>"
    ).join("");
}


function setExportProgress(current, total) {
  const label = document.getElementById("exportProgressLabel");
  const bar = document.getElementById("exportProgressBar");

  if (!label || !bar) return;

  if (!total || total <= 0) {
    label.textContent = "Idle";
    bar.style.width = "0%";
    return;
  }

  const percent = Math.max(0, Math.min(100, (current / total) * 100));
  console.log("[progress]", current, total);

  label.textContent = current + " / " + total + " (" + percent.toFixed(1) + "%)";
  bar.style.width = percent + "%";
}

function setExportProgressMessage(text) {
  const label = document.getElementById("exportProgressLabel");
  if (label) {
    label.textContent = text;
  }
}

function resetExportProgress() {
  const bar = document.getElementById("exportProgressBar");
  const label = document.getElementById("exportProgressLabel");

  if (bar) {
    bar.style.width = "0%";
  }
  if (label) {
    label.textContent = "Idle";
  }
}

function getExportSpeed() {
  return Number(document.getElementById("exportSpeedSelect").value || 1);
}

function getSelectedResolution() {
  const value = document.getElementById("resolutionSelect").value;
  const [width, height] = value.split("x").map(Number);
  return { width, height };
}

function getExportFps() {
  return Number(document.getElementById("exportFps").value || 30);
}

function padFrameNumber(n) {
  return String(n).padStart(4, "0");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(parts[1]);
  const len = binary.length;
  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function setViewerResolution(width, height) {
  const pane = document.getElementById("cesiumPane");
  pane.style.width = width + "px";
  pane.style.height = height + "px";

  if (viewer) {
    viewer.resize();
    viewer.scene.requestRender();
  }
}


    function setStatus(text) {
      document.getElementById("status").textContent = text;
    }

    function escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

function formatJulian(julian) {
  if (!julian) return "--";
  const jsDate = Cesium.JulianDate.toDate(julian);
  return jsDate.toISOString().replace("T", " ").replace("Z", " UTC");
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getTimelineRatio(time) {
  if (!flightStartJulian || !flightStopJulian || !time) return 0;

  const total = Cesium.JulianDate.secondsDifference(flightStopJulian, flightStartJulian);
  if (total <= 0) return 0;

  const elapsed = Cesium.JulianDate.secondsDifference(time, flightStartJulian);
  return clamp01(elapsed / total);
}

function julianFromTimelineRatio(ratio) {
  if (!flightStartJulian || !flightStopJulian) return null;

  const total = Cesium.JulianDate.secondsDifference(flightStopJulian, flightStartJulian);
  const seconds = total * clamp01(ratio);

  return Cesium.JulianDate.addSeconds(
    flightStartJulian,
    seconds,
    new Cesium.JulianDate()
  );
}

function setTimelineElementPosition(element, ratio) {
  const trackHeight = 320;
  const y = (1 - clamp01(ratio)) * trackHeight;
  element.style.top = y + "px";
}

function updateTimelineUI() {
  if (!viewer || !flightStartJulian || !flightStopJulian) return;

  const currentRatio = getTimelineRatio(viewer.clock.currentTime);
  const inRatio = getTimelineRatio(inPointJulian || flightStartJulian);
  const outRatio = getTimelineRatio(outPointJulian || flightStopJulian);

  setTimelineElementPosition(document.getElementById("timelinePlayhead"), currentRatio);
  setTimelineElementPosition(document.getElementById("timelineInMarker"), inRatio);
  setTimelineElementPosition(document.getElementById("timelineOutMarker"), outRatio);

  document.getElementById("currentTimeLabel").textContent = formatJulian(viewer.clock.currentTime);
  document.getElementById("inTimeLabel").textContent = formatJulian(inPointJulian);
  document.getElementById("outTimeLabel").textContent = formatJulian(outPointJulian);
}

function jumpToTime(julian) {
  if (!viewer || !julian) return;
  viewer.clock.currentTime = Cesium.JulianDate.clone(julian);
  viewer.scene.requestRender();
}


function shouldShowModel() {
  const checkbox = document.getElementById("showModel");
  return !!checkbox && checkbox.checked;
}

/////// TIMELINE SETUP
function installTimelineHandlers() {
  const timeline = document.getElementById("verticalTimeline");

  let dragging = false;

  function setTimeFromPointer(clientY) {
    const rect = timeline.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = 1 - clamp01(y / rect.height);
    const newTime = julianFromTimelineRatio(ratio);

    if (newTime && viewer) {
      viewer.clock.currentTime = newTime;
      viewer.scene.requestRender();
      updateTimelineUI();
    }
  }

  timeline.addEventListener("pointerdown", function (event) {
    dragging = true;
    setTimeFromPointer(event.clientY);
  });

  window.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    setTimeFromPointer(event.clientY);
  });

  window.addEventListener("pointerup", function () {
    dragging = false;
  });
}


function installTimelineButtons() {
  document.getElementById("markInButton").addEventListener("click", function () {
    if (!viewer) return;
    inPointJulian = Cesium.JulianDate.clone(viewer.clock.currentTime);
    updateTimelineUI();
  });

  document.getElementById("markOutButton").addEventListener("click", function () {
    if (!viewer) return;
    outPointJulian = Cesium.JulianDate.clone(viewer.clock.currentTime);
    updateTimelineUI();
  });

  document.getElementById("jumpInButton").addEventListener("click", function () {
    jumpToTime(inPointJulian);
  });

  document.getElementById("jumpOutButton").addEventListener("click", function () {
    jumpToTime(outPointJulian);
  });

  document.getElementById("resetRangeButton").addEventListener("click", function () {
    if (!flightStartJulian || !flightStopJulian) return;
    inPointJulian = Cesium.JulianDate.clone(flightStartJulian);
    outPointJulian = Cesium.JulianDate.clone(flightStopJulian);
    updateTimelineUI();
  });
}

function installSidebarToggle() {
  const app = document.getElementById("app");
  const button = document.getElementById("sidebarToggle");

  button.addEventListener("click", function () {
    app.classList.toggle("sidebar-collapsed");
    if (viewer) {
      setTimeout(function () {
        viewer.resize();
      }, 0);
    }
  });
}

// --------------------
// Export / Movie
// --------------------

async function exportFrames() {
  const start = inPointJulian;
  const end = outPointJulian;

  const [w, h] = document
    .getElementById("resolutionSelect")
    .value
    .split("x")
    .map(Number);

  setViewerResolution(w, h);
  viewer.resolutionScale = 2.0;
  viewer.render();

  let time = Cesium.JulianDate.clone(start);

  while (Cesium.JulianDate.lessThanOrEquals(time, end)) {
    viewer.clock.currentTime = time;
    viewer.scene.render();

    const dataUrl = viewer.scene.canvas.toDataURL("image/png");

    // save or send to server
    console.log("frame", dataUrl.substring(0, 50));

    time = Cesium.JulianDate.addSeconds(time, 1, new Cesium.JulianDate());
  }
}

async function startServerExport() {
  const fps = getExportFps();

  const res = await fetch("/flight-api/exports/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: currentProjectId,
      flightId: currentFlightId,
      fps
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Could not start export");
  }

  return data;
}

async function uploadFrameToServer(exportId, frameIndex, utcTime, dataUrl) {
  const imageBase64 = dataUrl.split(",")[1];
  const filename = "frame_" + padFrameNumber(frameIndex) + ".png";

  const res = await fetch("/flight-api/exports/" + encodeURIComponent(exportId) + "/frame", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: currentProjectId,
      flightId: currentFlightId,
      frame: frameIndex,
      filename,
      utcTime,
      imageBase64
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to upload frame");
  }
}

async function finishServerExport(exportId) {
  const fps = getExportFps();

  const res = await fetch("/flight-api/exports/" + encodeURIComponent(exportId) + "/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: currentProjectId,
      flightId: currentFlightId,
      fps
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to start movie build");
  }

  return data;
}


async function exportFramesFromRange() {
  if (!viewer || !inPointJulian || !outPointJulian) {
    setStatus("Set In and Out points first.");
    return;
  }

  const fps = getExportFps();
  const exportSpeed = getExportSpeed();
  const frameStepSeconds = exportSpeed / fps;
  const { width, height } = getSelectedResolution();
  const totalSeconds = Cesium.JulianDate.secondsDifference(outPointJulian, inPointJulian);
  const totalFrames = Math.floor(totalSeconds / frameStepSeconds) + 1;

  const savedTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
  const savedShouldAnimate = viewer.clock.shouldAnimate;

  resetExportProgress();
  setStatus("Starting export...");
  viewer.clock.shouldAnimate = false;
console.log("[export] loop start");

  const exportSession = await startServerExport();

  setViewerResolution(width, height);
  await sleep(100);

  let frameIndex = 1;
  let time = Cesium.JulianDate.clone(inPointJulian);

  while (Cesium.JulianDate.lessThanOrEquals(time, outPointJulian)) {
    viewer.clock.currentTime = Cesium.JulianDate.clone(time);
    viewer.scene.requestRender();
    viewer.render();

    await sleep(50);

    const dataUrl = viewer.scene.canvas.toDataURL("image/png");
    await uploadFrameToServer(
      exportSession.exportId,
      frameIndex,
      Cesium.JulianDate.toIso8601(time),
      dataUrl
    );

    setStatus("Uploaded frame " + frameIndex + "...");
    frameIndex += 1;
console.log("[export] frame", frameIndex);
setExportProgress(frameIndex, totalFrames);

    time = Cesium.JulianDate.addSeconds(
      time,
      frameStepSeconds,
      new Cesium.JulianDate()
    );
  }

  await finishServerExport(exportSession.exportId);

  setExportProgressMessage("Encoding movie...");
  setStatus("Encoding movie...");

  const finished = await pollExportStatus(exportSession.exportId);

  viewer.clock.currentTime = savedTime;
  viewer.clock.shouldAnimate = savedShouldAnimate;
  viewer.scene.requestRender();

  setExportProgress(totalFrames, totalFrames);
  setExportProgressMessage("Done");
  setStatus("Movie ready: " + finished.movieUrl);

  window.open(finished.movieUrl, "_blank");
}

async function pollExportStatus(exportId) {
  while (true) {
    const url =
      "/flight-api/exports/" +
      encodeURIComponent(exportId) +
      "/status?projectId=" +
      encodeURIComponent(currentProjectId) +
      "&flightId=" +
      encodeURIComponent(currentFlightId);

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to poll export status");
    }

    if (data.state === "done") {
      return data;
    }

    if (data.state === "failed") {
      throw new Error(data.error || "Movie export failed");
    }

    setExportProgressMessage(
      data.state === "encoding"
        ? "Encoding movie..."
        : "Preparing export..."
    );

    await sleep(1000);
  }
}


/*
async function exportFramesFromRange() {
  if (!viewer || !inPointJulian || !outPointJulian) {
    setStatus("Set In and Out points first.");
    return;
  }

  const fps = getExportFps();
  const exportSpeed = getExportSpeed();
  const frameStepSeconds = exportSpeed / fps;
  const { width, height } = getSelectedResolution();

  const savedTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
  const savedShouldAnimate = viewer.clock.shouldAnimate;

  setStatus("Preparing export...");
  viewer.clock.shouldAnimate = false;

  setViewerResolution(width, height);
  await sleep(100);

  const manifest = [];
  let frameIndex = 1;
  let time = Cesium.JulianDate.clone(inPointJulian);

  while (Cesium.JulianDate.lessThanOrEquals(time, outPointJulian)) {
    viewer.clock.currentTime = Cesium.JulianDate.clone(time);
    viewer.scene.requestRender();
    viewer.render();

    await sleep(50);

    const dataUrl = viewer.scene.canvas.toDataURL("image/png");
    const blob = dataUrlToBlob(dataUrl);
    const filename = "frame_" + padFrameNumber(frameIndex) + ".png";

    downloadBlob(blob, filename);

    manifest.push({
      frame: frameIndex,
      filename: filename,
      utcTime: Cesium.JulianDate.toIso8601(time)
    });

    frameIndex += 1;
    time = Cesium.JulianDate.addSeconds(
      time,
      frameStepSeconds,
      new Cesium.JulianDate()
    );
  }

  const manifestBlob = new Blob(
    [JSON.stringify(manifest, null, 2)],
    { type: "application/json" }
  );
  downloadBlob(manifestBlob, "frames_manifest.json");

  viewer.clock.currentTime = savedTime;
  viewer.clock.shouldAnimate = savedShouldAnimate;
  viewer.scene.requestRender();

  setStatus("Exported " + manifest.length + " frame(s).");
}
*/

// --------------------
// Camera Views
// --------------------

function getModelScaleMultiplierForCameraMode() {
  if (cameraMode === "overview" || cameraMode === "follow" || cameraMode === "chase") {
    return 500;
  }

  return 1;
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
        150000
      )
    );
  };

  viewer.scene.preRender.addEventListener(followHandler);
}

function setChaseCamera() {
  if (!viewer || !currentEntity) {
    return;
  }

  removeFollowMode();

  followHandler = function () {
    const currentTime = viewer.clock.currentTime;
    const position = currentEntity.position.getValue(currentTime);

    if (!position) {
      return;
    }

    const nextTime = Cesium.JulianDate.addSeconds(
      currentTime,
      10,
      new Cesium.JulianDate()
    );
    const nextPosition = currentEntity.position.getValue(nextTime);

    let heading = 0;

    if (nextPosition) {
      const currentCarto = Cesium.Cartographic.fromCartesian(position);
      const nextCarto = Cesium.Cartographic.fromCartesian(nextPosition);

      const dLon = nextCarto.longitude - currentCarto.longitude;
      const dLat = nextCarto.latitude - currentCarto.latitude;

      heading = Math.atan2(dLon, dLat);
    }

    viewer.camera.lookAt(
      position,
      new Cesium.HeadingPitchRange(
        heading,
        Cesium.Math.toRadians(-35),
        50000
      )
    );
  };

  viewer.scene.preRender.addEventListener(followHandler);
}

function setLeadCamera() {
  if (!viewer || !currentEntity) {
    return;
  }

  removeFollowMode();

  followHandler = function () {
    const currentTime = viewer.clock.currentTime;

    const position = currentEntity.position.getValue(currentTime);
    if (!position) return;

    const leadTime = Cesium.JulianDate.addSeconds(
      currentTime,
      20,
      new Cesium.JulianDate()
    );

    const leadPosition = currentEntity.position.getValue(leadTime);

    if (!leadPosition) return;

    // Compute heading (direction of travel)
    const currentCarto = Cesium.Cartographic.fromCartesian(position);
    const leadCarto = Cesium.Cartographic.fromCartesian(leadPosition);

    const dLon = leadCarto.longitude - currentCarto.longitude;
    const dLat = leadCarto.latitude - currentCarto.latitude;

    const heading = Math.atan2(dLon, dLat);

    // Place camera at lead position, looking back toward aircraft
    viewer.camera.lookAt(
      leadPosition,
      new Cesium.HeadingPitchRange(
        heading, //Looks forward  + Math.PI, // turn around to look back
        Cesium.Math.toRadians(-20),
        10
      )
    );
  };

  viewer.scene.preRender.addEventListener(followHandler);
}

function setSideCamera() {
  if (!viewer || !currentEntity) {
    return;
  }

  removeFollowMode();

  followHandler = function () {
    const position = currentEntity.position.getValue(viewer.clock.currentTime);
    const orientation =
      currentEntity.orientation &&
      currentEntity.orientation.getValue(viewer.clock.currentTime);

    if (!position || !orientation) {
      return;
    }

    const rotation = Cesium.Matrix3.fromQuaternion(orientation);
    const bodyTransform = Cesium.Matrix4.fromRotationTranslation(rotation, position);

    // +Y = one side of aircraft body frame. Use -250 for the opposite side.
    const offset = new Cesium.Cartesian3(-23, 50, 12);

    const cameraPosition = Cesium.Matrix4.multiplyByPoint(
      bodyTransform,
      offset,
      new Cesium.Cartesian3()
    );

    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(position, cameraPosition, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const up = Cesium.Matrix4.multiplyByPointAsVector(
      enu,
      Cesium.Cartesian3.UNIT_Z,
      new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(up, up);

    viewer.camera.setView({
      destination: cameraPosition,
      orientation: {
        direction,
        up
      }
    });
  };

  viewer.scene.preRender.addEventListener(followHandler);
}


function setTailCamera() {
  if (!viewer || !currentEntity) {
    return;
  }

  removeFollowMode();

  followHandler = function () {
    const position = currentEntity.position.getValue(viewer.clock.currentTime);
    const orientation = currentEntity.orientation && currentEntity.orientation.getValue(viewer.clock.currentTime);

    if (!position || !orientation) {
      return;
    }

    const rotation = Cesium.Matrix3.fromQuaternion(orientation);
    const transform = Cesium.Matrix4.fromRotationTranslation(rotation, position);

    const offset = new Cesium.Cartesian3(-30, 2, 9);
    const cameraPosition = Cesium.Matrix4.multiplyByPoint(
      transform,
      offset,
      new Cesium.Cartesian3()
    );

    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(position, cameraPosition, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    const localUp = Cesium.Matrix4.multiplyByPointAsVector(
      transform,
      Cesium.Cartesian3.UNIT_Z,
      new Cesium.Cartesian3()
    );
    Cesium.Cartesian3.normalize(localUp, localUp);

    viewer.camera.setView({
      destination: cameraPosition,
      orientation: {
        direction: direction,
        up: localUp
      }
    });
  };

  viewer.scene.preRender.addEventListener(followHandler);
}



function getAircraftModelUri(metadata) {
//  return "/models/Cesium_Air.glb";
  return "/models/a320/glTF2/A320.glb";
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
  } else if (cameraMode === "chase") {
    setChaseCamera();
  } else if (cameraMode === "lead") {
    setLeadCamera();
  } else if (cameraMode === "side") {
    setSideCamera();
  } else if (cameraMode === "tail") {
    setTailCamera();
  } else {
    setOverviewCamera();
  }
}

////////////////////////////
/////////  LOADERs /////////
////////////////////////////


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

    async function loadAvailableModels() {
      const res = await fetch("/flight-api/models");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not load model library");
      }

      availableModels = data.models || [];
      modelsByAircraftType = {};

      for (const model of availableModels) {
        modelsByAircraftType[model.aircraftType] = model;
      }
    }




////////////////////////////////
/////////// VIEWER /////////////
////////////////////////////////


function initViewer() {
  if (viewer) {
    return;
  }

  try {
    const container = document.getElementById("cesiumContainer");
    console.log("cesiumContainer exists?", !!container);

    Cesium.Ion.defaultAccessToken = "${cesiumToken}";

viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  contextOptions: {
    webgl: {
      preserveDrawingBuffer: true
    }
  }
});

setTimeout(async function () {
  await applyBasemap(currentBasemap);
}, 0);
//    viewer.scene.requestRenderMode = false;

if (!viewer.__timelineUpdaterInstalled) {
  viewer.__timelineUpdaterInstalled = true;

  viewer.scene.postRender.addEventListener(function () {
    updateTimelineUI();
  });
}


viewer.scene.light = new Cesium.SunLight({
  color: Cesium.Color.WHITE,
  intensity: 3.0
});
viewer.scene.globe.enableLighting = true;
viewer.scene.skyAtmosphere.show = true;
viewer.scene.globe.showGroundAtmosphere = true;
viewer.shadows = true;
viewer.scene.shadowMap.enabled = true;
viewer.scene.shadowMap.softShadows = true;
viewer.scene.moon.show = true;
viewer.scene.sun.show = true;
viewer.scene.skyBox.show = true;
viewer.scene.skyAtmosphere.show = true;

    console.log("viewer initialized", viewer);
setTimeout(function () {
  viewer.resize();
}, 0);
  } catch (err) {
    console.error("initViewer failed", err);
    viewer = null;
  }
}



async function renderFlight(projectId, flightId, preserveTime) {
  setStatus("Loading flight...");

  const metadata = await loadFlightMetadata(projectId, flightId);
  const track = await loadTrack(projectId, flightId);

console.log("[model picker] selected", document.getElementById("modelSelect")?.value);
  const selectedModel = chooseModelForFlight(metadata);
console.log("[registration]", extractRegistration(metadata));
console.log("[selected model]", selectedModel);
  if (!userHasManuallySelectedModel && selectedModel && selectedModel.aircraftType) {
    const modelSelect = document.getElementById("modelSelect");

    if (modelSelect && !modelSelect.value) {
      modelSelect.value = selectedModel.aircraftType;
    }
  }


  const modelUri = shouldShowModel() && selectedModel ? selectedModel.uri : null;

  const modelScale = selectedModel ? selectedModel.scale : 20;
  const effectiveModelScale = modelScale * getModelScaleMultiplierForCameraMode();
  const headingOffsetDeg = selectedModel ? selectedModel.headingOffsetDeg : 0;
console.log("[model chosen]", selectedModel);

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
  currentTrackEntity = null;
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

  const animationPoints = densifyTrackPointsGeodesic(points, 30);
  const positionProperty = new Cesium.SampledPositionProperty();

  for (const point of animationPoints) {
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

  currentTrackEntity = viewer.entities.add({
    polyline: {
      positions: polylinePositions,
      width: 2,
      material: Cesium.Color.CYAN,
      arcType: Cesium.ArcType.GEODESIC
    }
  });

const showTrackCheckbox = document.getElementById("showTrackLine");
currentTrackEntity.show = !showTrackCheckbox || showTrackCheckbox.checked;

const boundingSphere = Cesium.BoundingSphere.fromPoints(polylinePositions);
currentBoundingSphere = Cesium.BoundingSphere.fromPoints(polylinePositions);

  const start = Cesium.JulianDate.fromIso8601(points[0].time);
  const stop = Cesium.JulianDate.fromIso8601(points[points.length - 1].time);
  const restoredTime =
  preserveTime &&
  Cesium.JulianDate.greaterThanOrEquals(preserveTime, start) &&
  Cesium.JulianDate.lessThanOrEquals(preserveTime, stop)
    ? preserveTime
    : start.clone();

viewer.clock.currentTime = restoredTime;

flightStartJulian = start.clone();
flightStopJulian = stop.clone();
inPointJulian = start.clone();
outPointJulian = stop.clone();


  viewer.clock.startTime = start.clone();
  viewer.clock.stopTime = stop.clone();
  viewer.clock.currentTime = restoredTime;
  viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
  viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  viewer.clock.multiplier = 100;
  viewer.clock.shouldAnimate = true;

if (viewer.timeline) {
  viewer.timeline.zoomTo(start, stop);
}


//const modelUri = shouldShowModel() ? getAircraftModelUri(metadata) : null;
console.log("[model] uri", modelUri);

const velocityOrientation = new Cesium.VelocityOrientationProperty(positionProperty);

const entity = viewer.entities.add({
  availability: new Cesium.TimeIntervalCollection([
    new Cesium.TimeInterval({ start: start, stop: stop })
  ]),
  position: positionProperty,
  orientation: new Cesium.CallbackProperty(function (time, result) {
    const position = positionProperty.getValue(time);
    if (!position) {
      return result;
    }

const nextTime = Cesium.JulianDate.addSeconds(
      time,
      1,
      new Cesium.JulianDate()
    );
    const nextPosition = positionProperty.getValue(nextTime);

    if (!nextPosition) {
      return result;
    }

    const currentCarto = Cesium.Cartographic.fromCartesian(position);
    const nextCarto = Cesium.Cartographic.fromCartesian(nextPosition);

    const dLon = nextCarto.longitude - currentCarto.longitude;
    const dLat = nextCarto.latitude - currentCarto.latitude;

    const heading = Math.atan2(dLon, dLat);

    return Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(
        heading + Cesium.Math.toRadians(headingOffsetDeg), // keep your 90° model correction
        0,
        0
      ),
      Cesium.Ellipsoid.WGS84,
      Cesium.Transforms.eastNorthUpToFixedFrame,
      result || new Cesium.Quaternion()
    );
  }, false),
    model: modelUri ? {
    uri: modelUri,
    minimumPixelSize: 128,
    maximumScale: 100000,
    scale: effectiveModelScale,
    runAnimations: false,
    //silhouetteColor: Cesium.Color.BLACK,
    //silhouetteSize: 1,
    shadows: Cesium.ShadowMode.ENABLED
  } : undefined,
  point: modelUri ? {
      show: false
  } : {
    pixelSize: 8,
    color: Cesium.Color.RED
  },
  path: {
    show: true,
    resolution: 30,
    leadTime: 0,
    trailTime: 1000000,
    width: 3,
    material: Cesium.Color.YELLOW
  },
  description: metadata.title || metadata.id
});

console.log("[model] entity created", entity);
console.log("[model] graphics", entity.model);

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
updateTimelineUI();

  setStatus("Loaded.");
}



    async function loadCurrentFlight(preserveTime) {
      currentProjectId = document.getElementById("projectSelect").value;
      currentFlightId = document.getElementById("flightSelect").value;

      if (!currentProjectId || !currentFlightId) {
        setStatus("Choose a project and flight.");
        return;
      }

      try {
        await renderFlight(currentProjectId, currentFlightId, preserveTime);
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

    document.getElementById("showTrackLine").addEventListener("change", function (event) {
      if (currentTrackEntity) {
        currentTrackEntity.show = event.target.checked;
      }
    });

    document.getElementById("resolutionSelect").addEventListener("change", function (e) {
      const [w, h] = e.target.value.split("x").map(Number);
      setViewerResolution(w, h);
    });

    document.getElementById("modelSelect").addEventListener("change", async function () {
      userHasManuallySelectedModel = true;
      if (currentProjectId && currentFlightId && viewer) {
        const savedTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
        await loadCurrentFlight(savedTime);
      }
    });

    document.getElementById("loadButton").addEventListener("click", async () => {
      await loadCurrentFlight();
    });

    document.getElementById("exportFramesButton").addEventListener("click", async function () {
      try {
        await exportFramesFromRange();
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Frame export failed.");
      }
    });

    document.getElementById("basemapSelect").addEventListener("change", async function (event) {
      applyBasemap(event.target.value);
    });

    async function init() {
      try {
installSidebarToggle();
installTimelineHandlers();
installTimelineButtons();

        await loadProjects();
        await loadFlights(currentProjectId);
//        await loadAvailableModels();
        await loadModelConfig();
        populateModelPicker();
        await populateModelPicker();
        if (currentProjectId && currentFlightId) {
          await loadCurrentFlight();
        } else {
          setStatus("Choose a flight and click Load Flight.");
        }
        document.getElementById("basemapSelect").value = currentBasemap;
      } catch (err) {
        console.error(err);
        setStatus(err.message || "Could not initialize viewer.");
      }
    }

    init();
  </script>
</body>
</html>`;
}

module.exports = {
  viewerPage,
};
