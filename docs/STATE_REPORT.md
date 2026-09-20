# Scutaris state report

Diagnostic run: 2026-09-19 (local), project root `C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\`.

No code files were modified. This file is the only write from the diagnostic pass.

**v4 plan note:** `docs/HACKMIT_PLAN_v4_team_split.md` does **not** exist in this workspace (confirmed by path check). Part status below is therefore scored against (a) git commit names Part 1 / Part 2, (b) in-code Part 3/4/5 comments, (c) `docs/HACKMIT_PLAN_v3.md` six-phase layout, and (d) the ownership lists in the diagnostic brief. Missing-file lists that would have come from v4 itself cannot be verified from that file.

---

## 1. Git State

- **Remote URL:** `https://github.com/tanviria07/Scutaris.git` (`origin` fetch + push)
- **Current branch:** `main` (tracks `origin/main`, **ahead 1**)
- **Last 5 commits** (only 2 exist on `main`):
  1. `dd9b85f` Part 2: contracts v1 + FastAPI surface (`/health` `/search` `/esql` `/visualize` `/agent/stream`)
  2. `7879f42` Part 1: Elasticsearch setup + CelesTrak ingestion pipeline
- **Uncommitted changes (before this report):** none (`git status --short` empty). After this write, `docs/STATE_REPORT.md` is a new untracked file.
- **Conflicts resolved during this run:** none. `git pull origin main --no-rebase` → `Already up to date.`
- **Push:** not performed (Phase 1 instruction: do not push during conflict handling; Phase 5 of this pass is report-only).
- **Other remotes/branches:**
  - `origin/ashraf-part1` at `0e46735` (“Add cinematic frontend and Elastic Serverless support”) — **not merged into `main`**. Contains a full `frontend/` tree that is absent from the checked-out working tree.
  - Fetch also created the local remote-tracking ref `origin/ashraf-part1` (new on this fetch).

---

## 2. Folder Tree

Entry points marked with `★`. Excludes `.venv/`, `node_modules/`, `data/`, `.git/`, and `__pycache__/`.

```text
backend/                          # FastAPI package
  __init__.py
  config.py
  embeddings.py
  es_client.py
  ingest.py
  main.py                         ★ uvicorn backend.main:app
  agents/                         (empty directory — no pipeline modules)
  routers/
    __init__.py
    agents.py                     ★ GET /agent/stream
    es_guard.py
    esql.py                       ★ POST /esql
    mock_data.py
    nlu.py
    search.py                     ★ POST /search
    visualize.py                  ★ POST /visualize
  static/mocks/
    object_card.png
    risk_card.png
    scenario_card.png
contracts/
  __init__.py
  CHANGELOG.md
  schemas.py                      ★ Pydantic source of truth
  types.ts                        ★ TS mirror
frontend/                         MISSING on this checkout
scripts/
  _bootstrap.py
  ingest_tles.py                  ★ CelesTrak ingest CLI
  setup_elastic.py                ★ index create / --dry-run
  smoke_test.py                   ★ python scripts/smoke_test.py [--live]
docs/
  HACKMIT_PLAN_v3.md
  STATE_REPORT.md                 (this file)
```

Root (not in the five folders above, but present): `README.md`, `requirements.txt`, `.env.example`, `.gitignore`, `docker-compose.yml`, duplicate `HACKMIT_PLAN_v3.md`.

---

## 3. File Inventory

Line counts are newline counts from UTF-8 text (`splitlines()`). PNGs are binary.

