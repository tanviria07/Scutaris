"use client";

import { useMemo } from "react";
import type {
  Conjunction,
  OrbitalObject,
  ResolvedConjunction,
} from "@/lib/types/orbital";
import type { Filters } from "@/lib/types/ui";
import type { SearchHit } from "@contracts";
import { RISK_SEVERITY } from "@/lib/orbital/risk";
import { hitMatchesChips } from "@/lib/data/searchHits";
import { useMissionStore } from "./useMissionStore";

/**
 * Derived views over the store.
 *
 * Chip filters always apply. Text search applies only through SearchResponse
 * hit IDs — never by passing a natural-language sentence through substring
 * matching — so the globe stays on the seeded catalogue.
 */

export function filterObjects(
  objects: readonly OrbitalObject[],
  filters: Filters,
  riskByNorad: ReadonlyMap<string, number>,
  searchNoradIds: ReadonlySet<string> | null,
): OrbitalObject[] {
  const { orbitClasses, kinds, riskLevels } = filters;

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
    if (searchNoradIds) {
      return searchNoradIds.has(object.norad_id);
    }
    return true;
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

function useAppliedSearchNorads(): ReadonlySet<string> | null {
  const query = useMissionStore((state) => state.filters.query);
  const appliedQuery = useMissionStore((state) => state.searchAppliedQuery);
  const noradIds = useMissionStore((state) => state.searchHitNoradIds);
  const response = useMissionStore((state) => state.searchResponse);

  return useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || !response || appliedQuery !== trimmed) return null;
    return new Set(noradIds);
  }, [query, appliedQuery, noradIds, response]);
}

function useSearchIsApplied(): boolean {
  const query = useMissionStore((state) => state.filters.query);
  const appliedQuery = useMissionStore((state) => state.searchAppliedQuery);
  const response = useMissionStore((state) => state.searchResponse);
  return Boolean(query.trim() && response && appliedQuery === query.trim());
}

/** Objects surviving the active filters. Drives both the globe and the feed. */
export function useFilteredObjects(): OrbitalObject[] {
  const objects = useAllObjects();
  const filters = useMissionStore((state) => state.filters);
  const riskByNorad = useRiskByNorad();
  const searchNoradIds = useAppliedSearchNorads();

  return useMemo(
    () => filterObjects(objects, filters, riskByNorad, searchNoradIds),
    [objects, filters, riskByNorad, searchNoradIds],
  );
}

/**
 * Seeded conjunctions surviving chip filters.
 *
 * When a SearchResponse is applied, only document-ID matches are kept so a
 * live hit is never displayed with an unrelated mock miss distance, Pc, or TCA.
 */
export function useFilteredConjunctions(): ResolvedConjunction[] {
  const conjunctions = useMissionStore((state) => state.conjunctions);
  const filters = useMissionStore((state) => state.filters);
  const index = useObjectIndex();
  const searchApplied = useSearchIsApplied();
  const hitDocIds = useMissionStore((state) => state.searchHitDocIds);

  return useMemo(() => {
    const allowedDocs = searchApplied ? new Set(hitDocIds) : null;

    const resolved: ResolvedConjunction[] = conjunctions.map((conjunction) => ({
      conjunction,
      primary: index.get(conjunction.primary_norad) ?? null,
      secondary: index.get(conjunction.secondary_norad) ?? null,
    }));

    const filtered = resolved.filter(({ conjunction, primary, secondary }) => {
      if (allowedDocs && !allowedDocs.has(conjunction.id)) return false;

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

      return true;
    });

    return filtered.sort((a, b) => {
      const bySeverity =
        RISK_SEVERITY[b.conjunction.risk_level] -
        RISK_SEVERITY[a.conjunction.risk_level];
      if (bySeverity !== 0) return bySeverity;
      return a.conjunction.miss_km - b.conjunction.miss_km;
    });
  }, [conjunctions, filters, index, searchApplied, hitDocIds]);
}

/** Live SearchHits for the current query, chip-filtered. Null when idle. */
export function useActiveSearchHits(): SearchHit[] | null {
  const filters = useMissionStore((state) => state.filters);
  const applied = useSearchIsApplied();
  const response = useMissionStore((state) => state.searchResponse);

  return useMemo(() => {
    if (!applied || !response) return null;
    return response.hits.filter((hit) => hitMatchesChips(hit, filters));
  }, [applied, response, filters]);
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
