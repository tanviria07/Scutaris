"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { VisualizeTarget } from "@/lib/data/visualizeContext";
import { useMissionStore } from "@/lib/store/useMissionStore";

/**
 * Operator trigger for a Grok Imagine risk card.
 *
 * Nothing is generated until this is pressed, and it disables itself while its
 * own target is in flight so a double click cannot start two generations.
 */
export function VisualizeButton({
  target,
  className,
}: {
  target: VisualizeTarget;
  className?: string;
}) {
  const requestVisualize = useMissionStore((state) => state.requestVisualize);
  const status = useMissionStore((state) => state.visualize.status);
  const activeKey = useMissionStore((state) => state.visualize.target?.key);

  const busy = status === "loading" && activeKey === target.key;

  return (
    <button
      type="button"
      onClick={() => requestVisualize(target)}
      disabled={busy}
      aria-label={`Visualize ${target.title} with Grok Imagine`}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 border border-teal/40 bg-teal/10 px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-teal uppercase transition-colors hover:bg-teal/20 disabled:cursor-wait disabled:opacity-50",
        className,
      )}
    >
      <Sparkles className="size-3 shrink-0" aria-hidden="true" />
      {busy ? "Generating with Grok Imagine…" : "Visualize with Grok"}
    </button>
  );
}
