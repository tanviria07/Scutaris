import type { OrbitClass, SatelliteObject } from "@/lib/types/orbital";
import type { KeplerianElements } from "@/lib/orbital/propagate";
import { meanAltitudeKm, propagateCircular } from "@/lib/orbital/propagate";
import { SIM_EPOCH_ISO, SIM_EPOCH_MS } from "./rng";

/**
 * Hand-written catalogue of real, well-known objects.
 *
 * NORAD ids and orbital regimes are real so the scene is recognisable (the ISS
 * at 25544 is the golden-query asset), but the element sets are representative
 * MVP values, not live CelesTrak data. Phase 2 replaces this wholesale with
 * `GET /objects`, so nothing here is load-bearing beyond shape and plausibility.
 */

interface SatelliteSeed {
  norad_id: string;
  name: string;
  operator: string;
  elements: Omit<KeplerianElements, "epochMs">;
}

const SATELLITE_SEEDS: readonly SatelliteSeed[] = [
  {
    norad_id: "25544",
    name: "ISS (ZARYA)",
    operator: "NASA / Roscosmos / ESA",
    elements: {
      meanMotion: 15.5,
      eccentricity: 0.0006,
      inclinationDeg: 51.64,
      raanDeg: 102.3,
      argPerigeeDeg: 88.2,
      meanAnomalyDeg: 271.9,
    },
  },
  {
    norad_id: "48274",
    name: "CSS (TIANHE)",
    operator: "CMSA",
    elements: {
      meanMotion: 15.62,
      eccentricity: 0.0005,
      inclinationDeg: 41.47,
      raanDeg: 14.8,
      argPerigeeDeg: 201.4,
      meanAnomalyDeg: 158.6,
    },
  },
  {
    norad_id: "20580",
    name: "HST (HUBBLE)",
    operator: "NASA / ESA",
    elements: {
      meanMotion: 15.09,
      eccentricity: 0.0003,
      inclinationDeg: 28.47,
      raanDeg: 233.1,
      argPerigeeDeg: 45.9,
      meanAnomalyDeg: 314.2,
    },
  },
  {
    norad_id: "40697",
    name: "SENTINEL-2A",
    operator: "ESA / Copernicus",
    elements: {
      meanMotion: 14.31,
      eccentricity: 0.0001,
      inclinationDeg: 98.57,
      raanDeg: 341.2,
      argPerigeeDeg: 90.1,
      meanAnomalyDeg: 270.0,
    },
  },
  {
    norad_id: "43013",
    name: "NOAA 20 (JPSS-1)",
    operator: "NOAA",
    elements: {
      meanMotion: 14.19,
      eccentricity: 0.0002,
      inclinationDeg: 98.74,
      raanDeg: 188.6,
      argPerigeeDeg: 112.7,
      meanAnomalyDeg: 247.5,
    },
  },
  {
    norad_id: "44713",
    name: "STARLINK-1007",
    operator: "SpaceX",
    elements: {
      meanMotion: 15.06,
      eccentricity: 0.0001,
      inclinationDeg: 53.05,
      raanDeg: 76.4,
      argPerigeeDeg: 68.3,
      meanAnomalyDeg: 291.8,
    },
  },
  {
    norad_id: "53807",
    name: "STARLINK-4682",
    operator: "SpaceX",
    elements: {
      meanMotion: 15.12,
      eccentricity: 0.0002,
      inclinationDeg: 53.22,
      raanDeg: 210.9,
      argPerigeeDeg: 22.6,
      meanAnomalyDeg: 337.7,
    },
  },
  {
    norad_id: "39084",
    name: "LANDSAT 8",
    operator: "NASA / USGS",
    elements: {
      meanMotion: 14.57,
      eccentricity: 0.0001,
      inclinationDeg: 98.22,
      raanDeg: 55.3,
      argPerigeeDeg: 88.9,
      meanAnomalyDeg: 271.3,
    },
  },
  {
    norad_id: "27424",
    name: "AQUA",
    operator: "NASA",
    elements: {
      meanMotion: 14.57,
      eccentricity: 0.0002,
      inclinationDeg: 98.21,
      raanDeg: 122.7,
      argPerigeeDeg: 76.4,
      meanAnomalyDeg: 283.9,
    },
  },
  {
    norad_id: "25994",
    name: "TERRA",
    operator: "NASA",
    elements: {
      meanMotion: 14.57,
      eccentricity: 0.0001,
      inclinationDeg: 98.19,
      raanDeg: 301.5,
      argPerigeeDeg: 94.2,
      meanAnomalyDeg: 265.9,
    },
  },
  {
    norad_id: "28474",
    name: "GPS BIIR-11 (PRN 19)",
    operator: "US Space Force",
    elements: {
      meanMotion: 2.0057,
      eccentricity: 0.0121,
      inclinationDeg: 55.42,
      raanDeg: 27.8,
      argPerigeeDeg: 231.6,
      meanAnomalyDeg: 127.4,
    },
  },
  {
    norad_id: "40534",
    name: "GALILEO 8 (GSAT-0208)",
    operator: "ESA / EUSPA",
    elements: {
      meanMotion: 1.7047,
      eccentricity: 0.0002,
      inclinationDeg: 56.31,
      raanDeg: 315.2,
      argPerigeeDeg: 141.9,
      meanAnomalyDeg: 218.7,
    },
  },
  {
    norad_id: "41866",
    name: "GOES-16",
    operator: "NOAA",
    elements: {
      meanMotion: 1.0027,
      eccentricity: 0.0001,
      inclinationDeg: 0.04,
      raanDeg: 98.4,
      argPerigeeDeg: 182.3,
      meanAnomalyDeg: 177.8,
    },
  },
  {
    norad_id: "44257",
    name: "MOLNIYA-TYPE RELAY",
    operator: "Commercial",
    elements: {
      meanMotion: 2.0061,
      eccentricity: 0.72,
      inclinationDeg: 63.42,
      raanDeg: 188.1,
      argPerigeeDeg: 270.0,
      meanAnomalyDeg: 12.5,
    },
  },
];

