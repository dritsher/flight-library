const fs = require("fs");
const fsp = require("fs/promises");
const { parse } = require("csv-parse/sync");

const MODEL_LIBRARY_CSV = "/opt/flight-library/app/data/aircraft_model_library.csv";

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

async function loadModelLibrary() {
  if (!fs.existsSync(MODEL_LIBRARY_CSV)) {
    return [];
  }

  const csvText = await fsp.readFile(MODEL_LIBRARY_CSV, "utf8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return rows
    .map((row) => ({
      modelKey: (row.modelKey || "").trim(),
      aircraftType: (row.aircraftType || "").trim().toUpperCase(),
      key: (row.aircraftType || "").trim().toUpperCase(), // convenient alias for frontend
      label: (row.label || row.aircraftType || row.modelKey || "").trim(),
      uri: (row.uri || "").trim(),
      livery: (row.livery || "default").trim().toLowerCase(),
      category: (row.category || "").trim().toLowerCase(),
      scale: toNumber(row.scale, 20),
      headingOffsetDeg: toNumber(row.headingOffsetDeg, 0),
      enabled: toBoolean(row.enabled, true),
      notes: (row.notes || "").trim()
    }))
    .filter((row) => row.aircraftType && row.uri && row.enabled);
}

module.exports = {
  loadModelLibrary
};