| Path | Lines | Purpose | Owner |
|------|------:|---------|-------|
| `backend/__init__.py` | 3 | Backend package marker; exports config/embeddings/es_client/ingest. | Ashraf |
| `backend/config.py` | 156 | `.env` settings, index name constants, embed-dim defaults. | Ashraf |
| `backend/embeddings.py` | 276 | Jina v3 embeddings with MiniLM fallback and sha256 cache. | Ashraf |
| `backend/es_client.py` | 378 | ES client, hybrid BM25+kNN RRF search, allowlisted ES\|QL. | Ashraf |
| `backend/ingest.py` | 451 | CelesTrak GP+TLE fetch, normalize, embed, bulk index. | Ashraf |
| `backend/main.py` | 81 | FastAPI app: CORS, static, router mount, `GET /health`. | Tanvir |
| `backend/routers/__init__.py` | 5 | Re-exports search/esql/visualize/agents routers. | Tanvir |
| `backend/routers/agents.py` | 216 | Scripted SSE stub for SCOUT→OPS_BRIEF (`GET /agent/stream`). | Tanvir |
| `backend/routers/es_guard.py` | 106 | Cached ES ping + abandon-on-timeout helper for routers. | Tanvir |
| `backend/routers/esql.py` | 89 | `POST /esql` allowlist + live/mock execution. | Tanvir |
| `backend/routers/mock_data.py` | 166 | Golden-query fixtures used when ES is down. | Tanvir |
| `backend/routers/nlu.py` | 60 | Rule-based query expansion (ISS aliases, intent). | Tanvir |
| `backend/routers/search.py` | 72 | `POST /search` hybrid search with mock fallback. | Tanvir |
| `backend/routers/visualize.py` | 76 | `POST /visualize` FIX 4 prompts + static image stub. | Tanvir |
| `backend/static/mocks/object_card.png` | binary (47721 B) | Placeholder object-card image. | Tanvir |
| `backend/static/mocks/risk_card.png` | binary (45344 B) | Placeholder risk-card image. | Tanvir |
| `backend/static/mocks/scenario_card.png` | binary (47122 B) | Placeholder scenario-card image. | Tanvir |
| `contracts/__init__.py` | 5 | Contracts package; exports `CONTRACTS_VERSION`. | Tanvir |
| `contracts/CHANGELOG.md` | 42 | v1 contract notes for frontend consumers. | Tanvir |
| `contracts/schemas.py` | 237 | Pydantic v2 request/response models + FIX 6 helper. | Tanvir |
| `contracts/types.ts` | 178 | Field-for-field TypeScript mirror of schemas.py. | Tanvir |
| `scripts/_bootstrap.py` | 11 | Puts project root on `sys.path` for CLI scripts. | Ashraf |
| `scripts/ingest_tles.py` | 162 | CLI: ingest stations + cosmos-2251-debris groups. | Ashraf |
| `scripts/setup_elastic.py` | 188 | Create/recreate/dry-run the four `scutaris-*` indices. | Ashraf |
| `scripts/smoke_test.py` | 217 | Offline + `--live` checks for math, ingest, ES, embeddings. | Ashraf |
| `docs/HACKMIT_PLAN_v3.md` | 237 | Locked v3 battle plan (stack, indices, API, hour plan). | Tanvir |
| `docs/STATE_REPORT.md` | (this file) | Diagnostic snapshot. | Tanvir |

`frontend/` did not exist in the working tree, so it contributed no inventory rows.

---

## 4. Part Status (v4 Plan)

`docs/HACKMIT_PLAN_v4_team_split.md` is **missing**. Status uses git Parts 1–2, README / router comments for Parts 3–5, and v3 phases 4–6.

### Part 1 — Elasticsearch + CelesTrak ingest (Ashraf)

- **Status:** complete in code; **blocked at runtime** (no `.env`, no ES target)
- **Files that exist:** `backend/config.py`, `backend/embeddings.py`, `backend/es_client.py`, `backend/ingest.py`, `scripts/setup_elastic.py`, `scripts/ingest_tles.py`, `scripts/smoke_test.py`, `scripts/_bootstrap.py`, `.env.example`, `requirements.txt`, `docker-compose.yml`, `README.md`
- **Files missing vs Part 1 prompt / v3:** none of the Part 1 code deliverables; runtime `.env` is missing; indices have not been created (cluster unreachable)
- **Stubs / TODOs:** none in Part 1 modules. Positions use a circular-orbit approximation (documented MVP shortcut, not a stub).

### Part 2 — Contracts v1 + FastAPI surface (Tanvir)

- **Status:** complete (endpoints exist; visualize + agent stream are **intentionally stubbed**)
- **Files that exist:** `backend/main.py`, `backend/routers/*`, `contracts/schemas.py`, `contracts/types.ts`, `contracts/CHANGELOG.md`, `backend/static/mocks/*.png`
- **Files missing:** none for the Part 2 commit surface
- **Stubs / mocks / TODOs:**
  - `visualize.py`: `STUB_NOTE = "Grok Imagine not wired yet (Part 4)"`; `mock=True`; static PNG
  - `agents.py`: `STUB_NOTE = "LangGraph pipeline not wired yet (Part 5)"`; scripted SSE
  - `search.py` / `esql.py`: automatic fixture fallback when ES is down (`mock=True`)
  - `nlu.py`: rule-based, not an LLM

### Part 3 — Conjunctions + constraints seed (README) / frontend start (v3 hours 3:00–4:30, Ashraf)

- **Status:** not started **on `main`**
- **Files that exist:** none of `scripts/build_conjunctions.py`; `scutaris-conjunctions` / `scutaris-constraints` mappings exist in `setup_elastic.py` but are never populated
- **Files missing:** `scripts/build_conjunctions.py`, constraint seed data, `frontend/` on this branch
- **Note:** `origin/ashraf-part1` contains a cinematic Next.js 15 + R3F globe (not in this checkout). That is **not** on `main`.
- **Stubs:** n/a (work not present)

### Part 4 — Grok Imagine (Tanvir; `visualize.py` comment)

