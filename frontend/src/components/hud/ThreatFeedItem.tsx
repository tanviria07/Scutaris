"use client";

import { forwardRef } from "react";
import { AlertTriangle, Circle } from "lucide-react";
import type { ResolvedConjunction } from "@/lib/types/orbital";
import { RISK_COLOR, RISK_LABEL } from "@/lib/orbital/risk";
import { cn } from "@/lib/utils/cn";
import { formatKm, formatPc, formatRelative } from "@/lib/utils/format";

interface ThreatFeedItemProps {
  entry: ResolvedConjunction;
  selected: boolean;
  referenceMs: number;
  onSelect: () => void;
  onHover: (noradId: string | null) => void;
}

/**
 * One row of the threat feed.
 *
 * Rendered as an option inside a listbox so the whole feed is reachable with
 * arrow keys, which is the accessible equivalent of clicking an object in the
 * 3D scene. Risk is conveyed by icon, text and color together.
 */
export const ThreatFeedItem = forwardRef<HTMLLIElement, ThreatFeedItemProps>(
  function ThreatFeedItem(
    { entry, selected, referenceMs, onSelect, onHover },
    ref,
  ) {
    const { conjunction, primary, secondary } = entry;
    const severe =
      conjunction.risk_level === "critical" || conjunction.risk_level === "high";
    const Icon = severe ? AlertTriangle : Circle;
    const color = RISK_COLOR[conjunction.risk_level];

    return (
      <li
        ref={ref}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        onClick={onSelect}
        onMouseEnter={() => onHover(conjunction.secondary_norad)}
        onMouseLeave={() => onHover(null)}
        className={cn(
          "cursor-pointer border-l-2 px-3 py-2 transition-colors",
          selected
            ? "border-l-teal bg-teal/10"
            : "border-l-transparent hover:bg-white/[0.04]",
        )}
        style={selected ? undefined : { borderLeftColor: `${color}55` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Icon
              className="size-3 shrink-0"
              style={{ color }}
              aria-hidden="true"
            />
            <span className="truncate font-mono text-[11px] text-ink">
              {primary?.name ?? `NORAD ${conjunction.primary_norad}`}
            </span>
          </span>
          <span
            className="shrink-0 font-mono text-[9px] tracking-[0.1em] uppercase"
            style={{ color }}
          >
            {RISK_LABEL[conjunction.risk_level]}
          </span>
        </div>

        <p className="mt-0.5 truncate pl-4.5 font-mono text-[10px] text-ink-dim">
          vs {secondary?.name ?? `NORAD ${conjunction.secondary_norad}`}
        </p>

        <div className="mt-1 flex items-center gap-3 pl-4.5 font-mono text-[9px] text-ink-faint tabular-nums">
          <span>{formatKm(conjunction.miss_km, 2)}</span>
          <span>Pc {formatPc(conjunction.pc)}</span>
          <span>{formatRelative(conjunction.tca_utc, referenceMs)}</span>
        </div>
      </li>
    );
  },
);
