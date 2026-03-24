function adminPage() {
  return `<!doctype html>
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
            <button class="appendButton" data-flight-id="\${flight.id}" type="button">Append KML</button>
            <button class="deleteFlightButton" data-flight-id="\${flight.id}" type="button">Delete Flight</button>
          </div>
        </div>
      \`).join("");
    container.querySelectorAll(".appendButton").forEach((button) => {
  button.addEventListener("click", async function () {
    const flightId = button.getAttribute("data-flight-id");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".kml";
    fileInput.multiple = true;

    fileInput.addEventListener("change", async function () {
      if (!fileInput.files || fileInput.files.length === 0) {
        return;
      }

      const formData = new FormData();
      for (const file of fileInput.files) {
        formData.append("kmlFiles", file);
      }

      const uploadMessage = document.getElementById("uploadMessage");
      uploadMessage.className = "";
      uploadMessage.textContent = "Appending KML...";

      const res = await fetch(
        "/flight-api/projects/" +
          encodeURIComponent(projectId) +
          "/flights/" +
          encodeURIComponent(flightId) +
          "/append",
        {
          method: "POST",
          body: formData
        }
      );

      const result = await res.json();

      if (!res.ok) {
        uploadMessage.className = "error";
        uploadMessage.textContent = result.error || "Append failed.";
        return;
      }

      uploadMessage.className = "success";
      uploadMessage.textContent =
        "Appended " +
        result.appendedPoints +
        " point(s). Total points: " +
        result.totalPoints;

      await loadFlights(projectId);
    });

    fileInput.click();
  });
});

container.querySelectorAll(".deleteFlightButton").forEach((button) => {
  button.addEventListener("click", async function () {
    const flightId = button.getAttribute("data-flight-id");

    const confirmed = window.confirm("Delete flight " + flightId + "?");
    if (!confirmed) {
      return;
    }

    const uploadMessage = document.getElementById("uploadMessage");
    uploadMessage.className = "";
    uploadMessage.textContent = "Deleting flight...";

    const res = await fetch(
      "/flight-api/projects/" +
        encodeURIComponent(projectId) +
        "/flights/" +
        encodeURIComponent(flightId),
      {
        method: "DELETE"
      }
    );

    const result = await res.json();

    if (!res.ok) {
      uploadMessage.className = "error";
      uploadMessage.textContent = result.error || "Delete failed.";
      return;
    }

    uploadMessage.className = "success";
    uploadMessage.textContent = "Deleted flight " + flightId + ".";

    await loadFlights(projectId);
  });
});

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
</html>`;
}

module.exports = {
  adminPage
};
