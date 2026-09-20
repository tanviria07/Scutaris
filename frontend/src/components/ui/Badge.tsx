import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import type { RiskLevel } from "@/lib/types/orbital";
import { RISK_LABEL } from "@/lib/orbital/risk";

type BadgeTone = "teal" | "amber" | "crimson" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  teal: "border-teal/40 bg-teal/10 text-teal",
  amber: "border-amber/40 bg-amber/10 text-amber",
  crimson: "border-crimson/50 bg-crimson/15 text-crimson",
  neutral: "border-ink-faint/30 bg-ink-faint/10 text-ink-dim",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] leading-none tracking-[0.12em] uppercase",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const RISK_TONE: Record<RiskLevel, BadgeTone> = {
  critical: "crimson",
  high: "amber",
  medium: "teal",
  low: "neutral",
};

/**
 * Risk is never communicated by color alone: this badge always carries the
 * level as text, and callers pair it with a distinct icon.
 */
export function RiskBadge({
  level,
  className,
}: {
  level: RiskLevel;
  className?: string;
}) {
  return (
    <Badge tone={RISK_TONE[level]} className={className}>
      {RISK_LABEL[level]}
    </Badge>
  );
}

/** Marks a UI region that is deliberately inert until a later phase. */
export function PhaseBadge({ phase }: { phase: string }) {
  return (
    <Badge tone="neutral" className="border-dashed">
      {phase}
    </Badge>
  );
}
