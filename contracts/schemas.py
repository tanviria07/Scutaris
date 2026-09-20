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
