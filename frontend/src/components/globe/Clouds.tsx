"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, ShaderMaterial, Vector3 } from "three";
import { CLOUD_RADIUS } from "@/lib/orbital/constants";
import { cloudFragmentShader, cloudVertexShader } from "./cloudShader";

export function Clouds({
  sunDirection,
  animate,
}: {
  sunDirection: Vector3;
  animate: boolean;
}) {
  const materialRef = useRef<ShaderMaterial | null>(null);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: cloudVertexShader,
        fragmentShader: cloudFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uSunDirection: { value: sunDirection.clone() },
          uCoverage: { value: 0.48 },
          uOpacity: { value: 0.72 },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // The frame loop mutates the material, so reach it through a ref rather
  // than closing over the memoized value directly.
  useEffect(() => {
    materialRef.current = material;
  }, [material]);

  useEffect(() => {
    material.uniforms.uSunDirection.value.copy(sunDirection);
  }, [material, sunDirection]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_state, delta) => {
    // Under reduced motion the field is still rendered, just frozen.
    const active = materialRef.current;
    if (!animate || !active) return;
    active.uniforms.uTime.value += delta;
  });

  return (
    <mesh material={material} renderOrder={1}>
      <sphereGeometry args={[CLOUD_RADIUS, 72, 48]} />
    </mesh>
  );
}
