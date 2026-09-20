"use client";

import { useMemo } from "react";
import { QuadraticBezierLine } from "@react-three/drei";
import { Vector3 } from "three";

/**
 * A bowed arc linking the two participants in a conjunction.
 *
 * The control point is pushed radially outward from Earth's centre so the arc
 * bulges away from the surface instead of cutting through the planet.
 */
export function WarningArc({
  start,
  end,
  color,
  emphasised,
}: {
  start: Vector3;
  end: Vector3;
  color: string;
  emphasised: boolean;
}) {
  const mid = useMemo(() => {
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const separation = start.distanceTo(end);
    // Bulge proportionally to how far apart the endpoints are, with a floor
    // so near-coincident pairs still show a visible arc.
    const bulge = 1 + Math.max(0.12, separation * 0.35);
    return midpoint.normalize().multiplyScalar(midpoint.length() * bulge);
  }, [start, end]);

  return (
    <QuadraticBezierLine
      start={start}
      end={end}
      mid={mid}
      color={color}
      lineWidth={emphasised ? 2 : 1.1}
      transparent
      opacity={emphasised ? 0.95 : 0.5}
      depthWrite={false}
      dashed={false}
    />
  );
}
