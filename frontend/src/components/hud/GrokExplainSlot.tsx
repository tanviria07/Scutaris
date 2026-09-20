"use client";

import { useState } from "react";
import { ImageIcon, Sparkles } from "lucide-react";
import type { Conjunction } from "@/lib/types/orbital";
import type { ThreatExplanation } from "@/lib/types/ui";
import { getDataService } from "@/lib/data/dataService";
import { PhaseBadge } from "@/components/ui/Badge";

/**
 * GROK IMAGINE SEAM.
 *
 * Phase 1 renders canned prose from `mockDataService.explainThreat` and a
 * placeholder frame sized for the square `risk_card` that Grok Imagine will
 * eventually return. Phase 5 swaps the service implementation to call
 * `POST /visualize` with `type: "risk_card"` plus the OPS_BRIEF agent output;
 * this component's markup does not change.
 */
export function GrokExplainSlot({ conjunction }: { conjunction: Conjunction }) {
  const [explanation, setExplanation] = useState<ThreatExplanation | null>(null);
  const [busy, setBusy] = useState(false);

  async function explain() {
    setBusy(true);
    try {
      setExplanation(await getDataService().explainThreat(conjunction));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-[var(--color-hairline)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-teal uppercase">
          <Sparkles className="size-3" aria-hidden="true" />
          Threat explanation
        </h3>
        <PhaseBadge phase="Grok · P5" />
      </div>

      {explanation ? (
        <div className="flex flex-col gap-2">
          <div
            className="flex aspect-square w-full items-center justify-center border border-dashed border-[var(--color-hairline)] bg-black/30"
            role="img"
            aria-label="Placeholder for the Grok Imagine risk card, generated in Phase 5"
          >
            <span className="flex flex-col items-center gap-1 text-ink-faint">
              <ImageIcon className="size-5" aria-hidden="true" />
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase">
                risk_card · Phase 5
              </span>
            </span>
          </div>

          <p className="font-mono text-[11px] leading-relaxed text-ink">
            {explanation.headline}
          </p>
          {explanation.paragraphs.map((paragraph) => (
            <p
              key={paragraph.slice(0, 32)}
              className="text-[11px] leading-relaxed text-ink-dim"
            >
              {paragraph}
            </p>
          ))}
          <p className="border-l-2 border-amber/50 pl-2 text-[11px] leading-relaxed text-amber">
            {explanation.recommendation}
          </p>
          <p className="font-mono text-[9px] text-ink-faint">
            Generated locally from mock data. No model was called.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={explain}
          disabled={busy}
          className="w-full border border-teal/40 bg-teal/10 px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-teal uppercase transition-colors hover:bg-teal/20 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Explain this threat"}
        </button>
      )}
    </section>
  );
}