- **Status:** not started (prompt templates exist; renderer is a stub)
- **Files that exist:** `backend/routers/visualize.py` (templates + stub `_render`)
- **Files missing:** `backend/grok_imagine.py` (listed as Tanvir-owned in the diagnostic brief; `Test-Path` = False)
- **Stubs:** `_render` returns `/static/mocks/{card_type}.png`

### Part 5 — LangGraph sequential agents (Ashraf `backend/agents/**`; Tanvir SSE stub)

- **Status:** not started (wire format stub only)
- **Files that exist:** `backend/routers/agents.py` (scripted SSE); empty `backend/agents/` directory
- **Files missing:** LangGraph graph, the five tools (`search_satellites`, `find_conjunctions`, `search_debris`, `query_constraints`, `assess_risk`), any module under `backend/agents/`
- **Stubs:** entire SSE pipeline; `mock: true` on `pipeline_done`

### Part 6 — Deploy & proof (v3 phase 6)

- **Status:** not started
- **Files that exist:** `docker-compose.yml` (local ES only)
- **Files missing:** `docs/GROK_USAGE.md`, Vercel/Railway config, production CORS/SSE proof
- **Stubs:** n/a

---

## 5. Endpoints (Part 2)

| Method | Path | Request Model | Response Model | Live / Stub |
|--------|------|---------------|----------------|-------------|
| `GET` | `/health` | none | `HealthResponse` | **Live** (always HTTP 200; `elasticsearch: "down"` when unconfigured) |
| `POST` | `/search` | `SearchRequest` | `SearchResponse` | **Live with mock fallback** (`hybrid_search` if ES up; else fixtures, `mock=true`) |
| `POST` | `/esql` | `EsqlRequest` | `EsqlResponse` | **Live with mock fallback** (allowlist is always live / 400; execution mocks if ES down) |
| `POST` | `/visualize` | `VisualizeRequest` | `VisualizeResponse` | **Stub** (`mock=true`, static PNG, FIX 4 prompts are real) |
| `GET` | `/agent/stream` | query: `q`, `asset_norad?`, `delay?` | SSE `text/event-stream` (not a Pydantic response model) | **Stub** (scripted SCOUT→OPS_BRIEF; `pipeline_done.mock=true`) |

Static: `GET /static/mocks/{object_card,risk_card,scenario_card}.png` via `StaticFiles`.

No other `@router` / `@app` routes found.

---

## 6. Contracts

### `contracts/schemas.py`

