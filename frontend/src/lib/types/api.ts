/**
 * PROPOSED FastAPI contract. Nothing in this file is implemented yet.
 *
 * Provenance matters here:
 *   - `/search`, `/esql`, `/visualize` and `/agent/stream` come from FIX 3 of
 *     docs/HACKMIT_PLAN_v3.md. The request/response shapes below are typed from
 *     the JSON samples in that document.
 *   - `PROPOSED_ENDPOINTS` at the bottom are *new suggestions* from the
 *     frontend side. The globe needs bulk reads that FIX 3 does not cover.
 *     They are written down for backend review, not assumed to exist.
 *
 * Phase 1 makes no network calls at all. These types exist so that the mock
 * service and the eventual HTTP client share one vocabulary.
 */

import type {
  Conjunction,
  ConstraintsDoc,
  OrbitClass,
  OrbitalObject,
  RiskLevel,
} from "./orbital";

export const SCUTARIS_INDICES = [
  "scutaris-satellites",
  "scutaris-debris",
  "scutaris-conjunctions",
  "scutaris-constraints",
] as const;

export type ScutarisIndex = (typeof SCUTARIS_INDICES)[number];

/** `POST /search` request, per FIX 3. */
export interface SearchRequest {
  query: string;
  filters?: {
    orbit_class?: OrbitClass[];
    risk_level?: RiskLevel[];
    indices?: ScutarisIndex[];
  };
  size?: number;
}

/** One fused BM25 + kNN hit. Mirrors `_format_hit` in backend/es_client.py. */
export interface SearchHit {
  index: ScutarisIndex;
  id: string;
  norad_id: string;
  name?: string;
  score: number;
  risk_level?: RiskLevel;
  orbit_class?: OrbitClass;
  lat?: number;
  lon?: number;
  alt_km_now?: number;
  snippet: string;
}

/** `POST /search` response, per FIX 3. */
export interface SearchResponse {
  query_expanded?: {
    asset_norad?: string;
    intent?: string;
  };
  hits: SearchHit[];
  took_ms: number;
  /**
   * Phase 1 only. Marks results as locally computed so the UI can label the
   * search field honestly instead of implying Elasticsearch ran.
   */
  source: "mock" | "elastic";
}

/** `POST /esql` request. Allowlisted to `FROM scutaris-*` by the backend. */
export interface EsqlRequest {
  query: string;
}

export interface EsqlResponse {
  query: string;
  columns: { name: string; type: string }[];
  values: unknown[][];
  rows: Record<string, unknown>[];
}

/** `POST /visualize` — Grok Imagine card, per FIX 4. */
export type VisualizeCardType = "risk_card" | "object_card" | "scenario_card";

export interface VisualizeRequest {
  type: VisualizeCardType;
  context: Record<string, unknown>;
}

export interface VisualizeResponse {
  type: VisualizeCardType;
  prompt_used: string;
  image_url: string;
  cached: boolean;
  took_ms: number;
}

/**
 * Natural-language explanation of a single threat, rendered by GrokExplainSlot.
 * Phase 1 returns canned prose from the mock service; Phase 5 routes this
 * through `/visualize` plus the OPS_BRIEF agent.
 */
export interface ThreatExplanation {
  conjunctionId: string;
  headline: string;
  paragraphs: string[];
  recommendation: string;
  /** Populated only once Grok Imagine is wired up in Phase 5. */
  imageUrl: string | null;
  source: "mock" | "grok";
}

/** Bulk-read responses used by the globe. See PROPOSED_ENDPOINTS. */
export interface ObjectsResponse {
  objects: OrbitalObject[];
  total: number;
}

export interface ConjunctionsResponse {
  conjunctions: Conjunction[];
  total: number;
}

export interface ConstraintsResponse {
  constraints: ConstraintsDoc | null;
}

/**
 * Suggestions for the backend, not a description of anything that exists.
 *
 * The globe renders the whole catalogue at once, which relevance-ranked
 * `/search` is the wrong tool for. Two plain reads would cover it:
 *
 *   GET /objects?index=scutaris-debris&limit=1000&orbit_class=LEO
 *     -> ObjectsResponse
 *   GET /conjunctions?risk_level=critical,high&horizon_hours=48
 *     -> ConjunctionsResponse
 *
 * Both should strip the `embedding` field, exactly as `_format_hit` already
 * does, and should set `kind` from the source index so the frontend
 * discriminated union resolves without a remap.
 */
export const PROPOSED_ENDPOINTS = {
  objects: "GET /objects",
  conjunctions: "GET /conjunctions",
  constraints: "GET /constraints/{norad_id}",
  search: "POST /search",
  esql: "POST /esql",
  visualize: "POST /visualize",
  agentStream: "GET /agent/stream",
} as const;
