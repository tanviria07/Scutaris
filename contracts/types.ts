/**
 * Shared request/response contracts for the Scutaris API.
 *
 * Mirror of `contracts/schemas.py`, field for field. Change both together and
 * record the change in `contracts/CHANGELOG.md`.
 */

export const CONTRACTS_VERSION = "v1";

// --- Vocabularies (locked by HACKMIT_PLAN_v3 FIX 2 / FIX 4 / FIX 6) ---

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type CardType = "risk_card" | "object_card" | "scenario_card";
export type QueryIntent =
  | "debris_near_asset"
  | "conjunction_lookup"
  | "object_lookup"
  | "general_search";
export type ScutarisIndex =
  | "scutaris-satellites"
  | "scutaris-debris"
  | "scutaris-conjunctions"
  | "scutaris-constraints";

/** Mirrors `backend.config.ALL_INDICES`. */
export const ALL_INDICES: readonly ScutarisIndex[] = [
  "scutaris-satellites",
  "scutaris-debris",
  "scutaris-conjunctions",
  "scutaris-constraints",
];

/** Indices `/search` queries when the caller does not narrow them down. */
export const DEFAULT_SEARCH_INDICES: readonly ScutarisIndex[] = [
  "scutaris-satellites",
  "scutaris-debris",
  "scutaris-conjunctions",
];

/** Only `scutaris-conjunctions` documents carry a `risk_level` field. */
export const RISK_BEARING_INDICES: readonly ScutarisIndex[] = ["scutaris-conjunctions"];

// --- Agent pipeline (FIX 1 / FIX 7) ---

export type AgentName = "SCOUT" | "ANALYST" | "PLANNER" | "SAFETY" | "OPS_BRIEF";

export const AGENT_SEQUENCE: readonly AgentName[] = [
  "SCOUT",
  "ANALYST",
  "PLANNER",
  "SAFETY",
  "OPS_BRIEF",
];

export type SseEventName =
  | "agent_start"
  | "tool_start"
  | "tool_end"
  | "agent_done"
  | "pipeline_done"
  | "pipeline_error";

// --- Risk thresholds (FIX 6) ---

export const RISK_CRITICAL_MISS_KM = 0.5;
export const RISK_HIGH_MISS_KM = 10.0;
export const RISK_MEDIUM_MISS_KM = 40.0;
export const RISK_CRITICAL_PC = 1e-4;

/**
 * Deterministic FIX 6 risk classification for a conjunction.
 *
 * A collision probability above `RISK_CRITICAL_PC` escalates to `critical`
 * regardless of miss distance.
 */
export function classifyRisk(missKm: number, pc?: number | null): RiskLevel {
  if (pc != null && pc > RISK_CRITICAL_PC) return "critical";
  if (missKm < RISK_CRITICAL_MISS_KM) return "critical";
  if (missKm < RISK_HIGH_MISS_KM) return "high";
  if (missKm < RISK_MEDIUM_MISS_KM) return "medium";
  return "low";
}

// --- /health ---

export interface HealthResponse {
  status: "ok" | "degraded";
  elasticsearch: "up" | "down";
  api_version: string;
  contracts_version: string;
  detail: string | null;
}

// --- POST /search ---

export interface SearchFilters {
  orbit_class?: string[] | null;
  risk_level?: RiskLevel[] | null;
  indices?: ScutarisIndex[] | null;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  /** 1–100, defaults to 20. */
  size?: number;
}

export interface QueryExpanded {
  asset_norad: string | null;
  intent: QueryIntent;
}

export interface SearchHit {
  index: string;
  id: string | null;
  norad_id: string | null;
  name: string | null;
  score: number;
  risk_level: RiskLevel | null;
  orbit_class: string | null;
  lat: number | null;
  lon: number | null;
  alt_km_now: number | null;
  snippet: string;
}

export interface SearchResponse {
  query_expanded: QueryExpanded;
  hits: SearchHit[];
  took_ms: number;
  /** True when Elasticsearch was unreachable and `hits` are fixtures. */
  mock: boolean;
  /** Human-readable reason, present whenever `mock` is true. */
  note: string | null;
}

// --- POST /esql ---

export interface EsqlColumn {
  name: string;
  type: string;
}

/** Allowlisted ES|QL. The query must start with `FROM scutaris-`. */
export interface EsqlRequest {
  query: string;
}

export interface EsqlResponse {
  /** The normalized query that was actually executed. */
  query: string;
  columns: EsqlColumn[];
  values: unknown[][];
  /** `values` zipped against `columns` for callers that prefer objects. */
  rows: Record<string, unknown>[];
  took_ms: number;
  mock: boolean;
  note: string | null;
}

// --- POST /visualize ---

export interface VisualizeRequest {
  type: CardType;
  context?: Record<string, unknown>;
}

export interface VisualizeResponse {
  type: CardType;
  prompt_used: string;
  image_url: string;
  cached: boolean;
  took_ms: number;
  /** True while the Grok Imagine call is stubbed out. */
  mock: boolean;
  note: string | null;
}
