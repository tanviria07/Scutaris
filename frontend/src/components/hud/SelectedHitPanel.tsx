"use client";

import { X } from "lucide-react";
import type { SearchHit } from "@contracts";
import { Panel } from "@/components/ui/Panel";
import { Badge, RiskBadge } from "@/components/ui/Badge";
import { indexLabel, parseConjunctionPair } from "@/lib/data/searchHits";
import {
  missKmFromSnippet,
  riskCardTargetFromHit,
} from "@/lib/data/visualizeContext";
import { useMissionStore } from "@/lib/store/useMissionStore";
import { useObjectIndex } from "@/lib/store/selectors";
import { formatKm } from "@/lib/utils/format";
import { VisualizeButton } from "./VisualizeButton";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="font-mono text-[9px] tracking-[0.1em] text-ink-faint uppercase">
        {label}
      </dt>
      <dd className="truncate font-mono text-[11px] text-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}

/**
 * Right-hand detail panel for a live Elasticsearch hit.
 *
 * Deliberately independent of the seeded catalogue: a hit that has no orbit in
 * the 944-object globe still gets a full panel and can still be visualized.
 * Fields absent from the document read `—` rather than borrowing mock values.
 */
export function SelectedHitPanel({ hit }: { hit: SearchHit }) {
  const dismissSelection = useMissionStore((state) => state.dismissSelection);
  const query = useMissionStore((state) => state.searchAppliedQuery);
  const index = useObjectIndex();

  const pair = parseConjunctionPair(hit);
  const missKm = missKmFromSnippet(hit.snippet);
  const primaryNorad = pair?.primary ?? hit.norad_id;
  const target = riskCardTargetFromHit(hit, query);

  const seededPrimary = primaryNorad ? index.get(primaryNorad) : undefined;
  const seededSecondary = pair ? index.get(pair.secondary) : undefined;
  const inCatalogue = Boolean(seededPrimary ?? seededSecondary);

  return (
    <Panel
      as="aside"
      title="Selected result"
      className="pointer-events-auto max-h-full w-full overflow-hidden"
      action={
        <button
          type="button"
          onClick={dismissSelection}
          aria-label="Close selected result panel"
          className="text-ink-faint transition-colors hover:text-teal"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      }
    >
      <div className="scut-scroll min-h-0 overflow-y-auto">
        <div className="flex items-start justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-ink">
              {hit.name ?? hit.norad_id ?? hit.id ?? "Elasticsearch hit"}
            </p>
            <p className="font-mono text-[10px] text-ink-faint">
              {indexLabel(hit.index)}
              {hit.id ? ` · ${hit.id}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone="teal">Live ES</Badge>
            {hit.risk_level ? <RiskBadge level={hit.risk_level} /> : null}
          </div>
        </div>

        <section className="border-t border-[var(--color-hairline)] px-3 py-2">
          <h3 className="mb-1 font-mono text-[10px] tracking-[0.14em] text-teal uppercase">
            Result fields
          </h3>
          <dl>
            <Row
              label="Primary NORAD"
              value={
                seededPrimary
                  ? `${primaryNorad} · ${seededPrimary.name}`
                  : (primaryNorad ?? "—")
              }
            />
            <Row
              label="Secondary NORAD"
              value={
                pair
                  ? seededSecondary
                    ? `${pair.secondary} · ${seededSecondary.name}`
                    : pair.secondary
                  : "—"
              }
            />
            <Row
              label="Risk"
              value={hit.risk_level ? <RiskBadge level={hit.risk_level} /> : "—"}
            />
            <Row
              label="Miss distance"
              value={missKm !== null ? formatKm(missKm, 3) : "—"}
            />
            <Row label="Orbit class" value={hit.orbit_class ?? "—"} />
            <Row label="Source index" value={hit.index} />
            <Row label="Score" value={hit.score.toFixed(3)} />
          </dl>
        </section>

        {hit.snippet ? (
          <section className="border-t border-[var(--color-hairline)] px-3 py-2">
            <h3 className="mb-1 font-mono text-[10px] tracking-[0.14em] text-teal uppercase">
              Snippet
            </h3>
            <p className="text-[11px] leading-relaxed text-ink-dim">
              {hit.snippet}
            </p>
          </section>
        ) : null}

        <section className="border-t border-[var(--color-hairline)] p-3">
          <VisualizeButton target={target} />
          <p className="mt-1.5 font-mono text-[9px] leading-relaxed text-ink-faint">
            {inCatalogue
              ? "Grok Imagine renders a risk card from this document."
              : "No seeded orbit for this result; the card still uses its real fields."}
          </p>
        </section>
      </div>
    </Panel>
  );
}
