"use client";

import { useRef } from "react";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group, Vector3 } from "three";
import type { RiskLevel } from "@/lib/types/orbital";
import { RISK_COLOR } from "@/lib/orbital/risk";

export interface ConjunctionMarkerSpec {
  id: string;
  position: Vector3;
  riskLevel: RiskLevel;
  emphasised: boolean;
}

/**
 * Pulsing rings at critical and high closest-approach points.
 *
 * Billboarded so the ring always faces the camera and stays legible from any
 * orientation. The pulse is driven by scaling a group rather than by animating
 * material uniforms, so it costs nothing per frame beyond a matrix update, and
 * it is frozen entirely under reduced motion.
 */
function Marker({
  spec,
  animate,
  phase,
}: {
  spec: ConjunctionMarkerSpec;
  animate: boolean;
  phase: number;
}) {
  const ringRef = useRef<Group>(null);
  const color = RISK_COLOR[spec.riskLevel];

  useFrame((state) => {
    const group = ringRef.current;
    if (!group) return;

    if (!animate) {
      group.scale.setScalar(1);
      return;
    }
    const t = state.clock.elapsedTime * 1.6 + phase;
    group.scale.setScalar(1 + (Math.sin(t) * 0.5 + 0.5) * 0.7);
  });

  return (
    <Billboard position={spec.position}>
      <group ref={ringRef}>
        <mesh>
          <ringGeometry args={[0.022, 0.03, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={spec.emphasised ? 0.9 : 0.55}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <mesh>
        <circleGeometry args={[0.009, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
  );
}

export function ConjunctionMarkers({
  specs,
  animate,
}: {
  specs: ConjunctionMarkerSpec[];
  animate: boolean;
}) {
  return (
    <>
      {specs.map((spec, index) => (
        <Marker
          key={spec.id}
          spec={spec}
          animate={animate}
          // Offset each pulse so the field shimmers rather than strobing.
          phase={index * 0.7}
        />
      ))}
    </>
  );
}
