"use client";

import { useEffect } from "react";
import {
  TIMELINE_MAX_MINUTES,
  useMissionStore,
} from "@/lib/store/useMissionStore";

/**
 * Advances the simulation clock while the timeline is playing.
 *
 * Driven by rAF rather than setInterval so playback stays in step with the
 * render loop and pauses automatically when the tab is backgrounded. Stops at
 * the end of the horizon instead of wrapping, so the operator always knows
 * which way time is running.
 */
export function useTimelinePlayback(): void {
  const playing = useMissionStore((state) => state.timeline.playing);
  const speed = useMissionStore((state) => state.timeline.speed);

  useEffect(() => {
    if (!playing) return;

    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const deltaSec = (now - previous) / 1000;
      previous = now;

      const store = useMissionStore.getState();
      // `speed` is minutes of simulation per second of wall clock.
      const next = store.timeline.offsetMinutes + deltaSec * speed;

      if (next >= TIMELINE_MAX_MINUTES) {
        store.setTimelineOffset(TIMELINE_MAX_MINUTES);
        store.togglePlaying();
        return;
      }

      store.setTimelineOffset(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);
}
