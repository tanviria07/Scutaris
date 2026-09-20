"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Vector3 } from "three";
import type { KeplerianElements } from "@/lib/orbital/propagate";
import { sampleOrbit } from "@/lib/orbital/propagate";
import { latLonAltToVec3 } from "@/lib/orbital/coords";
import {
  MAX_ORBIT_PATHS,
  ORBIT_PATH_SAMPLES,
} from "@/lib/orbital/constants";

export interface OrbitPathSpec {
  noradId: string;
  elements: KeplerianElements;
  color: string;
  emphasised: boolean;
}

/**
 * Orbit rings for the selected object and any high-risk participants.
 *
 * Capped at MAX_ORBIT_PATHS: drawing a ring for all ~950 objects would be
 * both unreadable and slow. Each ring is one revolution sampled from the same
 * propagator the markers use, so a path always passes through its object.
 */
export function OrbitPaths({
  specs,
  simTimeMs,
}: {
  specs: OrbitPathSpec[];
  simTimeMs: number;
}) {
  const paths = useMemo(() => {
    return specs.slice(0, MAX_ORBIT_PATHS).map((spec) => {
      const samples = sampleOrbit(spec.elements, simTimeMs, ORBIT_PATH_SAMPLES);
      const points = samples.map(({ lat, lon, altitudeKm }) =>
        latLonAltToVec3(lat, lon, altitudeKm, new Vector3()),
      );
      return { ...spec, points };
    });
  }, [specs, simTimeMs]);

  return (
    <>
      {paths.map((path) => (
        <Line
          key={path.noradId}
          points={path.points}
          color={path.color}
          lineWidth={path.emphasised ? 1.6 : 0.8}
          transparent
          opacity={path.emphasised ? 0.85 : 0.35}
          depthWrite={false}
        />
      ))}
    </>
  );
}