```python
"""Shared request/response contracts for the Scutaris API.

This module is the single source of truth for every JSON shape that crosses the
FastAPI <-> Next.js boundary. `contracts/types.ts` mirrors it field for field:
change both together and record the change in `contracts/CHANGELOG.md`.

Nothing here may import from `backend/` — the frontend mirror has to stay
mechanically derivable from this file alone.
"""

from __future__ import annotations

from typing import Any, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field

CONTRACTS_VERSION = "v1"

# --- Vocabularies (locked by HACKMIT_PLAN_v3 FIX 2 / FIX 4 / FIX 6) ---

RiskLevel = Literal["critical", "high", "medium", "low"]
CardType = Literal["risk_card", "object_card", "scenario_card"]
QueryIntent = Literal[
    "debris_near_asset",
    "conjunction_lookup",
    "object_lookup",
    "general_search",
]
ScutarisIndex = Literal[
    "scutaris-satellites",
    "scutaris-debris",
    "scutaris-conjunctions",
    "scutaris-constraints",
]

#: Mirrors `backend.config.ALL_INDICES`. Kept literal so the TS mirror can use it.
ALL_INDICES: tuple[ScutarisIndex, ...] = (
    "scutaris-satellites",
    "scutaris-debris",
    "scutaris-conjunctions",
    "scutaris-constraints",
)

#: Indices `/search` queries when the caller does not narrow them down.
DEFAULT_SEARCH_INDICES: tuple[ScutarisIndex, ...] = (
    "scutaris-satellites",
    "scutaris-debris",
    "scutaris-conjunctions",
)

#: Only `scutaris-conjunctions` documents carry a `risk_level` field.
RISK_BEARING_INDICES: tuple[ScutarisIndex, ...] = ("scutaris-conjunctions",)

# --- Agent pipeline (FIX 1 / FIX 7) ---

AgentName = Literal["SCOUT", "ANALYST", "PLANNER", "SAFETY", "OPS_BRIEF"]
AGENT_SEQUENCE: tuple[AgentName, ...] = (
    "SCOUT",
    "ANALYST",
    "PLANNER",
    "SAFETY",
    "OPS_BRIEF",
)

SseEventName = Literal[
    "agent_start",
    "tool_start",
    "tool_end",
    "agent_done",
    "pipeline_done",
    "pipeline_error",
]

# --- Risk thresholds (FIX 6) ---

RISK_CRITICAL_MISS_KM = 0.5
RISK_HIGH_MISS_KM = 10.0
RISK_MEDIUM_MISS_KM = 40.0
RISK_CRITICAL_PC = 1e-4


def classify_risk(miss_km: float, pc: float | None = None) -> RiskLevel:
    """Deterministic FIX 6 risk classification for a conjunction.

    A collision probability above `RISK_CRITICAL_PC` escalates to `critical`
    regardless of miss distance.
    """
    if pc is not None and pc > RISK_CRITICAL_PC:
        return "critical"
    if miss_km < RISK_CRITICAL_MISS_KM:
        return "critical"
    if miss_km < RISK_HIGH_MISS_KM:
        return "high"
    if miss_km < RISK_MEDIUM_MISS_KM:
        return "medium"
    return "low"


# --- /health ---


class HealthResponse(BaseModel):
    """Liveness plus a cheap Elasticsearch reachability probe."""

    status: Literal["ok", "degraded"]
    elasticsearch: Literal["up", "down"]
    api_version: str
    contracts_version: str = CONTRACTS_VERSION
    detail: str | None = None


# --- POST /search ---


class SearchFilters(BaseModel):
    """Optional narrowing applied to a hybrid search.

    `indices` routes the request; every other field becomes an Elasticsearch
    filter clause.
    """

    orbit_class: list[str] | None = None
    risk_level: list[RiskLevel] | None = None
    indices: list[ScutarisIndex] | None = None

    def to_es_filters(self) -> dict[str, Any]:
        """Field filters only — routing keys are dropped."""
        return self.model_dump(exclude_none=True, exclude={"indices"})

    def target_indices(self) -> tuple[ScutarisIndex, ...]:
        """Indices to query, falling back to the default trio."""
        return tuple(self.indices) if self.indices else DEFAULT_SEARCH_INDICES


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=512)
    filters: SearchFilters = Field(default_factory=SearchFilters)
    size: int = Field(default=20, ge=1, le=100)


class QueryExpanded(BaseModel):
    """What the API understood the natural-language query to be asking for."""

    asset_norad: str | None = None
    intent: QueryIntent = "general_search"


class SearchHit(BaseModel):
    """One scored document, flattened for the globe and the results list."""

    model_config = ConfigDict(populate_by_name=True)

    index: str
    id: str | None = None
    norad_id: str | None = None
    name: str | None = None
    score: float
    risk_level: RiskLevel | None = None
    orbit_class: str | None = None
    lat: float | None = None
    lon: float | None = None
    alt_km_now: float | None = None
    snippet: str = ""

    @classmethod
    def from_es(cls, hit: Mapping[str, Any]) -> "SearchHit":
        """Build a hit from an `es_client.hybrid_search` row, ignoring extra fields."""
        norad_id = hit.get("norad_id")
        doc_id = hit.get("id")
        return cls(
            index=str(hit.get("index") or ""),
            id=None if doc_id is None else str(doc_id),
            norad_id=None if norad_id is None else str(norad_id),
            name=hit.get("name"),
            score=float(hit.get("score") or 0.0),
            risk_level=hit.get("risk_level"),
            orbit_class=hit.get("orbit_class"),
            lat=hit.get("lat"),
            lon=hit.get("lon"),
            alt_km_now=hit.get("alt_km_now"),
            snippet=hit.get("snippet") or "",
        )


class SearchResponse(BaseModel):
    query_expanded: QueryExpanded
    hits: list[SearchHit]
    took_ms: int
    #: True when Elasticsearch was unreachable and `hits` are fixtures.
    mock: bool = False
    #: Human-readable reason, present whenever `mock` is true.
    note: str | None = None


# --- POST /esql ---


class EsqlColumn(BaseModel):
    name: str
    type: str


class EsqlRequest(BaseModel):
    """Allowlisted ES|QL. The query must start with `FROM scutaris-`."""

    query: str = Field(min_length=1, max_length=4096)


class EsqlResponse(BaseModel):
    #: The normalized query that was actually executed.
    query: str
    columns: list[EsqlColumn]
    values: list[list[Any]]
    #: `values` zipped against `columns` for callers that prefer objects.
    rows: list[dict[str, Any]]
    took_ms: int
    mock: bool = False
    note: str | None = None


# --- POST /visualize ---


class VisualizeRequest(BaseModel):
    type: CardType
    context: dict[str, Any] = Field(default_factory=dict)


class VisualizeResponse(BaseModel):
    type: CardType
    prompt_used: str
    image_url: str
    cached: bool
    took_ms: int
    #: True while the Grok Imagine call is stubbed out.
    mock: bool = False
    note: str | None = None
```

### `contracts/types.ts`

```ts
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
```

---

## 7. Environment

### Keys in `.env.example` (names only)

