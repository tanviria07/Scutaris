import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "teal" | "amber" | "crimson";
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-1.5" title={hint}>
      <span className="font-mono text-[9px] tracking-[0.14em] text-ink-faint uppercase">
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-base leading-none tabular-nums",
          tone === "teal" && "text-teal",
          tone === "amber" && "text-amber",
          tone === "crimson" && "text-crimson",
          !tone && "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
