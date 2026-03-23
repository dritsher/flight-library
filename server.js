require("dotenv").config();

const express = require("express");
const { ensureDir, PROJECTS_DIR, TEMP_DIR } = require("./services/storage");
const apiRoutes = require("./routes/api");
const pageRoutes = require("./routes/pages");

const app = express();
const PORT = 3002;

app.use(express.json());
app.use("/models", express.static("/opt/flight-library/app/public/models"));
app.use(apiRoutes);
app.use(pageRoutes);

app.listen(PORT, async () => {
  await ensureDir(PROJECTS_DIR);
  await ensureDir(TEMP_DIR);
  console.log("Flight Library running on http://127.0.0.1:" + PORT);
});