- `ELASTIC_CLOUD_ID`
- `ELASTIC_API_KEY`
- `ELASTIC_URL`
- `ELASTIC_USERNAME`
- `ELASTIC_PASSWORD`
- `ELASTIC_REQUEST_TIMEOUT`
- `JINA_API_KEY`
- `JINA_API_URL`
- `JINA_MODEL`
- `EMBED_DIMS`
- `EMBED_FALLBACK_MODEL`
- `EMBED_BATCH_SIZE`
- `CELESTRAK_BASE_URL`
- `CELESTRAK_SATELLITE_GROUP`
- `CELESTRAK_DEBRIS_GROUP`
- `HTTP_TIMEOUT`
- `INGEST_LIMIT`

### `.env` exists: **no**

### `requirements.txt` (full)

```
elasticsearch>=8.13
fastapi
uvicorn[standard]
httpx
python-dotenv
numpy
sentence-transformers  # fallback embeddings only (MiniLM 384-dim)
langchain-core
langgraph
langchain-openai
```

### `frontend/package.json`

Does not exist on this checkout (`frontend/` missing). A `package.json` **does** exist on `origin/ashraf-part1` at `frontend/package.json`; it was not read into this report because it is not in the working tree.

---

## 8. Elasticsearch

### Doc counts

**Unreachable.** No index counts. `.env` is absent, so `ELASTIC_CLOUD_ID` and `ELASTIC_URL` are unset.

System `python` first failed to import `elasticsearch`. Project `.venv` reached `get_es_client()` and raised:

```
Traceback (most recent call last):
  File "<stdin>", line 2, in <module>
  File "C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\es_client.py", line 65, in get_es_client
    raise RuntimeError(
        "No Elasticsearch target configured: set ELASTIC_CLOUD_ID (Elastic Cloud) "
        "or ELASTIC_URL (local/docker) in your .env"
    )
RuntimeError: No Elasticsearch target configured: set ELASTIC_CLOUD_ID (Elastic Cloud) or ELASTIC_URL (local/docker) in your .env
```

| Index | Count |
|-------|------:|
| `scutaris-satellites` | n/a (client never connected) |
| `scutaris-debris` | n/a |
| `scutaris-conjunctions` | n/a |
| `scutaris-constraints` | n/a |

### Functions that query ES (`es_client` / `hybrid_search`)

**Defined in `backend/es_client.py`:** `get_es_client`, `ping`, `cluster_banner`, `count_docs`, `bulk_index`, `bulk_index_async`, `_search_native_rrf`, `_search_manual_rrf`, `_hybrid_search_blocking`, `hybrid_search`, `esql_query`, `esql_query_async`.

**Callers:**

| File | Uses |
|------|------|
| `backend/routers/search.py` | `es_client.hybrid_search` |
| `backend/routers/esql.py` | `validate_esql`, `esql_query_async` |
| `backend/routers/es_guard.py` | `es_client.ping` |
| `backend/ingest.py` | `bulk_index_async` |
| `scripts/setup_elastic.py` | `get_es_client`, `cluster_banner`, `count_docs` |
| `scripts/ingest_tles.py` | `get_es_client`, `cluster_banner`, `count_docs` |
| `scripts/smoke_test.py` | `validate_esql`, `build_filter_clauses`, `cluster_banner`, `count_docs` |
| `contracts/schemas.py` | comment-only (`SearchHit.from_es` documents the hybrid_search row shape) |

### Mock toggles

No `USE_MOCK` env flag exists (grep for `USE_MOCK` returned no matches).

Mocks are **automatic degrade-to-fixture**, not a config switch:

- `SearchResponse.mock` / `EsqlResponse.mock` / `VisualizeResponse.mock`
- `backend/routers/mock_data.py` (`mock_search_hits`, `MOCK_ESQL_COLUMNS`, `mock_esql_values`)
- `visualize` always `mock=True` (stub renderer)
- `agents` `pipeline_done.mock=True`
- Image URLs under `/static/mocks/`

---

## 9. Frontend Status

- Does `frontend/` exist? **No** (this checkout / `main`)
- `package.json` present? **no**
- `next.config.ts` present? **no**
- Files in `frontend/components/` or `frontend/app/`? **none** (directories do not exist)
- Fixture files in `frontend/fixtures/`? **none**

**Off-branch observation (not in working tree):** `origin/ashraf-part1` has `frontend/next.config.ts`, `frontend/package.json`, App Router under `frontend/src/app/`, globe components under `frontend/src/components/globe/`, HUD under `frontend/src/components/hud/`, and fixtures under `frontend/src/lib/data/fixtures/` (`conjunctions.ts`, `constraints.ts`, `debris.ts`, `satellites.ts`). Those paths are **not** on `main`.

---

## 10. Gaps vs. v4 Plan

Because v4 is missing, this section contrasts **v3 locked layout + named Parts + ownership brief** with what is on `main`.

### Done that wasn’t in the original Part 1 plan (surprises)

