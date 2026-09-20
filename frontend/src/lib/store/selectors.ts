"use client";

import { useMemo } from "react";
import type {
  Conjunction,
  OrbitalObject,
  ResolvedConjunction,
} from "@/lib/types/orbital";
import type { Filters } from "@/lib/types/ui";
import { RISK_SEVERITY } from "@/lib/orbital/risk";
import { useMissionStore } from "./useMissionStore";

/**
 * Derived views over the store.
 *
 * Filtering runs over ~950 objects on every keystroke, so each hook memoizes
 * on the narrowest possible dependency set.
 */

function matchesText(object: OrbitalObject, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase().trim();
  if (!needle) return true;

  if (object.norad_id.includes(needle)) return true;
  if (object.name.toLowerCase().includes(needle)) return true;
  if (object.orbit_class.toLowerCase() === needle) return true;
  if (object.kind === "debris") {
    if ((object.parent_object ?? "").toLowerCase().includes(needle)) return true;
    if ((object.group ?? "").toLowerCase().includes(needle)) return true;
  }
  return (object.text_blob ?? "").toLowerCase().includes(needle);
}

export function filterObjects(
  objects: readonly OrbitalObject[],
  filters: Filters,
  riskByNorad: ReadonlyMap<string, number>,
): OrbitalObject[] {
  const { orbitClasses, kinds, riskLevels, query } = filters;

  return objects.filter((object) => {
    if (kinds.length > 0 && !kinds.includes(object.kind)) return false;
    if (orbitClasses.length > 0 && !orbitClasses.includes(object.orbit_class)) {
      return false;
    }
    if (riskLevels.length > 0) {
      const severity = riskByNorad.get(object.norad_id);
      // An object with no conjunction has no risk level, so a risk filter
      // excludes it rather than silently treating it as low.
      if (severity === undefined) return false;
      const allowed = riskLevels.some(
        (level) => RISK_SEVERITY[level] === severity,
      );
      if (!allowed) return false;
    }
    return matchesText(object, query);
  });
}

/** Highest risk severity touching each NORAD id, across all conjunctions. */
export function useRiskByNorad(): ReadonlyMap<string, number> {
  const conjunctions = useMissionStore((state) => state.conjunctions);

  return useMemo(() => {
    const map = new Map<string, number>();
    for (const conjunction of conjunctions) {
      const severity = RISK_SEVERITY[conjunction.risk_level];
      for (const norad of [conjunction.primary_norad, conjunction.secondary_norad]) {
        const existing = map.get(norad);
        if (existing === undefined || severity > existing) map.set(norad, severity);
      }
    }
    return map;
  }, [conjunctions]);
}

/** All catalogue objects, unfiltered. */
export function useAllObjects(): OrbitalObject[] {
  const satellites = useMissionStore((state) => state.satellites);
  const debris = useMissionStore((state) => state.debris);

  return useMemo(
    () => [...satellites, ...debris],
    [satellites, debris],
  );
}

export function useObjectIndex(): ReadonlyMap<string, OrbitalObject> {
  const objects = useAllObjects();
  return useMemo(
    () => new Map(objects.map((object) => [object.norad_id, object])),
    [objects],
  );
}

/** Objects surviving the active filters. Drives both the globe and the feed. */
export function useFilteredObjects(): OrbitalObject[] {
  const objects = useAllObjects();
  const filters = useMissionStore((state) => state.filters);
  const riskByNorad = useRiskByNorad();

  return useMemo(
    () => filterObjects(objects, filters, riskByNorad),
    [objects, filters, riskByNorad],
  );
}

/**
 * Conjunctions surviving the active filters, most severe first.
 *
 * Text and orbit-class filters apply via the participants, so searching "ISS"
 * narrows the threat feed as well as the globe.
 */
export function useFilteredConjunctions(): ResolvedConjunction[] {
  const conjunctions = useMissionStore((state) => state.conjunctions);
  const filters = useMissionStore((state) => state.filters);
  const index = useObjectIndex();

  return useMemo(() => {
    const resolved: ResolvedConjunction[] = conjunctions.map((conjunction) => ({
      conjunction,
      primary: index.get(conjunction.primary_norad) ?? null,
      secondary: index.get(conjunction.secondary_norad) ?? null,
    }));

    const filtered = resolved.filter(({ conjunction, primary, secondary }) => {
      if (
        filters.riskLevels.length > 0 &&
        !filters.riskLevels.includes(conjunction.risk_level)
      ) {
        return false;
      }

      const participants = [primary, secondary].filter(
        (value): value is OrbitalObject => value !== null,
      );

      if (filters.orbitClasses.length > 0) {
        const hit = participants.some((object) =>
          filters.orbitClasses.includes(object.orbit_class),
        );
        if (!hit) return false;
      }

      if (filters.kinds.length > 0) {
        const hit = participants.some((object) =>
          filters.kinds.includes(object.kind),
        );
        if (!hit) return false;
      }

      if (filters.query.trim()) {
        const needle = filters.query.toLowerCase().trim();
        const inText =
          conjunction.id.toLowerCase().includes(needle) ||
          (conjunction.text_blob ?? "").toLowerCase().includes(needle);
        const inParticipants = participants.some((object) =>
          matchesText(object, filters.query),
        );
        if (!inText && !inParticipants) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const bySeverity =
        RISK_SEVERITY[b.conjunction.risk_level] -
        RISK_SEVERITY[a.conjunction.risk_level];
      if (bySeverity !== 0) return bySeverity;
      return a.conjunction.miss_km - b.conjunction.miss_km;
    });
  }, [conjunctions, filters, index]);
}

/** The conjunction backing the current selection, if any. */
export function useSelectedConjunction(): Conjunction | null {
  const id = useMissionStore((state) => state.selectedConjunctionId);
  const conjunctions = useMissionStore((state) => state.conjunctions);

  return useMemo(
    () => conjunctions.find((conjunction) => conjunction.id === id) ?? null,
    [conjunctions, id],
  );
}

export function useSelectedObject(): OrbitalObject | null {
  const id = useMissionStore((state) => state.selectedNoradId);
  const index = useObjectIndex();
  return id ? (index.get(id) ?? null) : null;
}
