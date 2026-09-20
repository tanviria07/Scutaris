import type { SearchHit } from "@contracts";
import { ORBIT_CLASSES, type OrbitClass } from "@/lib/types/orbital";
import type { Filters } from "@/lib/types/ui";

/** Backend conjunction hits are named `{primary_norad} vs {secondary_norad}`. */
const CONJUNCTION_NAME_RE = /^(\d{3,6})\s+vs\s+(\d{3,6})$/;
/** Some conjunction document IDs are `{primary}_{secondary}`. */
const CONJUNCTION_ID_RE = /^(\d{3,6})_(\d{3,6})$/;

function isOrbitClass(value: string): value is OrbitClass {
  return (ORBIT_CLASSES as readonly string[]).includes(value);
}

export function collectHitIds(hits: readonly SearchHit[]): {
  noradIds: string[];
  docIds: string[];
} {
  const noradIds = new Set<string>();
  const docIds = new Set<string>();

  for (const hit of hits) {
    if (hit.id) {
      docIds.add(hit.id);
      const paired = hit.id.match(CONJUNCTION_ID_RE);
      if (paired) {
        noradIds.add(paired[1]);
        noradIds.add(paired[2]);
      }
    }
    if (hit.norad_id) noradIds.add(hit.norad_id);

    const named = hit.name?.match(CONJUNCTION_NAME_RE);
    if (named) {
      noradIds.add(named[1]);
      noradIds.add(named[2]);
    }
  }

  return { noradIds: [...noradIds], docIds: [...docIds] };
}

export function hitMatchesChips(hit: SearchHit, filters: Filters): boolean {
  if (filters.orbitClasses.length > 0 && hit.orbit_class) {
    if (
      !isOrbitClass(hit.orbit_class) ||
      !filters.orbitClasses.includes(hit.orbit_class)
    ) {
      return false;
    }
  }

  if (
    filters.riskLevels.length > 0 &&
    hit.risk_level &&
    !filters.riskLevels.includes(hit.risk_level)
  ) {
    return false;
  }

  if (filters.kinds.length > 0) {
    const kind = hit.index.includes("debris")
      ? "debris"
      : hit.index.includes("satellites")
        ? "satellite"
        : null;
    if (kind && !filters.kinds.includes(kind)) return false;
  }

  return true;
}

export function indexLabel(index: string): string {
  return index.replace(/^scutaris-/, "") || index;
}