/** Mirrors `classify_orbit` in backend/ingest.py, including the HEO-by-eccentricity rule. */
export function classifyOrbit(
  meanAltitudeKm: number,
  eccentricity: number,
): OrbitClass {
  if (eccentricity > 0.25) return "HEO";
  if (meanAltitudeKm < 2000) return "LEO";
  if (Math.abs(meanAltitudeKm - 35786) <= 500) return "GEO";
  if (meanAltitudeKm < 35786) return "MEO";
  return "HEO";
}

/** Elements keyed by NORAD id, so orbit paths can be sampled on demand. */
export const SATELLITE_ELEMENTS: ReadonlyMap<string, KeplerianElements> = new Map(
  SATELLITE_SEEDS.map((seed) => [
    seed.norad_id,
    { ...seed.elements, epochMs: SIM_EPOCH_MS },
  ]),
);

function buildSatellite(seed: SatelliteSeed): SatelliteObject {
  const elements: KeplerianElements = { ...seed.elements, epochMs: SIM_EPOCH_MS };
  const altitude = meanAltitudeKm(seed.elements.meanMotion);
  const orbitClass = classifyOrbit(altitude, seed.elements.eccentricity);
  const position = propagateCircular(elements, SIM_EPOCH_MS);

  return {
    kind: "satellite",
    norad_id: seed.norad_id,
    name: seed.name,
    operator: seed.operator,
    orbit_class: orbitClass,
    altitude_km: Number(altitude.toFixed(3)),
    inclination_deg: seed.elements.inclinationDeg,
    // Phase 1 fixtures carry no TLE lines; the backend supplies them in Phase 2.
    tle_line1: null,
    tle_line2: null,
    epoch_utc: SIM_EPOCH_ISO,
    lat: Number(position.lat.toFixed(4)),
    lon: Number(position.lon.toFixed(4)),
    alt_km_now: Number(position.altitudeKm.toFixed(3)),
    text_blob: `${seed.name} (NORAD ${seed.norad_id}) is a ${orbitClass} object at about ${altitude.toFixed(0)} km mean altitude with ${seed.elements.inclinationDeg.toFixed(1)} degree inclination, operated by ${seed.operator}.`,
  };
}

export const MOCK_SATELLITES: readonly SatelliteObject[] =
  SATELLITE_SEEDS.map(buildSatellite);
