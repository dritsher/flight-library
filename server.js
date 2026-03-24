require("dotenv").config();

const express = require("express");
const { ensureDir, PROJECTS_DIR, TEMP_DIR, EXPORTS_DIR } = require("./services/storage");
const apiRoutes = require("./routes/api");
const pageRoutes = require("./routes/pages");

const app = express();
const PORT = 3002;

app.use(express.json({ limit: "200mb" }));
app.use("/models", express.static("/opt/flight-library/app/public/models"));
app.use("/exports", express.static("/opt/flight-library/exports"));
app.use(apiRoutes);
app.use(pageRoutes);

app.listen(PORT, async () => {
  await ensureDir(PROJECTS_DIR);
  await ensureDir(TEMP_DIR);
  await ensureDir(EXPORTS_DIR);
  console.log("Flight Library running on http://127.0.0.1:" + PORT);
});
