import type { DebrisObject } from "@/lib/types/orbital";
import type { KeplerianElements } from "@/lib/orbital/propagate";
import { meanAltitudeKm, propagateCircular } from "@/lib/orbital/propagate";
import { classifyOrbit } from "./satellites";
import { createRng, SIM_EPOCH_ISO, SIM_EPOCH_MS } from "./rng";

/**
 * Synthetic debris field.
 *
 * Fragments cluster around the two breakup events the ingest pipeline actually
 * targets (`cosmos-2251-debris` is the default debris group in
 * `backend/config.py`), plus a smaller Fengyun-1C cloud and some rocket bodies,
 * so the altitude and inclination distribution looks like real LEO congestion
 * rather than a uniform shell.
 */

interface DebrisCluster {
  parent: string;
  group: string;
  count: number;
  altitudeKm: number;
  altitudeSpreadKm: number;
  inclinationDeg: number;
  inclinationSpreadDeg: number;
  eccentricity: number;
  eccentricitySpread: number;
}

const CLUSTERS: readonly DebrisCluster[] = [
  {
    parent: "COSMOS 2251",
    group: "cosmos-2251-debris",
    count: 420,
    altitudeKm: 790,
    altitudeSpreadKm: 150,
    inclinationDeg: 74.0,
    inclinationSpreadDeg: 3.5,
    eccentricity: 0.008,
    eccentricitySpread: 0.01,
  },
  {
    parent: "IRIDIUM 33",
    group: "iridium-33-debris",
    count: 180,
    altitudeKm: 780,
    altitudeSpreadKm: 120,
    inclinationDeg: 86.4,
    inclinationSpreadDeg: 2.0,
    eccentricity: 0.006,
    eccentricitySpread: 0.008,
  },
  {
    parent: "FENGYUN 1C",
    group: "fengyun-1c-debris",
    count: 240,
    altitudeKm: 860,
    altitudeSpreadKm: 200,
    inclinationDeg: 98.8,
    inclinationSpreadDeg: 2.5,
    eccentricity: 0.01,
    eccentricitySpread: 0.012,
  },
  {
    parent: "CZ-6A R/B",
    group: "rocket-bodies",
    count: 90,
    altitudeKm: 1100,
    altitudeSpreadKm: 260,
    inclinationDeg: 52.0,
    inclinationSpreadDeg: 8.0,
    eccentricity: 0.014,
    eccentricitySpread: 0.02,
  },
];

export const DEBRIS_COUNT = CLUSTERS.reduce(
  (total, cluster) => total + cluster.count,
  0,
);

/** Mean motion (rev/day) that yields a given circular altitude. */
function meanMotionForAltitude(altitudeKm: number): number {
  const radiusKm = 6378.137 + altitudeKm;
  const periodSec = 2 * Math.PI * Math.sqrt(radiusKm ** 3 / 398600.4418);
  return 86400 / periodSec;
}

const debrisElements = new Map<string, KeplerianElements>();

function buildDebris(): DebrisObject[] {
  // One fixed seed for the whole field keeps SSR and client renders identical.
  const rng = createRng(0x5c07a21);
  const objects: DebrisObject[] = [];
  let sequence = 0;

  for (const cluster of CLUSTERS) {
    for (let i = 0; i < cluster.count; i += 1) {
      sequence += 1;
      // Synthetic ids in an unassigned-looking high range so they can never be
      // confused with a real catalogue number.
      const noradId = String(900000 + sequence);

      const altitude = Math.max(
        220,
        rng.gaussian(cluster.altitudeKm, cluster.altitudeSpreadKm),
      );
      const eccentricity = Math.max(
        0,
        rng.gaussian(cluster.eccentricity, cluster.eccentricitySpread),
      );
      const inclination = rng.gaussian(
        cluster.inclinationDeg,
        cluster.inclinationSpreadDeg,
      );

      const elements: KeplerianElements = {
        meanMotion: meanMotionForAltitude(altitude),
        eccentricity,
        inclinationDeg: inclination,
        raanDeg: rng.range(0, 360),
        argPerigeeDeg: rng.range(0, 360),
        meanAnomalyDeg: rng.range(0, 360),
        epochMs: SIM_EPOCH_MS,
      };

      const meanAlt = meanAltitudeKm(elements.meanMotion);
      const orbitClass = classifyOrbit(meanAlt, eccentricity);
      const position = propagateCircular(elements, SIM_EPOCH_MS);

      // Radar cross-section: most fragments are tiny, a few are trackable-large.
      const rcs = rng.next() < 0.12 ? rng.range(0.6, 3.2) : rng.range(0.01, 0.4);

      debrisElements.set(noradId, elements);

      objects.push({
        kind: "debris",
        norad_id: noradId,
        name: `${cluster.parent} DEB ${String(i + 1).padStart(4, "0")}`,
        parent_object: cluster.parent,
        rcs_m2: Number(rcs.toFixed(3)),
        group: cluster.group,
        orbit_class: orbitClass,
        altitude_km: Number(meanAlt.toFixed(3)),
        inclination_deg: Number(inclination.toFixed(4)),
        tle_line1: null,
        tle_line2: null,
        epoch_utc: SIM_EPOCH_ISO,
        lat: Number(position.lat.toFixed(4)),
        lon: Number(position.lon.toFixed(4)),
        alt_km_now: Number(position.altitudeKm.toFixed(3)),
        text_blob: `${cluster.parent} DEB ${i + 1} (NORAD ${noradId}) is a ${orbitClass} object at about ${meanAlt.toFixed(0)} km mean altitude with ${inclination.toFixed(1)} degree inclination, originating from breakup of ${cluster.parent}, tracked in the CelesTrak ${cluster.group} group.`,
      });
    }
  }

  return objects;
}

export const MOCK_DEBRIS: readonly DebrisObject[] = buildDebris();

/** Elements keyed by NORAD id, so orbit paths can be sampled on demand. */
export const DEBRIS_ELEMENTS: ReadonlyMap<string, KeplerianElements> = debrisElements;
