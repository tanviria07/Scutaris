"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BackSide, Color, ShaderMaterial, Vector3 } from "three";
import { ATMOSPHERE_RADIUS } from "@/lib/orbital/constants";
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
} from "./atmosphereShader";

export function Atmosphere({ sunDirection }: { sunDirection: Vector3 }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          uGlowColor: { value: new Color("#5eead4") },
          uSunDirection: { value: sunDirection.clone() },
          uIntensity: { value: 1.35 },
          uPower: { value: 3.0 },
        },
        transparent: true,
        blending: AdditiveBlending,
        side: BackSide,
        // The shell must never occlude satellites inside or behind it.
        depthWrite: false,
      }),
    // sunDirection is copied into the uniform below, not re-created here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    material.uniforms.uSunDirection.value.copy(sunDirection);
  }, [material, sunDirection]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} renderOrder={2}>
      <sphereGeometry args={[ATMOSPHERE_RADIUS, 64, 48]} />
    </mesh>
  );
}