- Full FastAPI surface with CORS, `/health`, mock-degrade search/ES\|QL (Part 2, unpushed to origin)
- Shared Pydantic/TS contracts v1 and changelog
- Static Imagine placeholder PNGs
- Empty `backend/agents/` directory (no modules)
- Duplicate `HACKMIT_PLAN_v3.md` at repo root and `docs/`
- `origin/ashraf-part1` cinematic frontend + “Elastic Serverless support” — exists remotely, not merged
- Local `main` is **1 commit ahead** of `origin/main` (Part 2 never pushed)
- Dry-run mappings use **`dims=384` (MiniLM)** because there is no Jina key and no `.env`; `.env.example` still documents `EMBED_DIMS=1024`

### Planned but missing (on `main`)

- `docs/HACKMIT_PLAN_v4_team_split.md`
- `.env` (so ES + Jina cannot run)
- Created/populated `scutaris-*` indices
- `scripts/build_conjunctions.py` + constraint seeding
- `backend/grok_imagine.py` and live Imagine calls
- LangGraph pipeline under `backend/agents/`
- `frontend/` (Next.js 15 + R3F globe + Tailwind v4)
- `docs/GROK_USAGE.md`
- Vercel + Railway deploy
- `frontend/fixtures/search_iss.json` (v3 H1 handoff name; not present)

### Blocked and why

1. **All live ES paths** — no `.env`, therefore no `ELASTIC_CLOUD_ID` / `ELASTIC_URL`. `get_es_client()` raises before any network call. Docker Compose file exists but was not started as part of this read-only diagnostic.
2. **Hybrid search / ingest / index create** — same configuration gap. Smoke `--live` failed only on Elasticsearch.
3. **Jina 1024-dim indices** — no `JINA_API_KEY`; smoke embedding passed via MiniLM at **384 dims**. Creating indices now would bake 384-dim mappings unless `.env` is set first.
4. **Frontend on `main`** — not present; merging `origin/ashraf-part1` is a team decision (conflicts likely with Part 2 contracts vs `frontend/src/lib/types/api.ts`).
5. **v4 scoring** — cannot audit §4/§5 of a file that does not exist.

---

## 11. Next 3 Actions

### Tanvir

1. **Push `main`** (`dd9b85f` Part 2 is local-only; `origin/main` is still Part 1) so Ashraf can consume contracts + OpenAPI.
2. **Land or share `docs/HACKMIT_PLAN_v4_team_split.md`** so Part 3–6 file lists stop being inferred.
3. **Implement `backend/grok_imagine.py`** and swap `visualize._render` (keep the response shape); needs Imagine credentials in `.env` (names only here — values not printed because `.env` does not exist yet).

### Ashraf

1. **Create `.env` from `.env.example`**, set Elastic Cloud **or** `ELASTIC_URL=http://localhost:9200` after `docker compose up -d`, then `python scripts/setup_elastic.py` + `python scripts/ingest_tles.py`. Decide `EMBED_DIMS=1024` (Jina) vs `384` (MiniLM) **before** creating indices.
2. **Bring `origin/ashraf-part1` frontend onto `main`** (or a merge branch) and point it at `contracts/types.ts` rather than a parallel type file.
3. **Write `scripts/build_conjunctions.py` + constraint seed**, then replace the SSE stub with a real LangGraph graph in `backend/agents/`.

### One risk to watch

**Embedding dimension split.** Dry-run already selected `dims=384`. If one teammate creates MiniLM indices and another later sets Jina 1024, hybrid kNN will be wrong or mapping-incompatible. Lock `EMBED_DIMS` + provider before the first `--recreate`.

A second close risk: **two histories** (`main`+Part 2 vs `ashraf-part1`+frontend) will collide if merged late.

---

## 12. Raw Evidence

### Phase 1 — `git status --short`

(empty — clean working tree)

### Phase 1 — `git log --oneline -10`

```
dd9b85f Part 2: contracts v1 + FastAPI surface (/health /search /esql /visualize /agent/stream)
7879f42 Part 1: Elasticsearch setup + CelesTrak ingestion pipeline
```

### Phase 1 — `git branch -a` (before fetch)

```
* main
  remotes/origin/main
```

### Phase 1 — `git remote -v`

```
origin	https://github.com/tanviria07/Scutaris.git (fetch)
origin	https://github.com/tanviria07/Scutaris.git (push)
```

### Phase 1 — `git fetch origin`

```
From https://github.com/tanviria07/Scutaris
 * [new branch]      ashraf-part1 -> origin/ashraf-part1
```

### Phase 1 — `git pull origin main --no-rebase`

```
From https://github.com/tanviria07/Scutaris
 * branch            main       -> FETCH_HEAD
Already up to date.
```

### Phase 1 — `git branch -vv` (after pull)

```
* main dd9b85f [origin/main: ahead 1] Part 2: contracts v1 + FastAPI surface (/health /search /esql /visualize /agent/stream)
```

### Phase 1 — `git branch -a` (after fetch)

