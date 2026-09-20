"use client";

import { AlertTriangle, Circle, Satellite, Sparkles } from "lucide-react";
import { RISK_COLOR, RISK_LABEL } from "@/lib/orbital/risk";
import { RISK_LEVELS } from "@/lib/types/orbital";
import { ALTITUDE_EXAGGERATION } from "@/lib/orbital/constants";

/**
 * Risk key plus the honesty note about altitude exaggeration.
 *
 * Every risk level is shown with an icon as well as a color, so the legend
 * itself is usable without color vision.
 */
const RISK_ICON = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: Circle,
  low: Circle,
} as const;

export function Legend() {
  return (
    <div className="scut-panel pointer-events-auto hidden flex-col gap-2 px-3 py-2 xl:flex">
      <div className="flex items-center gap-3">
        {RISK_LEVELS.map((level) => {
          const Icon = RISK_ICON[level];
          return (
            <span key={level} className="flex items-center gap-1">
              <Icon
                className="size-2.5"
                style={{ color: RISK_COLOR[level] }}
                aria-hidden="true"
              />
              <span className="font-mono text-[9px] tracking-[0.1em] text-ink-dim uppercase">
                {RISK_LABEL[level]}
              </span>
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--color-hairline)] pt-2">
        <span className="flex items-center gap-1">
          <Satellite className="size-2.5 text-teal" aria-hidden="true" />
          <span className="font-mono text-[9px] tracking-[0.1em] text-ink-dim uppercase">
            Satellite
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Sparkles className="size-2.5 text-ink-dim" aria-hidden="true" />
          <span className="font-mono text-[9px] tracking-[0.1em] text-ink-dim uppercase">
            Debris
          </span>
        </span>
      </div>
      <p className="max-w-[15rem] font-mono text-[9px] leading-relaxed text-ink-faint">
        Altitudes are exaggerated {ALTITUDE_EXAGGERATION}× for legibility. True
        LEO would sit flush with the surface.
      </p>
    </div>
  );
}
