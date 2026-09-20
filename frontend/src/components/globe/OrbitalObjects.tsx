"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Color, InstancedMesh, Object3D, Vector3 } from "three";
import type { OrbitalObject } from "@/lib/types/orbital";
import { RISK_COLOR } from "@/lib/orbital/risk";
import { RISK_LEVELS } from "@/lib/types/orbital";
import { latLonAltToVec3 } from "@/lib/orbital/coords";
import { useMissionStore } from "@/lib/store/useMissionStore";

/**
 * Every tracked object, drawn as two instanced meshes.
 *
 * ~950 individual meshes would be ~950 draw calls; instancing makes it two.
 * R3F reports `instanceId` on pointer events, so individual fragments stay
 * clickable and hoverable without giving each one its own object.
 */

const SEVERITY_TO_LEVEL = new Map(
  RISK_LEVELS.map((level, index) => [3 - index, level] as const),
);

const NEUTRAL_SATELLITE = new Color("#5eead4");
const NEUTRAL_DEBRIS = new Color("#7c8ba1");
const HIGHLIGHT = new Color("#ffffff");

interface InstancedGroupProps {
  objects: OrbitalObject[];
  positions: Map<string, Vector3>;
  riskByNorad: ReadonlyMap<string, number>;
  radius: number;
  neutral: Color;
  detail: number;
}

function InstancedGroup({
  objects,
  positions,
  riskByNorad,
  radius,
  neutral,
  detail,
}: InstancedGroupProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const scratchColor = useMemo(() => new Color(), []);
  const select = useMissionStore((state) => state.select);
  const setHovered = useMissionStore((state) => state.setHovered);
  const selectedNoradId = useMissionStore((state) => state.selectedNoradId);
  const hoveredNoradId = useMissionStore((state) => state.hoveredNoradId);

  // Transforms: rewritten whenever the visible set or the sim clock changes.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    objects.forEach((object, index) => {
      const position = positions.get(object.norad_id);
      if (!position) return;
      dummy.position.copy(position);
      const emphasised =
        object.norad_id === selectedNoradId ||
        object.norad_id === hoveredNoradId;
      dummy.scale.setScalar(emphasised ? 2.2 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.count = objects.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [objects, positions, dummy, selectedNoradId, hoveredNoradId]);

  // Colors: risk where known, neutral otherwise, white for the active object.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Do not bail when `instanceColor` is still null: three allocates that
    // buffer lazily on the first setColorAt call, so guarding on it here
    // would skip the initial pass and leave every instance default white.
    objects.forEach((object, index) => {
      const severity = riskByNorad.get(object.norad_id);
      const level = severity === undefined ? null : SEVERITY_TO_LEVEL.get(severity);

      if (
        object.norad_id === selectedNoradId ||
        object.norad_id === hoveredNoradId
      ) {
        scratchColor.copy(HIGHLIGHT);
      } else if (level) {
        scratchColor.set(RISK_COLOR[level]);
      } else {
        scratchColor.copy(neutral);
      }

      mesh.setColorAt(index, scratchColor);
    });

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [
    objects,
    riskByNorad,
    neutral,
    scratchColor,
    selectedNoradId,
    hoveredNoradId,
  ]);

  if (objects.length === 0) return null;

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const index = event.instanceId;
    if (index === undefined) return;
    const object = objects[index];
    if (object) select(object.norad_id);
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const index = event.instanceId;
    if (index === undefined) return;
    const object = objects[index];
    setHovered(object ? object.norad_id : null);
  };

  return (
    <instancedMesh
      ref={meshRef}
      // `args` count is the allocation ceiling, so it must not shrink below
      // the live count; keying on length forces a fresh buffer when it grows.
      args={[undefined, undefined, Math.max(1, objects.length)]}
      frustumCulled={false}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerOut={() => setHovered(null)}
    >
      <icosahedronGeometry args={[radius, detail]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

export function OrbitalObjects({
  objects,
  positions,
  riskByNorad,
}: {
  objects: OrbitalObject[];
  positions: Map<string, Vector3>;
  riskByNorad: ReadonlyMap<string, number>;
}) {
  const { satellites, debris } = useMemo(() => {
    const sats: OrbitalObject[] = [];
    const debs: OrbitalObject[] = [];
    for (const object of objects) {
      if (object.kind === "satellite") sats.push(object);
      else debs.push(object);
    }
    return { satellites: sats, debris: debs };
  }, [objects]);

  return (
    <>
      <InstancedGroup
        key={`sat-${satellites.length}`}
        objects={satellites}
        positions={positions}
        riskByNorad={riskByNorad}
        radius={0.014}
        detail={1}
        neutral={NEUTRAL_SATELLITE}
      />
      <InstancedGroup
        key={`deb-${debris.length}`}
        objects={debris}
        positions={positions}
        riskByNorad={riskByNorad}
        radius={0.006}
        detail={0}
        neutral={NEUTRAL_DEBRIS}
      />
    </>
  );
}

/** Recomputes every visible object's scene position for a given sim time. */
export function buildPositions(
  objects: readonly OrbitalObject[],
  positionAt: (object: OrbitalObject) => {
    lat: number;
    lon: number;
    altitudeKm: number;
  },
): Map<string, Vector3> {
  const map = new Map<string, Vector3>();
  for (const object of objects) {
    const { lat, lon, altitudeKm } = positionAt(object);
    map.set(object.norad_id, latLonAltToVec3(lat, lon, altitudeKm));
  }
  return map;
}
