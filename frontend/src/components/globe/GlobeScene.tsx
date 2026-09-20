"use client";

import { useMemo } from "react";
import { AdaptiveDpr, PerformanceMonitor, Preload } from "@react-three/drei";
import { Vector3 } from "three";
import type { KeplerianElements } from "@/lib/orbital/propagate";
import { propagateCircular } from "@/lib/orbital/propagate";
import { latLonAltToVec3 } from "@/lib/orbital/coords";
import { RISK_COLOR, RISK_SEVERITY } from "@/lib/orbital/risk";
import { EARTH_TILT_RAD, MAX_ORBIT_PATHS } from "@/lib/orbital/constants";
import type { OrbitalObject } from "@/lib/types/orbital";
import { simTimeMs, useMissionStore } from "@/lib/store/useMissionStore";
import {
  useFilteredConjunctions,
  useFilteredObjects,
  useRiskByNorad,
} from "@/lib/store/selectors";
import { SATELLITE_ELEMENTS } from "@/lib/data/fixtures/satellites";
import { DEBRIS_ELEMENTS } from "@/lib/data/fixtures/debris";
import { Earth } from "./Earth";
import { Atmosphere } from "./Atmosphere";
import { Clouds } from "./Clouds";
import { Starfield } from "./Starfield";
import { SunLight } from "./SunLight";
import { CameraRig } from "./CameraRig";
import { OrbitalObjects } from "./OrbitalObjects";
import { OrbitPaths, type OrbitPathSpec } from "./OrbitPaths";
import { WarningArc } from "./WarningArc";
import {
  ConjunctionMarkers,
  type ConjunctionMarkerSpec,
} from "./ConjunctionMarkers";

/** Element sets for both fixture families, looked up by NORAD id. */
function elementsFor(noradId: string): KeplerianElements | undefined {
  return SATELLITE_ELEMENTS.get(noradId) ?? DEBRIS_ELEMENTS.get(noradId);
}

/**
 * Sun direction for a given instant.
 *
 * Approximates the subsolar point: the sun tracks westward once per day and
 * the declination swings with the seasons. Enough to place a believable
 * terminator that moves correctly as the timeline scrubs.
 */
function sunDirectionFor(timeMs: number): Vector3 {
  const date = new Date(timeMs);
  const dayOfYear =
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
    86400000;

  const declination =
    -EARTH_TILT_RAD * Math.cos(((dayOfYear + 10) / 365.25) * Math.PI * 2);

  const secondsUtc =
    date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  const subsolarLon = 180 - (secondsUtc / 86400) * 360;
  const lonRad = (subsolarLon * Math.PI) / 180;

  return new Vector3(
    Math.cos(declination) * Math.sin(lonRad),
    Math.sin(declination),
    Math.cos(declination) * Math.cos(lonRad),
  ).normalize();
}

