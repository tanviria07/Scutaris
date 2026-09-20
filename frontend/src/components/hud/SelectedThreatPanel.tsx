"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Badge, RiskBadge } from "@/components/ui/Badge";
import { useMissionStore } from "@/lib/store/useMissionStore";
import {
  useObjectIndex,
  useSelectedConjunction,
  useSelectedObject,
} from "@/lib/store/selectors";
import type { ConstraintsDoc } from "@/lib/types/orbital";
import { getDataService } from "@/lib/data/dataService";
import {
  formatDeg,
  formatKm,
  formatPc,
  formatUtc,
} from "@/lib/utils/format";
import { periodMinutesFromAltitude } from "@/lib/orbital/propagate";
import { GrokExplainSlot } from "./GrokExplainSlot";

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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-hairline)] px-3 py-2">
      <h3 className="mb-1 font-mono text-[10px] tracking-[0.14em] text-teal uppercase">
        {title}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

export function SelectedThreatPanel() {
  const object = useSelectedObject();
  const conjunction = useSelectedConjunction();
  const clearSelection = useMissionStore((state) => state.clearSelection);
  const index = useObjectIndex();
  // Keyed by NORAD id so a result that arrives after the selection moved on
  // is simply ignored rather than briefly rendered against the wrong object.
  const [loaded, setLoaded] = useState<{
    noradId: string;
    doc: ConstraintsDoc | null;
  } | null>(null);

  const noradId = object?.norad_id ?? null;

  useEffect(() => {
    if (!noradId) return;

    let cancelled = false;
    void getDataService()
      .getConstraints(noradId)
      .then((doc) => {
        if (!cancelled) setLoaded({ noradId, doc });
      });
    return () => {
      cancelled = true;
    };
  }, [noradId]);

  const constraints =
    loaded && loaded.noradId === noradId ? loaded.doc : null;

  if (!object) return null;

  const secondary = conjunction
    ? index.get(conjunction.secondary_norad)
    : undefined;

  const period = periodMinutesFromAltitude(object.altitude_km);

  return (
    <Panel
      as="aside"
      title="Selected threat"
      className="pointer-events-auto max-h-full w-full overflow-hidden"
      action={
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Close selected threat panel"
          className="text-ink-faint transition-colors hover:text-teal"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      }
    >
      <div className="scut-scroll min-h-0 overflow-y-auto">
        <div className="flex items-start justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-ink">{object.name}</p>
            <p className="font-mono text-[10px] text-ink-faint">
              NORAD {object.norad_id}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone="teal">{object.orbit_class}</Badge>
            <Badge>{object.kind}</Badge>
          </div>
        </div>

        <Section title="Orbital elements">
          <Row label="Mean altitude" value={formatKm(object.altitude_km, 1)} />
          <Row label="Current altitude" value={formatKm(object.alt_km_now, 1)} />
          <Row label="Inclination" value={formatDeg(object.inclination_deg)} />
          <Row label="Latitude" value={formatDeg(object.lat, 3)} />
          <Row label="Longitude" value={formatDeg(object.lon, 3)} />
          <Row label="Period" value={`${period.toFixed(1)} min`} />
          <Row label="Epoch" value={formatUtc(object.epoch_utc)} />
          {object.kind === "debris" ? (
            <>
              <Row label="Parent" value={object.parent_object ?? "—"} />
              <Row
                label="RCS"
                value={object.rcs_m2 ? `${object.rcs_m2.toFixed(3)} m²` : "—"}
              />
              <Row label="Group" value={object.group ?? "—"} />
            </>
          ) : (
            <Row label="Operator" value={object.operator ?? "—"} />
          )}
        </Section>

        {conjunction ? (
          <Section title="Conjunction geometry">
            <Row
              label="Risk"
              value={<RiskBadge level={conjunction.risk_level} />}
            />
            <Row label="Screening id" value={conjunction.id} />
            <Row
              label="Secondary"
              value={secondary?.name ?? conjunction.secondary_norad}
            />
            <Row label="Miss distance" value={formatKm(conjunction.miss_km, 3)} />
            <Row label="Probability" value={formatPc(conjunction.pc)} />
            <Row label="TCA" value={formatUtc(conjunction.tca_utc)} />
          </Section>
        ) : null}

        {constraints ? (
          <Section title="Maneuver constraints">
            <Row label="Fuel" value={`${constraints.fuel_kg.toFixed(1)} kg`} />
            <Row label="Max Δv" value={`${constraints.max_dv_ms.toFixed(2)} m/s`} />
            <Row
              label="Min perigee"
              value={formatKm(constraints.min_perigee_km, 1)}
            />
            <Row
              label="Blackouts"
              value={`${constraints.blackout_windows.length} window${constraints.blackout_windows.length === 1 ? "" : "s"}`}
            />
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-dim">
              {constraints.notes}
            </p>
          </Section>
        ) : null}

        {conjunction ? <GrokExplainSlot conjunction={conjunction} /> : null}
      </div>
    </Panel>
  );
}
