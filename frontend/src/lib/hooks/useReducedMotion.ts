"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** The server has no media queries, so assume motion is allowed. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Tracks `prefers-reduced-motion: reduce`.
 *
 * `useSyncExternalStore` is the right primitive here rather than an effect
 * that calls setState: it reads the true value on the first client render, so
 * animation never starts and then gets cancelled a frame later.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
