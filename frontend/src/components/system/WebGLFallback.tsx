"use client";

import { useMemo } from "react";
import { MonitorX } from "lucide-react";
import { useMissionStore } from "@/lib/store/useMissionStore";
import { useFilteredObjects, useRiskByNorad } from "@/lib/store/selectors";
import { RISK_COLOR } from "@/lib/orbital/risk";
import { RISK_LEVELS } from "@/lib/types/orbital";
import { COASTLINES } from "@/lib/textures/coastlines";

/**
 * 2D fallback for machines without WebGL.
 *
 * Rather than an apology screen, this plots the same filtered catalogue on an
 * equirectangular projection built from the same coastline data the procedural
 * globe texture uses, and stays interactive: objects remain clickable and the
 * whole HUD keeps working.
 */
export function WebGLFallback({ reason }: { reason: "unsupported" | "error" }) {
  const objects = useFilteredObjects();
  const riskByNorad = useRiskByNorad();
  const select = useMissionStore((state) => state.select);
  const selectedNoradId = useMissionStore((state) => state.selectedNoradId);

  const severityToLevel = useMemo(
    () => new Map(RISK_LEVELS.map((level, index) => [3 - index, level] as const)),
    [],
  );

  // Cap the plotted set: 900 individually clickable SVG nodes is slow in a
  // context that is already running without hardware acceleration.
  const plotted = objects.length > 400 ? objects.slice(0, 400) : objects;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
      <div className="scut-panel flex items-center gap-2 px-3 py-2">
        <MonitorX className="size-4 text-amber" aria-hidden="true" />
        <p className="font-mono text-[10px] tracking-wide text-ink-dim">
          {reason === "unsupported"
            ? "WebGL is unavailable in this browser — showing the 2D projection."
            : "The 3D scene failed to start — showing the 2D projection."}
        </p>
      </div>

      <svg
        viewBox="0 0 360 180"
        className="max-h-[70%] w-full max-w-4xl border border-[var(--color-hairline)] bg-black/40"
        role="img"
        aria-label={`Equirectangular map plotting ${plotted.length} tracked objects`}
      >
        <g
          fill="none"
          stroke="#5eead4"
          strokeOpacity={0.28}
          strokeWidth={0.4}
          strokeLinejoin="round"
        >
          {COASTLINES.map((ring, index) => (
            <polyline
              key={index}
              points={ring
                .map(([lon, lat]) => `${lon + 180},${90 - lat}`)
                .join(" ")}
            />
          ))}
        </g>

        <g stroke="#5eead4" strokeOpacity={0.08} strokeWidth={0.3}>
          {[-60, -30, 0, 30, 60].map((lat) => (
            <line key={lat} x1={0} y1={90 - lat} x2={360} y2={90 - lat} />
          ))}
          {[-120, -60, 0, 60, 120].map((lon) => (
            <line key={lon} x1={lon + 180} y1={0} x2={lon + 180} y2={180} />
          ))}
        </g>

        {plotted.map((object) => {
          const severity = riskByNorad.get(object.norad_id);
          const level = severity === undefined ? null : severityToLevel.get(severity);
          const selected = object.norad_id === selectedNoradId;
          const color = level
            ? RISK_COLOR[level]
            : object.kind === "satellite"
              ? "#5eead4"
              : "#64748b";

          return (
            <circle
              key={object.norad_id}
              cx={object.lon + 180}
              cy={90 - object.lat}
              r={selected ? 2.4 : object.kind === "satellite" ? 1.4 : 0.7}
              fill={color}
              fillOpacity={object.kind === "satellite" ? 0.95 : 0.6}
              stroke={selected ? "#ffffff" : "none"}
              strokeWidth={selected ? 0.6 : 0}
              className="cursor-pointer"
              onClick={() => select(object.norad_id)}
            >
              <title>
                {object.name} (NORAD {object.norad_id})
              </title>
            </circle>
          );
        })}
      </svg>

      {objects.length > plotted.length ? (
        <p className="font-mono text-[9px] text-ink-faint">
          Showing {plotted.length} of {objects.length} objects. Narrow the
          filters to plot the rest.
        </p>
      ) : null}
    </div>
  );
}
