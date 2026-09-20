import type { SearchHit } from "@contracts";
import type { Conjunction, OrbitalObject, RiskLevel } from "@/lib/types/orbital";
import { hitKey, indexLabel, parseConjunctionPair } from "./searchHits";

/**
 * Builders for the `risk_card` context sent to `POST /visualize`.
 *
 * Every value is copied from a real document. Nothing is inferred: a field the
 * source does not carry is simply omitted, and the backend template renders it
 * as `unknown` rather than showing a fabricated distance, Pc or TCA.
 */

/** What the visualize layer needs to run and label one generation. */
export interface VisualizeTarget {
  /** Identity of the selection, so a stale response can be discarded. */
  key: string;
  title: string;
  subtitle: string | null;
  riskLevel: RiskLevel | null;
  context: Record<string, unknown>;
}

/** `miss 0.4 km` / `Miss 431.578 km` stated verbatim in a snippet, or null. */
const SNIPPET_MISS_KM_RE = /\bmiss\s+(\d+(?:\.\d+)?)\s*km\b/i;

export function missKmFromSnippet(snippet: string | null): number | null {
  const match = snippet?.match(SNIPPET_MISS_KM_RE);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function compact(
  entries: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entries).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}

/** Seeded conjunction: every template field is present and real. */
export function riskCardTargetFromConjunction(
  conjunction: Conjunction,
  primary: OrbitalObject | null,
  secondary: OrbitalObject | null,
): VisualizeTarget {
  const primaryName = primary?.name ?? null;
  const secondaryName = secondary?.name ?? null;

  return {
    key: `conjunction:${conjunction.id}`,
    title: `${primaryName ?? conjunction.primary_norad} vs ${
      secondaryName ?? conjunction.secondary_norad
    }`,
    subtitle: `Screening ${conjunction.id}`,
    riskLevel: conjunction.risk_level,
    context: compact({
      primary_norad: conjunction.primary_norad,
      secondary_norad: conjunction.secondary_norad,
      primary_name: primaryName,
      secondary_name: secondaryName,
      risk_level: conjunction.risk_level,
      miss_km: conjunction.miss_km,
      pc: conjunction.pc,
      tca_utc: conjunction.tca_utc,
    }),
  };
}

/**
 * Live Elasticsearch hit: pass through what the document states, plus the two
 * safe extractions (participants from an exact `A vs B` name or `A_B` id, and
 * a miss distance quoted in the snippet).
 */
export function riskCardTargetFromHit(
  hit: SearchHit,
  query: string,
): VisualizeTarget {
  const pair = parseConjunctionPair(hit);
  const missKm = missKmFromSnippet(hit.snippet);
  const title = hit.name ?? hit.norad_id ?? hit.id ?? "Elasticsearch hit";

  return {
    key: `hit:${hitKey(hit)}`,
    title,
    subtitle: indexLabel(hit.index),
    riskLevel: hit.risk_level,
    context: compact({
      index: hit.index,
      id: hit.id,
      norad_id: hit.norad_id,
      name: hit.name,
      primary_norad: pair?.primary ?? hit.norad_id,
      secondary_norad: pair?.secondary,
      risk_level: hit.risk_level,
      orbit_class: hit.orbit_class,
      miss_km: missKm,
      snippet: hit.snippet,
      query,
    }),
  };
}
