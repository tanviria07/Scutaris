"use client";

import { useMemo } from "react";
import { useMissionStore } from "@/lib/store/useMissionStore";
import {
  useActiveSearchHits,
  useFilteredConjunctions,
  useFilteredObjects,
} from "@/lib/store/selectors";
import { Stat } from "@/components/ui/Stat";
import { formatInt, formatKm, formatPc } from "@/lib/utils/format";

export function StatsStrip() {
  const totalObjects = useMissionStore(
    (state) => state.satellites.length + state.debris.length,
  );
  const objects = useFilteredObjects();
  const conjunctions = useFilteredConjunctions();
  const liveHits = useActiveSearchHits();

  const summary = useMemo(() => {
    let critical = 0;
    let high = 0;
    let worstPc = 0;
    let closest = Number.POSITIVE_INFINITY;

    for (const { conjunction } of conjunctions) {
      if (conjunction.risk_level === "critical") critical += 1;
      if (conjunction.risk_level === "high") high += 1;
      if (conjunction.pc > worstPc) worstPc = conjunction.pc;
      if (conjunction.miss_km < closest) closest = conjunction.miss_km;
    }

    return { critical, high, worstPc, closest };
  }, [conjunctions]);

  const filtered = objects.length !== totalObjects;
  const visualizationGap =
    liveHits !== null && liveHits.length > 0 && objects.length === 0;

  return (
    <div className="scut-panel pointer-events-auto mx-3 flex w-fit flex-wrap items-center divide-x divide-[var(--color-hairline)]">
      <Stat
        label="Tracked"
        value={
          filtered
            ? `${formatInt(objects.length)} / ${formatInt(totalObjects)}`
            : formatInt(totalObjects)
        }
        tone="teal"
        hint={
          visualizationGap
            ? "Seeded globe has no orbit match for these live hits"
            : filtered
              ? "Matching active filters, out of the seeded catalogue"
              : undefined
        }
      />
      <Stat label="Conjunctions" value={formatInt(conjunctions.length)} />
      <Stat
        label="Critical"
        value={formatInt(summary.critical)}
        tone={summary.critical > 0 ? "crimson" : undefined}
      />
      <Stat
        label="High"
        value={formatInt(summary.high)}
        tone={summary.high > 0 ? "amber" : undefined}
      />
      <Stat
        label="Closest"
        value={
          Number.isFinite(summary.closest) ? formatKm(summary.closest, 2) : "—"
        }
      />
      <Stat
        label="Max Pc"
        value={summary.worstPc > 0 ? formatPc(summary.worstPc) : "—"}
        hint="Highest collision probability in the current selection"
      />
    </div>
  );
}
