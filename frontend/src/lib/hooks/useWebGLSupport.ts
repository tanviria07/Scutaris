"use client";

import { useSyncExternalStore } from "react";

export type WebGLSupport = "probing" | "supported" | "unsupported";

/**
 * Probing is a one-time, process-wide fact, so the result is cached at module
 * scope. Without the cache `getSnapshot` would allocate a canvas on every
 * render, which `useSyncExternalStore` calls frequently.
 */
let cached: WebGLSupport | null = null;

/**
 * Creating a throwaway canvas is the only reliable test: a browser can expose
 * the constructor and still fail to allocate a context (blocklisted driver,
 * headless environment, or WebGL disabled by flag). The probe context is
 * explicitly released so it does not occupy one of the browser's limited
 * context slots.
 */
function detect(): WebGLSupport {
  if (cached) return cached;

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");

    if (context) {
      const lose = (context as WebGLRenderingContext).getExtension(
        "WEBGL_lose_context",
      );
      lose?.loseContext();
      cached = "supported";
    } else {
      cached = "unsupported";
    }
  } catch {
    cached = "unsupported";
  }

  return cached;
}

/** WebGL support never changes mid-session, so there is nothing to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

function getServerSnapshot(): WebGLSupport {
  return "probing";
}

export function useWebGLSupport(): WebGLSupport {
  return useSyncExternalStore(subscribe, detect, getServerSnapshot);
}
