const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const AIRPORTS_CSV = path.join(__dirname, "../data/airports.csv");

let cachedAirports = null;

function loadAirports() {
  if (cachedAirports) return cachedAirports;

  if (!fs.existsSync(AIRPORTS_CSV)) {
    return [];
  }

  const csvText = fs.readFileSync(AIRPORTS_CSV, "utf8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    quote: false,
    relax_column_count: true
  });

  cachedAirports = rows
    .map((r) => ({
      name: (r.Name || "").trim(),
      lat: parseFloat(r.Latitude),
      lon: parseFloat(r.Longitude),
      elevationFt: parseFloat(r["Elevation (ft)"]) || 0,
      iata: (r["IATA-Code"] || "").trim(),
      icao: (r["GPS-Code"] || "").trim(),
      type: (r.Type || "").trim()
    }))
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon));

  return cachedAirports;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findAirportsNear(lat, lon, radiusKm = 15) {
  const airports = loadAirports();
  const results = [];

  // Fast bounding-box pre-filter before running haversine
  const latDelta = radiusKm / 111.32;
  const lonDelta =
    radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  for (const airport of airports) {
    if (
      Math.abs(airport.lat - lat) > latDelta ||
      Math.abs(airport.lon - lon) > lonDelta
    ) {
      continue;
    }
    const dist = haversineKm(lat, lon, airport.lat, airport.lon);
    if (dist <= radiusKm) {
      results.push({ ...airport, distanceKm: dist });
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

module.exports = { findAirportsNear };
