import {
  EARTH_RADIUS_KM,
  MU_EARTH_KM3_S2,
  SECONDS_PER_DAY,
} from "./constants";
import { wrapLongitude } from "./coords";

/**
 * Circular-orbit propagation, ported line-for-line from `propagate_circular`
 * in `backend/ingest.py` so the frontend and the ingest pipeline agree on
 * where an object is.
 *
 * This is the same documented MVP heuristic, not SGP4: mean anomaly advances
 * linearly from the element epoch and true anomaly is taken as mean anomaly
 * (exact for a circular orbit, degrading with eccentricity). Real TLE lines
 * ride along on every document so Phase 2 can swap in SGP4 without touching
 * the call sites here.
 */

/** The subset of GP elements needed to propagate. Mirrors CelesTrak naming. */
export interface KeplerianElements {
  /** Revolutions per day (CelesTrak `MEAN_MOTION`). */
  meanMotion: number;
  eccentricity: number;
  /** Degrees (CelesTrak `INCLINATION`). */
  inclinationDeg: number;
  /** Degrees (CelesTrak `RA_OF_ASC_NODE`). */
  raanDeg: number;
  /** Degrees (CelesTrak `ARG_OF_PERICENTER`). */
  argPerigeeDeg: number;
  /** Degrees at epoch (CelesTrak `MEAN_ANOMALY`). */
  meanAnomalyDeg: number;
  /** Element epoch as a millisecond timestamp. */
  epochMs: number;
}

export interface GeodeticPosition {
  lat: number;
  lon: number;
  altitudeKm: number;
}

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/** Kepler's third law: mean motion (rev/day) -> semi-major axis (km). */
export function semiMajorAxisKm(meanMotionRevPerDay: number): number {
  if (meanMotionRevPerDay <= 0) return EARTH_RADIUS_KM;
  const nRadPerSec = (meanMotionRevPerDay * TWO_PI) / SECONDS_PER_DAY;
  return Math.cbrt(MU_EARTH_KM3_S2 / (nRadPerSec * nRadPerSec));
}

/** Greenwich Mean Sidereal Time in degrees (IAU 1982), matching the backend. */
export function gmstDeg(whenMs: number): number {
  const julianDay = whenMs / 1000 / SECONDS_PER_DAY + 2440587.5;
  const daysSinceJ2000 = julianDay - 2451545.0;
  const centuries = daysSinceJ2000 / 36525.0;

  const gmst =
    280.46061837 +
    360.98564736629 * daysSinceJ2000 +
    0.000387933 * centuries * centuries -
    (centuries * centuries * centuries) / 38710000.0;

  return ((gmst % 360) + 360) % 360;
}

/** Orbital period in minutes, for display. */
export function periodMinutes(meanMotionRevPerDay: number): number {
  if (meanMotionRevPerDay <= 0) return 0;
  return 1440 / meanMotionRevPerDay;
}

/** Mean altitude in km, i.e. semi-major axis less one Earth radius. */
export function meanAltitudeKm(meanMotionRevPerDay: number): number {
  return semiMajorAxisKm(meanMotionRevPerDay) - EARTH_RADIUS_KM;
}

/**
 * Orbital period in minutes for a circular orbit at `altitudeKm`.
 *
 * Documents store altitude rather than mean motion, so this is the inverse of
 * `semiMajorAxisKm` and lets the detail panel show a period without carrying
 * the element set around.
 */
export function periodMinutesFromAltitude(altitudeKm: number): number {
  const axisKm = EARTH_RADIUS_KM + altitudeKm;
  const periodSec = 2 * Math.PI * Math.sqrt(axisKm ** 3 / MU_EARTH_KM3_S2);
  return periodSec / 60;
}

/** Sub-satellite point and altitude at `whenMs`. */
export function propagateCircular(
  elements: KeplerianElements,
  whenMs: number,
): GeodeticPosition {
  const {
    meanMotion,
    eccentricity,
    inclinationDeg,
    raanDeg,
    argPerigeeDeg,
    meanAnomalyDeg,
    epochMs,
  } = elements;

  const inclination = inclinationDeg * DEG;
  const raan = raanDeg * DEG;
  const argPerigee = argPerigeeDeg * DEG;
  const meanAnomaly = meanAnomalyDeg * DEG;

  const axis = semiMajorAxisKm(meanMotion);
  const nRadPerSec = (meanMotion * TWO_PI) / SECONDS_PER_DAY;
  const elapsedSec = (whenMs - epochMs) / 1000;

  const anomaly = (((meanAnomaly + nRadPerSec * elapsedSec) % TWO_PI) + TWO_PI) % TWO_PI;
  const argumentOfLatitude = argPerigee + anomaly;

  const sinLat = Math.min(
    1,
    Math.max(-1, Math.sin(inclination) * Math.sin(argumentOfLatitude)),
  );
  const latitude = Math.asin(sinLat);

  const rightAscension =
    raan +
    Math.atan2(
      Math.cos(inclination) * Math.sin(argumentOfLatitude),
      Math.cos(argumentOfLatitude),
    );

  const longitude = wrapLongitude(
    (rightAscension * 180) / Math.PI - gmstDeg(whenMs),
  );

  const radius = axis * (1 - eccentricity * Math.cos(anomaly));

  return {
    lat: (latitude * 180) / Math.PI,
    lon: longitude,
    altitudeKm: radius - EARTH_RADIUS_KM,
  };
}

/**
 * Sample one full revolution starting at `whenMs`.
 *
 * Used for orbit paths. The ground track is deliberately *not* what we draw:
 * we want the inertial ring in space, so each sample keeps its own longitude
 * including Earth rotation, which is what the globe group counter-rotates.
 */
export function sampleOrbit(
  elements: KeplerianElements,
  whenMs: number,
  samples: number,
): GeodeticPosition[] {
  const periodMs = (SECONDS_PER_DAY / Math.max(elements.meanMotion, 1e-6)) * 1000;
  const out: GeodeticPosition[] = new Array(samples);

  for (let i = 0; i < samples; i += 1) {
    out[i] = propagateCircular(elements, whenMs + (periodMs * i) / (samples - 1));
  }
  return out;
}