```
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/ashraf-part1
  remotes/origin/main
```

### Phase 2 — ES counts, system `python` via stdin (PowerShell ate f-string braces on the original one-liner)

Original `python -c "…es.count(index=i)[\"count\"]…"` → PowerShell `SyntaxError: unterminated string literal`.

Re-run:

```
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
  File "C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\es_client.py", line 16, in <module>
    from elasticsearch import Elasticsearch
ModuleNotFoundError: No module named 'elasticsearch'
```

### Phase 2 — ES counts, `.venv\Scripts\python.exe`

```
===== .venv python =====
Python 3.13.3
===== .venv elasticsearch =====
(8, 19, 3)
===== ES COUNTS =====
Traceback (most recent call last):
  File "<stdin>", line 2, in <module>
  File "C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\es_client.py", line 65, in get_es_client
    raise RuntimeError(
    ...<2 lines>...
    )
RuntimeError: No Elasticsearch target configured: set ELASTIC_CLOUD_ID (Elastic Cloud) or ELASTIC_URL (local/docker) in your .env
```

(Python 3.13 truncated the `raise` display with `...<2 lines>...`. The raised message is complete above; source is `es_client.py` lines 65–68.)

### Phase 2 — `python scripts/smoke_test.py --live` (via `.venv`; exit 1)

Interpreter: `.\.venv\Scripts\python.exe` (system `python` cannot import `elasticsearch`, which `smoke_test` needs for the ES\|QL section).

```
===== SMOKE TEST =====
Loading local fallback embedding model sentence-transformers/all-MiniLM-L6-v2 (384-dim); first run downloads weights
Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
... huggingface_hub symlink UserWarning ...
Orbital math
  [PASS] ISS semi-major axis ~6796 km — 6794.6 km
  [PASS] GEO semi-major axis ~42164 km — 42165.2 km
  [PASS] LEO classification
  [PASS] GEO classification
  [PASS] MEO classification
  [PASS] HEO by eccentricity
  [PASS] GMST at J2000 ~280.46 deg — 280.461
Normalization
  [PASS] norad_id is a string — 25544
  [PASS] orbit_class LEO
  [PASS] altitude ~400-430 km — 416.424
  [PASS] |lat| <= inclination — 18.2137
  [PASS] lon in [-180,180) — -126.0395
  [PASS] alt_km_now plausible — 413.758
  [PASS] epoch is ISO UTC — 2026-09-19T05:32:41.123456+00:00
  [PASS] tle lines stored
  [PASS] no debris fields on satellite
  [PASS] text_blob mentions ISS
  [PASS] parent object derived — COSMOS 2251
  [PASS] group recorded
  [PASS] rcs_m2 nullable
  [PASS] debris blob has group
  [PASS] parent fallback from group
  [PASS] build_text_blob works standalone
ES|QL allowlist + filters
  [PASS] valid query accepted
  [PASS] multi-index source accepted
  [PASS] ES|QL DROP (column) still allowed
  [PASS] rejected 'FROM other-index | LIMIT 1'
  [PASS] rejected 'SHOW INFO'
  [PASS] rejected ''
  [PASS] rejected 'FROM scutaris-secret | LIMIT'
  [PASS] rejected 'FROM scutaris-satellites-pri'
  [PASS] rejected 'FROM scutaris-satellites | L'
  [PASS] terms + term + range built — ['terms', 'term', 'range']
  [PASS] reserved keys ignored
Live checks
  [PASS] CelesTrak stations group — 22 records
  [PASS] ISS present in stations
  [PASS] ISS TLE fetched
  [PASS] embedding via minilm — 384 dims
  [FAIL] elasticsearch reachable — RuntimeError: No Elasticsearch target configured: set ELASTIC_CLOUD_ID (Elastic Cloud) or ELASTIC_URL (local/docker) in your .env

1 check(s) failed: elasticsearch reachable
EXIT: 1
```

**Summary:** fail. Sole failing check, verbatim: `elasticsearch reachable`.

### Phase 2 — `python scripts/setup_elastic.py --dry-run` (via `.venv`)

Prints **`dims=384` (MiniLM)**, not `dims=1024` (Jina).

