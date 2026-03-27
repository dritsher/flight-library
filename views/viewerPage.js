const fs = require("fs");
const path = require("path");

function viewerPage({ cesiumToken = "", maptilerApiKey = "" } = {}) {
    const template = fs.readFileSync(path.join(__dirname, "viewer.html"), "utf8");
    const configScript = `<script>window.__config = ${JSON.stringify({ cesiumToken, maptilerApiKey })};</script>`;
    return template.replace("<!-- CONFIG_PLACEHOLDER -->", configScript);
}

module.exports = { viewerPage };
