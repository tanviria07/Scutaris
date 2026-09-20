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

/** Stable identity for a hit across re-renders and result sets. */
export function hitKey(hit: SearchHit): string {
  return `${hit.index}:${hit.id ?? hit.norad_id ?? hit.name ?? ""}`;
}

/**
 * The conjunction participants a hit names explicitly, or null.
 *
 * Only the two exact backend shapes are read — `25544 vs 33775` in `name` and
 * `25544_33775` in `id`. Anything else yields null rather than a guess.
 */
export function parseConjunctionPair(
  hit: Pick<SearchHit, "name" | "id">,
): { primary: string; secondary: string } | null {
  const named = hit.name?.match(CONJUNCTION_NAME_RE);
  if (named) return { primary: named[1], secondary: named[2] };

  const identified = hit.id?.match(CONJUNCTION_ID_RE);
  if (identified) return { primary: identified[1], secondary: identified[2] };

  return null;
}

export function collectHitIds(hits: readonly SearchHit[]): {
  noradIds: string[];
  docIds: string[];
} {
  const noradIds = new Set<string>();
  const docIds = new Set<string>();

  for (const hit of hits) {
    if (hit.id) docIds.add(hit.id);
    if (hit.norad_id) noradIds.add(hit.norad_id);

    const pair = parseConjunctionPair(hit);
    if (pair) {
      noradIds.add(pair.primary);
      noradIds.add(pair.secondary);
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