```
===== SETUP ELASTIC DRY-RUN =====
Scutaris index setup — dense_vector dims=384 (cosine)
Config: elastic=<unset> embed_provider=minilm-fallback embed_dims=384 celestrak=https://celestrak.org/NORAD/elements/gp.php
{
  "scutaris-satellites": {
    "properties": {
      "norad_id": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } } },
      "orbit_class": { "type": "keyword" },
      "altitude_km": { "type": "float" },
      "inclination_deg": { "type": "float" },
      "tle_line1": { "type": "keyword", "index": false },
      "tle_line2": { "type": "keyword", "index": false },
      "epoch_utc": { "type": "date" },
      "lat": { "type": "float" },
      "lon": { "type": "float" },
      "alt_km_now": { "type": "float" },
      "text_blob": { "type": "text" },
      "embedding": { "type": "dense_vector", "dims": 384, "index": true, "similarity": "cosine" }
    }
  },
  "scutaris-debris": {
    "properties": {
      "norad_id": { "type": "keyword" },
      "name": { "type": "text", "fields": { "keyword": { "type": "keyword", "ignore_above": 256 } } },
      "orbit_class": { "type": "keyword" },
      "altitude_km": { "type": "float" },
      "inclination_deg": { "type": "float" },
      "tle_line1": { "type": "keyword", "index": false },
      "tle_line2": { "type": "keyword", "index": false },
      "epoch_utc": { "type": "date" },
      "lat": { "type": "float" },
      "lon": { "type": "float" },
      "alt_km_now": { "type": "float" },
      "text_blob": { "type": "text" },
      "parent_object": { "type": "keyword" },
      "rcs_m2": { "type": "float", "null_value": null },
      "group": { "type": "keyword" },
      "embedding": { "type": "dense_vector", "dims": 384, "index": true, "similarity": "cosine" }
    }
  },
  "scutaris-conjunctions": {
    "properties": {
      "primary_norad": { "type": "keyword" },
      "secondary_norad": { "type": "keyword" },
      "tca_utc": { "type": "date" },
      "miss_km": { "type": "float" },
      "pc": { "type": "float" },
      "risk_level": { "type": "keyword" },
      "text_blob": { "type": "text" },
      "embedding": { "type": "dense_vector", "dims": 384, "index": true, "similarity": "cosine" }
    }
  },
  "scutaris-constraints": {
    "properties": {
      "norad_id": { "type": "keyword" },
      "fuel_kg": { "type": "float" },
      "max_dv_ms": { "type": "float" },
      "min_perigee_km": { "type": "float" },
      "blackout_windows": {
        "type": "nested",
        "properties": {
          "start_utc": { "type": "date" },
          "end_utc": { "type": "date" },
          "reason": { "type": "keyword" }
        }
      },
      "notes": { "type": "text" }
    }
  }
}
```

### Phase 3 — Python environment

```
===== python --version =====
Python 3.13.3
===== venv python --version =====
Python 3.13.3
===== fastapi system =====
fastapi 0.115.6
===== fastapi venv =====
fastapi 0.141.1
===== es system =====
ModuleNotFoundError: No module named 'elasticsearch'
===== es venv =====
es (8, 19, 3)
===== jina system =====
ModuleNotFoundError: No module named 'jina'
===== jina venv =====
ModuleNotFoundError: No module named 'jina'
===== langgraph system =====
ModuleNotFoundError: No module named 'langgraph'
===== langgraph venv =====
langgraph ok
```

(`import jina` failure is expected: embeddings use the Jina HTTP API via `httpx`, not the `jina` package.)

### Phase 4 — `Get-ChildItem` inventory

```
FullName                                                                           Length
--------                                                                           ------
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\agents.py                7922
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\esql.py                  2740
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\es_guard.py              3442
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\mock_data.py             5416
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\nlu.py                   2051
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\search.py                2342
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\visualize.py             2761
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\routers\__init__.py               190
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\static\mocks\object_card.png    47721
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\static\mocks\risk_card.png      45344
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\static\mocks\scenario_card.png  47122
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\config.py                        5289
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\embeddings.py                   10207
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\es_client.py                    13293
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\ingest.py                       16564
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\main.py                          2413
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\backend\__init__.py                       106
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\contracts\CHANGELOG.md                   1833
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\contracts\schemas.py                     6595
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\contracts\types.ts                       4422
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\contracts\__init__.py                     163
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\scripts\ingest_tles.py                   5467
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\scripts\setup_elastic.py                 6148
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\scripts\smoke_test.py                    8420
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\scripts\_bootstrap.py                     294
C:\Users\tanvi\Desktop\HackMIT2026\Scutaris\docs\HACKMIT_PLAN_v3.md                  9891
```

### Existence checks

```
.env: False
.env.example: True
frontend: False
frontend/package.json: False
frontend/next.config.ts: False
frontend/components: False
frontend/app: False
frontend/fixtures: False
backend/grok_imagine.py: False
backend/agents: True   (empty directory)
scripts/build_conjunctions.py: False
docs/GROK_USAGE.md: False
docs/HACKMIT_PLAN_v4_team_split.md: False
docker-compose.yml: True
```

### `origin/main..HEAD`

```
dd9b85f Part 2: contracts v1 + FastAPI surface (/health /search /esql /visualize /agent/stream)
```

### `git log --oneline origin/ashraf-part1 -10`

```
0e46735 Add cinematic frontend and Elastic Serverless support
7879f42 Part 1: Elasticsearch setup + CelesTrak ingestion pipeline
```
