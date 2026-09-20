"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { CAMERA_INITIAL_POSITION } from "@/lib/orbital/constants";
import { useWebGLSupport } from "@/lib/hooks/useWebGLSupport";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { useMissionStore } from "@/lib/store/useMissionStore";
import { useFilteredObjects } from "@/lib/store/selectors";
import { GlobeLoader } from "@/components/system/GlobeLoader";
import { WebGLFallback } from "@/components/system/WebGLFallback";
import { SceneErrorBoundary } from "@/components/system/SceneErrorBoundary";
import { GlobeScene } from "./GlobeScene";

/**
 * Mounts the WebGL scene, or a usable substitute when that is not possible.
 *
 * The canvas is not the only way to reach the data, but it is the primary
 * one, so it carries an `aria-label` summarising what it shows and a live
 * region announces selection changes for screen-reader users.
 */
export function GlobeCanvas() {
  const support = useWebGLSupport();
  const reducedMotion = useReducedMotion();
  const objects = useFilteredObjects();
  const loading = useMissionStore((state) => state.loading);
  const selectedNoradId = useMissionStore((state) => state.selectedNoradId);

  const counts = useMemo(() => {
    let satellites = 0;
    let debris = 0;
    for (const object of objects) {
      if (object.kind === "satellite") satellites += 1;
      else debris += 1;
    }
    return { satellites, debris };
  }, [objects]);

  const description = `Interactive 3D Earth showing ${counts.satellites} satellites and ${counts.debris} debris objects in orbit.`;

  if (support === "probing" || loading) {
    return <GlobeLoader />;
  }

  if (support === "unsupported") {
    return <WebGLFallback reason="unsupported" />;
  }

  return (
    <SceneErrorBoundary fallback={<WebGLFallback reason="error" />}>
      <div className="absolute inset-0" role="img" aria-label={description}>
        <Canvas
          // Clamp device pixel ratio: a 3x retina buffer triples fragment cost
          // for no perceptible gain on a scene this dark.
          dpr={[1, 2]}
          camera={{ position: [...CAMERA_INITIAL_POSITION], fov: 42, near: 0.01, far: 2000 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            toneMapping: ACESFilmicToneMapping,
          }}
          onCreated={({ gl }) => gl.setClearColor("#05070d", 1)}
        >
          <Suspense fallback={null}>
            <GlobeScene reducedMotion={reducedMotion} />
          </Suspense>
        </Canvas>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {selectedNoradId
          ? `Selected object NORAD ${selectedNoradId}.`
          : "No object selected."}
      </p>
    </SceneErrorBoundary>
  );
}
