"use client";

import { useEffect, useMemo, useRef } from "react";
import { Color, MeshStandardMaterial, Vector3 } from "three";
import { createEarthTextures, disposeEarthTextures } from "@/lib/textures/textureManifest";

/**
 * The Earth sphere.
 *
 * A `MeshStandardMaterial` gives correct physically-based response to the sun
 * light for free; the `onBeforeCompile` patch adds the two things it cannot do
 * natively: city lights that appear only on the unlit side, and a roughness
 * split so oceans glint while land stays matte.
 */
export function Earth({ sunDirection }: { sunDirection: Vector3 }) {
  const textures = useMemo(() => createEarthTextures(), []);
  const sunRef = useRef({ value: sunDirection.clone() });

  useEffect(() => {
    sunRef.current.value.copy(sunDirection);
  }, [sunDirection]);

  useEffect(() => () => disposeEarthTextures(textures), [textures]);

  const material = useMemo(() => {
    const standard = new MeshStandardMaterial({
      map: textures.day,
      bumpMap: textures.relief,
      bumpScale: 0.012,
      roughnessMap: textures.oceanMask,
      // Ocean mask is white over water; inverting it in the shader would cost
      // a patch, so instead metalness stays low and the shader reads the mask
      // directly for the specular split below.
      roughness: 1,
      metalness: 0.02,
    });

    // Parameter type is inferred from onBeforeCompile; three renamed the
    // standalone `Shader` type, so annotating it explicitly would pin us to
    // one release of @types/three.
    standard.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDirection = sunRef.current;
      shader.uniforms.uNightMap = { value: textures.night };
      shader.uniforms.uOceanMask = { value: textures.oceanMask };
      shader.uniforms.uNightColor = { value: new Color("#ffb865") };

      // three's built-in `vNormal` is in *view* space, so it cannot be
      // compared against a world-space sun vector — the terminator would
      // swing around as the camera orbits. Carry our own world normal across.
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec3 vScutWorldNormal;`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
           vScutWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform vec3 uSunDirection;
           uniform sampler2D uNightMap;
           uniform sampler2D uOceanMask;
           uniform vec3 uNightColor;
           varying vec3 vScutWorldNormal;`,
        )
        // Water is smooth, land is rough. The mask is white over water, so
        // invert it into roughness.
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
           float scutWater = texture2D( uOceanMask, vMapUv ).r;
           // 0.38 rather than a mirror finish: a sharper value produces a
           // small blown-out white sun glint instead of a broad sheen.
           roughnessFactor = mix( 0.85, 0.38, scutWater );`,
        )
        // Emissive city lights, gated by how far into night the pixel is.
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           float scutSun = dot( normalize( vScutWorldNormal ), normalize( uSunDirection ) );
           // GLSL smoothstep requires edge0 < edge1, so invert rather than
           // passing reversed edges (which is undefined behaviour).
           float scutNight = 1.0 - smoothstep( -0.25, 0.10, scutSun );
           vec3 scutLights = texture2D( uNightMap, vMapUv ).rgb;
           totalEmissiveRadiance += scutLights * uNightColor * scutNight * 1.5;`,
        );
    };

    // Changing onBeforeCompile requires a program rebuild.
    standard.needsUpdate = true;
    return standard;
  }, [textures]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh material={material} receiveShadow={false} castShadow={false}>
      <sphereGeometry args={[1, 96, 64]} />
    </mesh>
  );
}
