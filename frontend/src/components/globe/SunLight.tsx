"use client";

import { Vector3 } from "three";

/**
 * Three-point lighting tuned for a planet.
 *
 * The key light is the sun and drives the terminator. A very low ambient
 * keeps the night side from going pure black, and a cool rim light opposite
 * the sun separates the globe's edge from the star field.
 */
export function SunLight({ sunDirection }: { sunDirection: Vector3 }) {
  const key = sunDirection.clone().multiplyScalar(12);
  const rim = sunDirection.clone().multiplyScalar(-9).add(new Vector3(0, 3, 0));

  return (
    <>
      <directionalLight
        position={[key.x, key.y, key.z]}
        intensity={2.1}
        color="#fff6e8"
      />
      <ambientLight intensity={0.055} color="#3b5370" />
      <directionalLight
        position={[rim.x, rim.y, rim.z]}
        intensity={0.32}
        color="#5eead4"
      />
    </>
  );
}
