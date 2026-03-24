const fs = require("fs");
const fsp = require("fs/promises");
const { parse } = require("csv-parse/sync");

const REGISTRATIONS_CSV = "/opt/flight-library/app/data/registrations.csv";

function toBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

async function loadRegistrationLibrary() {
  if (!fs.existsSync(REGISTRATIONS_CSV)) {
    return [];
  }

  const csvText = await fsp.readFile(REGISTRATIONS_CSV, "utf8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  return rows
    .map((row) => ({
      registration: (row.registration || "").trim().toUpperCase(),
      aircraftType: (row.aircraftType || "").trim().toUpperCase(),
      livery: (row.livery || "default").trim().toLowerCase(),
      enabled: toBoolean(row.enabled, true)
    }))
    .filter((row) => row.registration && row.aircraftType && row.enabled);
}

module.exports = {
  loadRegistrationLibrary
};