export function GlobeScene({ reducedMotion }: { reducedMotion: boolean }) {
  const offsetMinutes = useMissionStore((state) => state.timeline.offsetMinutes);
  const selectedNoradId = useMissionStore((state) => state.selectedNoradId);
  const selectedConjunctionId = useMissionStore(
    (state) => state.selectedConjunctionId,
  );
  const quality = useMissionStore((state) => state.quality);
  const setQuality = useMissionStore((state) => state.setQuality);

  const objects = useFilteredObjects();
  const conjunctions = useFilteredConjunctions();
  const riskByNorad = useRiskByNorad();

  const now = simTimeMs(offsetMinutes);
  const sunDirection = useMemo(() => sunDirectionFor(now), [now]);

  /**
   * Live positions for every visible object.
   *
   * Recomputed whenever the filtered set or the clock changes. ~950 objects
   * of trig is well under a millisecond, and doing it here rather than in
   * `useFrame` keeps the render loop free of allocation.
   */
  const positions = useMemo(() => {
    const map = new Map<string, Vector3>();
    for (const object of objects) {
      const elements = elementsFor(object.norad_id);
      if (elements) {
        const { lat, lon, altitudeKm } = propagateCircular(elements, now);
        map.set(object.norad_id, latLonAltToVec3(lat, lon, altitudeKm));
      } else {
        // No element set (a Phase 2 API object): fall back to the stored
        // sub-satellite point rather than dropping it from the scene.
        map.set(
          object.norad_id,
          latLonAltToVec3(object.lat, object.lon, object.alt_km_now),
        );
      }
    }
    return map;
  }, [objects, now]);

  const focusPosition = selectedNoradId
    ? (positions.get(selectedNoradId) ?? null)
    : null;

  /** Rings for the selection plus the most severe conjunction participants. */
  const orbitSpecs = useMemo(() => {
    const specs: OrbitPathSpec[] = [];
    const seen = new Set<string>();

    const push = (noradId: string, color: string, emphasised: boolean) => {
      if (seen.has(noradId) || specs.length >= MAX_ORBIT_PATHS) return;
      const elements = elementsFor(noradId);
      if (!elements) return;
      seen.add(noradId);
      specs.push({ noradId, elements, color, emphasised });
    };

    if (selectedNoradId) push(selectedNoradId, "#5eead4", true);

    for (const { conjunction } of conjunctions) {
      if (RISK_SEVERITY[conjunction.risk_level] < RISK_SEVERITY.high) continue;
      const color = RISK_COLOR[conjunction.risk_level];
      push(conjunction.primary_norad, color, false);
      push(conjunction.secondary_norad, color, false);
    }

    return specs;
  }, [selectedNoradId, conjunctions]);

  /** Arcs and markers for high and critical pairs that are currently visible. */
  const { arcs, markers } = useMemo(() => {
    const arcSpecs: {
      id: string;
      start: Vector3;
      end: Vector3;
      color: string;
      emphasised: boolean;
    }[] = [];
    const markerSpecs: ConjunctionMarkerSpec[] = [];

    for (const { conjunction } of conjunctions) {
      if (RISK_SEVERITY[conjunction.risk_level] < RISK_SEVERITY.high) continue;

      const start = positions.get(conjunction.primary_norad);
      const end = positions.get(conjunction.secondary_norad);
      if (!start || !end) continue;

      const emphasised = conjunction.id === selectedConjunctionId;
      arcSpecs.push({
        id: conjunction.id,
        start,
        end,
        color: RISK_COLOR[conjunction.risk_level],
        emphasised,
      });
      markerSpecs.push({
        id: conjunction.id,
        // Mark the midpoint: the encounter, not either participant.
        position: start.clone().add(end).multiplyScalar(0.5),
        riskLevel: conjunction.risk_level,
        emphasised,
      });
    }

    return { arcs: arcSpecs, markers: markerSpecs };
  }, [conjunctions, positions, selectedConjunctionId]);

  const animate = !reducedMotion;

  return (
    <>
      <PerformanceMonitor
        onDecline={() => setQuality(quality === "high" ? "medium" : "low")}
        onIncline={() => setQuality(quality === "low" ? "medium" : "high")}
      />
      <AdaptiveDpr pixelated={false} />

      <SunLight sunDirection={sunDirection} />
      <Starfield quality={quality} animate={animate} />

      {/* Axial tilt applied to the whole planet so lighting reads correctly. */}
      <group rotation={[0, 0, EARTH_TILT_RAD]}>
        <Earth sunDirection={sunDirection} />
        {quality !== "low" ? (
          <Clouds sunDirection={sunDirection} animate={animate} />
        ) : null}
        <Atmosphere sunDirection={sunDirection} />

        <OrbitalObjects
          objects={objects as OrbitalObject[]}
          positions={positions}
          riskByNorad={riskByNorad}
        />

        <OrbitPaths specs={orbitSpecs} simTimeMs={now} />

        {arcs.map((arc) => (
          <WarningArc
            key={arc.id}
            start={arc.start}
            end={arc.end}
            color={arc.color}
            emphasised={arc.emphasised}
          />
        ))}

        <ConjunctionMarkers specs={markers} animate={animate} />
      </group>

      <CameraRig reducedMotion={reducedMotion} focusPosition={focusPosition} />
      <Preload all />
    </>
  );
}
