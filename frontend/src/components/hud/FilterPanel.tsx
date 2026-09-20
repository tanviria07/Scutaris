"use client";

import { RotateCcw } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/lib/utils/cn";
import { useMissionStore } from "@/lib/store/useMissionStore";
import {
  OBJECT_KINDS,
  ORBIT_CLASSES,
  RISK_LEVELS,
  type ObjectKind,
  type OrbitClass,
  type RiskLevel,
} from "@/lib/types/orbital";
import { RISK_COLOR, RISK_LABEL } from "@/lib/orbital/risk";

/** Toggle one value in a filter array, preserving the declared order. */
function toggle<T>(current: readonly T[], value: T, order: readonly T[]): T[] {
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return order.filter((item) => next.includes(item));
}

function Chip({
  active,
  onClick,
  children,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors",
        active
          ? "border-teal/50 bg-teal/15 text-teal"
          : "border-[var(--color-hairline)] text-ink-dim hover:border-teal/30 hover:text-ink",
      )}
    >
      {dotColor ? (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="font-mono text-[9px] tracking-[0.14em] text-ink-faint uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

export function FilterPanel() {
  const filters = useMissionStore((state) => state.filters);
  const setFilters = useMissionStore((state) => state.setFilters);
  const resetFilters = useMissionStore((state) => state.resetFilters);

  const active =
    filters.orbitClasses.length +
      filters.riskLevels.length +
      filters.kinds.length >
      0 || filters.query.length > 0;

  return (
    <Panel
      title="Filters"
      as="section"
      action={
        active ? (
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1 font-mono text-[9px] tracking-[0.1em] text-ink-faint uppercase transition-colors hover:text-teal"
          >
            <RotateCcw className="size-2.5" aria-hidden="true" />
            Reset
          </button>
        ) : null
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <Group label="Orbit class">
          {ORBIT_CLASSES.map((orbitClass: OrbitClass) => (
            <Chip
              key={orbitClass}
              active={filters.orbitClasses.includes(orbitClass)}
              onClick={() =>
                setFilters({
                  orbitClasses: toggle(
                    filters.orbitClasses,
                    orbitClass,
                    ORBIT_CLASSES,
                  ),
                })
              }
            >
              {orbitClass}
            </Chip>
          ))}
        </Group>

        <Group label="Risk level">
          {RISK_LEVELS.map((level: RiskLevel) => (
            <Chip
              key={level}
              active={filters.riskLevels.includes(level)}
              dotColor={RISK_COLOR[level]}
              onClick={() =>
                setFilters({
                  riskLevels: toggle(filters.riskLevels, level, RISK_LEVELS),
                })
              }
            >
              {RISK_LABEL[level]}
            </Chip>
          ))}
        </Group>

        <Group label="Object type">
          {OBJECT_KINDS.map((kind: ObjectKind) => (
            <Chip
              key={kind}
              active={filters.kinds.includes(kind)}
              onClick={() =>
                setFilters({ kinds: toggle(filters.kinds, kind, OBJECT_KINDS) })
              }
            >
              {kind}
            </Chip>
          ))}
        </Group>
      </div>
    </Panel>
  );
}
