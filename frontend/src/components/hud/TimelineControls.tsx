"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import {
  TIMELINE_MAX_MINUTES,
  simTimeMs,
  useMissionStore,
} from "@/lib/store/useMissionStore";
import type { PlaybackSpeed } from "@/lib/types/ui";
import { cn } from "@/lib/utils/cn";
import { formatUtc } from "@/lib/utils/format";

const SPEEDS: readonly PlaybackSpeed[] = [1, 10, 60];

export function TimelineControls() {
  const { offsetMinutes, playing, speed } = useMissionStore(
    (state) => state.timeline,
  );
  const setTimelineOffset = useMissionStore((state) => state.setTimelineOffset);
  const togglePlaying = useMissionStore((state) => state.togglePlaying);
  const setSpeed = useMissionStore((state) => state.setSpeed);
  const resetTimeline = useMissionStore((state) => state.resetTimeline);

  const clock = formatUtc(new Date(simTimeMs(offsetMinutes)).toISOString());
  const hours = Math.floor(offsetMinutes / 60);
  const minutes = Math.floor(offsetMinutes % 60);

  return (
    <div className="scut-panel pointer-events-auto flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        onClick={togglePlaying}
        aria-label={playing ? "Pause simulation" : "Play simulation"}
        className="flex size-7 shrink-0 items-center justify-center border border-teal/40 bg-teal/10 text-teal transition-colors hover:bg-teal/20"
      >
        {playing ? (
          <Pause className="size-3" aria-hidden="true" />
        ) : (
          <Play className="size-3" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={resetTimeline}
        aria-label="Reset simulation clock to epoch"
        className="flex size-7 shrink-0 items-center justify-center border border-[var(--color-hairline)] text-ink-dim transition-colors hover:border-teal/40 hover:text-teal"
      >
        <RotateCcw className="size-3" aria-hidden="true" />
      </button>

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="timeline-scrub" className="sr-only">
          Simulation time offset in minutes from epoch
        </label>
        <input
          id="timeline-scrub"
          type="range"
          min={0}
          max={TIMELINE_MAX_MINUTES}
          step={1}
          value={Math.round(offsetMinutes)}
          onChange={(event) => setTimelineOffset(Number(event.target.value))}
          aria-valuetext={`${hours} hours ${minutes} minutes after epoch, ${clock}`}
          className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-white/10 accent-teal sm:w-56 lg:w-72"
        />
        <div className="flex items-center justify-between gap-2 font-mono text-[9px] text-ink-faint tabular-nums">
          <span>T+{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}</span>
          <span className="text-teal">{clock}</span>
          <span>+48h</span>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-1"
        role="group"
        aria-label="Playback speed"
      >
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            aria-pressed={speed === value}
            className={cn(
              "border px-1.5 py-0.5 font-mono text-[9px] tracking-wide transition-colors",
              speed === value
                ? "border-teal/50 bg-teal/15 text-teal"
                : "border-[var(--color-hairline)] text-ink-faint hover:text-ink",
            )}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}
