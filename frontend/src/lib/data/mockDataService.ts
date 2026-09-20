import type {
  Conjunction,
  DebrisObject,
  SatelliteObject,
} from "@/lib/types/orbital";
import type {
  SearchHit,
  SearchRequest,
  SearchResponse,
  ThreatExplanation,
} from "@/lib/types/api";
import { RISK_LABEL } from "@/lib/orbital/risk";
import { formatUtc } from "@/lib/utils/format";
import type { ScutarisDataService } from "./dataService";
import { MOCK_SATELLITES } from "./fixtures/satellites";
import { MOCK_DEBRIS } from "./fixtures/debris";
import { MOCK_CONJUNCTIONS } from "./fixtures/conjunctions";
import { MOCK_CONSTRAINTS } from "./fixtures/constraints";

/**
 * In-process data service backed entirely by deterministic fixtures.
 *
 * Makes no network requests. Async signatures match the eventual HTTP client
 * so swapping implementations is a one-line change in `getDataService()`.
 */

const constraintsByNorad = new Map(
  MOCK_CONSTRAINTS.map((doc) => [doc.norad_id, doc]),
);

/**
 * Local stand-in for Elasticsearch hybrid scoring.
 *
 * Deliberately simple: term coverage over the same fields `_bm25_query`
 * boosts in backend/es_client.py (name^3, text_blob, orbit_class, group,
 * parent_object), plus an exact-NORAD boost. It is a placeholder for BM25 +
 * kNN + RRF, not an approximation of it, and the UI labels it as such.
 */
function scoreObject(
  object: SatelliteObject | DebrisObject,
  terms: readonly string[],
): number {
  if (terms.length === 0) return 0;

  const name = object.name.toLowerCase();
  const blob = (object.text_blob ?? "").toLowerCase();
  const orbitClass = object.orbit_class.toLowerCase();
  const group = object.kind === "debris" ? (object.group ?? "").toLowerCase() : "";
  const parent =
    object.kind === "debris" ? (object.parent_object ?? "").toLowerCase() : "";

  let score = 0;
  for (const term of terms) {
    if (object.norad_id === term) score += 8;
    if (name.includes(term)) score += 3;
    if (parent.includes(term)) score += 2;
    if (group.includes(term)) score += 1.5;
    if (orbitClass === term) score += 1.5;
    if (blob.includes(term)) score += 1;
  }
  return score;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((token) => token.length > 1);
}

function toHit(
  object: SatelliteObject | DebrisObject,
  score: number,
): SearchHit {
  const blob = object.text_blob ?? "";
  return {
    index: object.kind === "debris" ? "scutaris-debris" : "scutaris-satellites",
    id: object.norad_id,
    norad_id: object.norad_id,
    name: object.name,
    score: Number(score.toFixed(6)),
    orbit_class: object.orbit_class,
    lat: object.lat,
    lon: object.lon,
    alt_km_now: object.alt_km_now,
    snippet: blob.length <= 240 ? blob : `${blob.slice(0, 237)}...`,
  };
}

export const mockDataService: ScutarisDataService = {
  name: "mock",

  async listSatellites() {
    return [...MOCK_SATELLITES];
  },

  async listDebris() {
    return [...MOCK_DEBRIS];
  },

  async listConjunctions() {
    return [...MOCK_CONJUNCTIONS];
  },

  async getConstraints(noradId: string) {
    return constraintsByNorad.get(noradId) ?? null;
  },

  async search(request: SearchRequest): Promise<SearchResponse> {
    const started =
      typeof performance !== "undefined" ? performance.now() : 0;

    const terms = tokenize(request.query);
    const size = request.size ?? 20;
    const allowedOrbits = request.filters?.orbit_class;
    const allowedIndices = request.filters?.indices;

    const pool: (SatelliteObject | DebrisObject)[] = [];
    if (!allowedIndices || allowedIndices.includes("scutaris-satellites")) {
      pool.push(...MOCK_SATELLITES);
    }
    if (!allowedIndices || allowedIndices.includes("scutaris-debris")) {
      pool.push(...MOCK_DEBRIS);
    }

    const hits = pool
      .filter(
        (object) =>
          !allowedOrbits?.length || allowedOrbits.includes(object.orbit_class),
      )
      .map((object) => ({ object, score: scoreObject(object, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.object.norad_id.localeCompare(b.object.norad_id))
      .slice(0, size)
      .map((entry) => toHit(entry.object, entry.score));

    // Recognise the golden query's asset so the Phase 2 shape is exercised.
    const assetNorad = terms.includes("iss") ? "25544" : undefined;
    const tookMs =
      typeof performance !== "undefined"
        ? Math.max(0, Math.round(performance.now() - started))
        : 0;

    return {
      query_expanded: assetNorad
        ? { asset_norad: assetNorad, intent: "debris_near_asset" }
        : undefined,
      hits,
      took_ms: tookMs,
      source: "mock",
    };
  },

  async explainThreat(conjunction: Conjunction): Promise<ThreatExplanation> {
    const primary = MOCK_SATELLITES.find(
      (s) => s.norad_id === conjunction.primary_norad,
    );
    const secondary = MOCK_DEBRIS.find(
      (d) => d.norad_id === conjunction.secondary_norad,
    );

    const primaryName = primary?.name ?? `NORAD ${conjunction.primary_norad}`;
    const secondaryName = secondary?.name ?? `NORAD ${conjunction.secondary_norad}`;

    return {
      conjunctionId: conjunction.id,
      headline: `${RISK_LABEL[conjunction.risk_level]} conjunction: ${primaryName} vs ${secondaryName}`,
      paragraphs: [
        `Screening places ${secondaryName} within ${conjunction.miss_km.toFixed(2)} km of ${primaryName} at ${formatUtc(conjunction.tca_utc)}, with a collision probability of ${conjunction.pc.toExponential(1)}.`,
        `The fragment originates from the ${secondary?.parent_object ?? "unknown"} breakup and is tracked in a ${secondary?.orbit_class ?? "LEO"} regime at roughly ${secondary?.altitude_km.toFixed(0) ?? "?"} km. Relative geometry is dominated by the inclination difference, so the encounter is short and high-velocity.`,
      ],
      recommendation:
        conjunction.risk_level === "critical"
          ? "Recommend preparing a debris-avoidance maneuver and re-screening 8 hours before closest approach."
          : "Continue monitoring. Re-screen when an updated element set is published.",
      imageUrl: null,
      source: "mock",
    };
  },
};
