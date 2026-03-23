const { XMLParser } = require("fast-xml-parser");

function ensureArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function deepFindAll(obj, keyName, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (Object.prototype.hasOwnProperty.call(obj, keyName)) {
    results.push(obj[keyName]);
  }

  for (const key of Object.keys(obj)) {
    deepFindAll(obj[key], keyName, results);
  }

  return results;
}

function firstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseWhenValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseCoordTriple(text) {
  if (typeof text !== "string") return null;
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  const alt = parts.length >= 3 ? Number(parts[2]) : 0;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    lat,
    lon,
    alt: Number.isFinite(alt) ? alt : 0
  };
}

function parseCoordinateString(text) {
  if (typeof text !== "string") return [];
  return text
    .trim()
    .split(/\s+/)
    .map((chunk) => {
      const parts = chunk.split(",");
      if (parts.length < 2) return null;

      const lon = Number(parts[0]);
      const lat = Number(parts[1]);
      const alt = parts.length >= 3 ? Number(parts[2]) : 0;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : 0
      };
    })
    .filter(Boolean);
}

function synthesizeTimes(points, startTime) {
  const base = startTime ? new Date(startTime) : new Date();
  return points.map((point, index) => {
    const time = new Date(base.getTime() + index * 5000).toISOString();
    return {
      time,
      lat: point.lat,
      lon: point.lon,
      alt: point.alt
    };
  });
}

function parseKmlContent(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    trimValues: true
  });

  const parsed = parser.parse(xmlText);

  const names = deepFindAll(parsed, "name").flatMap((v) => ensureArray(v));
  const title = firstNonEmptyString(names);

  const gxTracks = deepFindAll(parsed, "gx:Track").flatMap((v) => ensureArray(v));
  if (gxTracks.length > 0) {
    const allPoints = [];

    for (const track of gxTracks) {
      const rawWhenValues = ensureArray(track.when);
      const rawCoordValues = ensureArray(track["gx:coord"]);

      const whenValues = rawWhenValues.map(parseWhenValue);
      const coordValues = rawCoordValues.map(parseCoordTriple);

      const count = Math.min(whenValues.length, coordValues.length);

      for (let i = 0; i < count; i += 1) {
        const time = whenValues[i];
        const coord = coordValues[i];

        if (!time || !coord) continue;

        allPoints.push({
          time,
          lat: coord.lat,
          lon: coord.lon,
          alt: coord.alt
        });
      }
    }

    if (allPoints.length > 0) {
      allPoints.sort((a, b) => new Date(a.time) - new Date(b.time));

      const deduped = [];
      let lastKey = null;

      for (const point of allPoints) {
        const key = point.time + "|" + point.lat + "|" + point.lon + "|" + point.alt;
        if (key !== lastKey) {
          deduped.push(point);
          lastKey = key;
        }
      }

      return {
        title,
        points: deduped,
        timeMode: "source"
      };
    }
  }

  const lineStrings = deepFindAll(parsed, "LineString").flatMap((v) => ensureArray(v));
  for (const lineString of lineStrings) {
    if (lineString && typeof lineString.coordinates === "string") {
      const coords = parseCoordinateString(lineString.coordinates);
      if (coords.length > 0) {
        return {
          title,
          points: synthesizeTimes(coords),
          timeMode: "synthetic_5s"
        };
      }
    }
  }

  const coordinateBlocks = deepFindAll(parsed, "coordinates").flatMap((v) => ensureArray(v));
  for (const block of coordinateBlocks) {
    if (typeof block === "string") {
      const coords = parseCoordinateString(block);
      if (coords.length > 0) {
        return {
          title,
          points: synthesizeTimes(coords),
          timeMode: "synthetic_5s"
        };
      }
    }
  }

  throw new Error("Could not find supported track data in KML");
}

module.exports = {
  parseKmlContent
};
