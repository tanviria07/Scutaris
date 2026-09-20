"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import {
  AUTO_ROTATE_DEG_PER_SEC,
  AUTO_ROTATE_RESUME_MS,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
} from "@/lib/orbital/constants";
import { useMissionStore } from "@/lib/store/useMissionStore";

/**
 * Orbit controls plus auto-rotation.
 *
 * Auto-rotation pauses the moment the user grabs the globe and resumes after
 * a fixed idle period, so an operator reading a region is never fought by the
 * camera. Under reduced motion it never runs at all.
 *
 * Selecting an object eases the camera's *target* toward it rather than
 * teleporting, which keeps the user's sense of orientation.
 */
export function CameraRig({
  reducedMotion,
  focusPosition,
}: {
  reducedMotion: boolean;
  focusPosition: Vector3 | null;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interacting = useRef(false);
  const desiredTarget = useRef(new Vector3(0, 0, 0));
  const setAutoRotateEnabled = useMissionStore(
    (state) => state.setAutoRotateEnabled,
  );
  const { invalidate } = useThree();

  // OrbitControls' autoRotateSpeed is in degrees per second at 60fps.
  const autoRotateSpeed = AUTO_ROTATE_DEG_PER_SEC * 2;

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    function pause() {
      interacting.current = true;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (controls) controls.autoRotate = false;
      setAutoRotateEnabled(false);
    }

    function scheduleResume() {
      interacting.current = false;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (reducedMotion) return;

      idleTimer.current = setTimeout(() => {
        if (interacting.current || !controls) return;
        controls.autoRotate = true;
        setAutoRotateEnabled(true);
        invalidate();
      }, AUTO_ROTATE_RESUME_MS);
    }

    controls.addEventListener("start", pause);
    controls.addEventListener("end", scheduleResume);

    return () => {
      controls.removeEventListener("start", pause);
      controls.removeEventListener("end", scheduleResume);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [reducedMotion, setAutoRotateEnabled, invalidate]);

  // Respect a mid-session change to the OS reduced-motion setting.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = !reducedMotion;
    setAutoRotateEnabled(!reducedMotion);
  }, [reducedMotion, setAutoRotateEnabled]);

  useEffect(() => {
    if (!focusPosition) {
      desiredTarget.current.set(0, 0, 0);
      return;
    }
    // Aim a little inside the object so the globe stays framed behind it.
    desiredTarget.current.copy(focusPosition).multiplyScalar(0.45);
  }, [focusPosition]);

  useFrame((_state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    const target = desiredTarget.current;
    if (!controls.target.equals(target)) {
      if (reducedMotion) {
        controls.target.copy(target);
      } else {
        // Frame-rate independent exponential ease, ~800ms to settle.
        controls.target.lerp(target, 1 - Math.exp(-6 * delta));
      }
    }
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.45}
      zoomSpeed={0.8}
      minDistance={CAMERA_MIN_DISTANCE}
      maxDistance={CAMERA_MAX_DISTANCE}
      autoRotate={!reducedMotion}
      autoRotateSpeed={autoRotateSpeed}
    />
  );
}
