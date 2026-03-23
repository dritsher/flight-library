function viewerPage({ cesiumToken = "" } = {}) {
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

<label>
  <input type="checkbox" id="showModel" checked>
  Show aircraft model
</label>
<label for="cameraMode">Camera mode</label>
<select id="cameraMode">
  <option value="overview">Overview</option>
  <option value="follow">Follow</option>
  <option value="chase">Chase</option>
  <option value="lead">Lead</option>
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

document.getElementById("showModel").addEventListener("change", async function () {
  if (currentProjectId && currentFlightId && viewer) {
    const savedTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
    await loadCurrentFlight(savedTime);
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

function shouldShowModel() {
  const checkbox = document.getElementById("showModel");
  return !!checkbox && checkbox.checked;
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
        500000
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



async function renderFlight(projectId, flightId, preserveTime) {
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
      (point.alt || 0) + 1000
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
  viewer.clock.currentTime = preserveTime || start.clone();
  viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
  viewer.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  viewer.clock.multiplier = 100;
  viewer.clock.shouldAnimate = true;

if (viewer.timeline) {
  viewer.timeline.zoomTo(start, stop);
}


const modelUri = shouldShowModel() ? getAircraftModelUri(metadata) : null;
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
        heading + Cesium.Math.toRadians(0), // keep your 90° model correction
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
    scale: 20,
    runAnimations: false
  } : undefined,
  point: modelUri ? {
      show: false
  } : {
    pixelSize: 8,
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
</html>`;
}

module.exports = {
  viewerPage
};
