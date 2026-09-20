"""The five locked agent tools (FIX 7), each wrapping `backend.es_client`.

Nothing here reimplements search: `search_satellites` and `search_debris` go
through `hybrid_search`, the conjunction lookups go through the allowlisted
ES|QL path, and `assess_risk` reuses `contracts.schemas.classify_risk` so the
agents and the conjunction builder cannot drift apart.

Every tool is async (the Elasticsearch helpers are) and every tool swallows its
exceptions, returning `{"error": "..."}` so one dead index cannot kill a run.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.tools import tool

from backend import es_client
from backend.config import (
    INDEX_CONSTRAINTS,
    INDEX_DEBRIS,
    INDEX_SATELLITES,
)
from contracts.schemas import (
    RISK_CRITICAL_MISS_KM,
    RISK_CRITICAL_PC,
    RISK_HIGH_MISS_KM,
    RISK_MEDIUM_MISS_KM,
    classify_risk,
)

logger = logging.getLogger(__name__)

#: Upper bound on rows any single tool hands back to the LLM.
MAX_ROWS = 20
#: Fields worth showing an agent; the raw vector and TLE lines are noise here.
_DROP_FIELDS = ("embedding", "tle_line1", "tle_line2")


def _slim(row: dict[str, Any]) -> dict[str, Any]:
    """Strip vectors and TLE lines so tool output stays inside the token budget."""
    return {key: value for key, value in row.items() if key not in _DROP_FIELDS}


def _error(exc: Exception, context: str) -> dict[str, str]:
    """Log an upstream failure and describe it for the LLM."""
    logger.warning("%s failed (%s: %s)", context, type(exc).__name__, exc)
    return {"error": f"{context} failed: {type(exc).__name__}: {exc}"}


async def _esql_rows(query: str) -> list[dict[str, Any]]:
    """Run an allowlisted ES|QL query and return slimmed rows."""
    result = await es_client.esql_query_async(query)
    return [_slim(row) for row in result.get("rows", [])]


@tool
async def search_satellites(
    query: str, filters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Search active satellites via hybrid search.

    Args:
        query: Natural-language text, a satellite name, or a NORAD id.
        filters: Optional field filters, e.g. `{"orbit_class": ["LEO"]}`.

    Returns:
        Up to 20 satellite documents, or a single-item list holding `error`.
    """
    try:
        hits = await es_client.hybrid_search(
            INDEX_SATELLITES, query, filters or {}, MAX_ROWS
        )
        return [_slim(hit) for hit in hits]
    except Exception as exc:  # noqa: BLE001 - a dead index must not kill the agent
        return [_error(exc, "search_satellites")]


@tool
async def find_conjunctions(
    norad_id: str, horizon_hours: int = 24
) -> list[dict[str, Any]]:
    """Find conjunctions for a satellite using ES|QL.

    Args:
        norad_id: Primary asset NORAD id, e.g. `"25544"`.
        horizon_hours: Screening horizon in hours. Recorded on the result rows;
            the seeded snapshot shares one TCA, so it does not filter them.

    Returns:
        Up to 20 conjunction rows sorted by miss distance, closest first.
    """
    try:
        # MVP HEURISTIC: the seeded conjunction snapshot carries a single TCA per
        # build, so `horizon_hours` is echoed for the operator rather than used
        # as a time filter. Real SGP4 TCA propagation is the roadmap.
        rows = await _esql_rows(
            f'FROM scutaris-conjunctions | WHERE primary_norad == "{norad_id}" '
            f"| SORT miss_km ASC | LIMIT {MAX_ROWS}"
        )
        for row in rows:
            row["horizon_hours"] = horizon_hours
        return rows
    except Exception as exc:  # noqa: BLE001
        return [_error(exc, "find_conjunctions")]


@tool
async def search_debris(
    orbit_class: str = "LEO", limit: int = 20
) -> list[dict[str, Any]]:
    """Search debris objects by orbit class.

    Args:
        orbit_class: Orbit band to filter on, e.g. `"LEO"`.
        limit: Maximum rows to return (capped at 20).

    Returns:
        Debris documents, or a single-item list holding `error`.
    """
    try:
        size = max(1, min(limit, MAX_ROWS))
        hits = await es_client.hybrid_search(
            INDEX_DEBRIS,
            f"{orbit_class} debris fragment",
            {"orbit_class": orbit_class},
            size,
        )
        return [_slim(hit) for hit in hits]
    except Exception as exc:  # noqa: BLE001
        return [_error(exc, "search_debris")]


@tool
async def query_constraints(norad_id: str) -> dict[str, Any]:
    """Read operational constraints for a satellite.

    Args:
        norad_id: Asset NORAD id, e.g. `"25544"`.

    Returns:
        The `scutaris-constraints` document (fuel_kg, max_dv_ms,
        min_perigee_km, blackout_windows, notes), or `{"error": ...}`.
    """
    try:
        document = await asyncio.to_thread(
            es_client.get_es_client().get, index=INDEX_CONSTRAINTS, id=norad_id
        )
        source = dict(document.get("_source") or {})
        return {"norad_id": norad_id, **_slim(source)}
    except Exception as exc:  # noqa: BLE001 - a missing doc is a normal answer
        return _error(exc, f"query_constraints({norad_id})")


@tool
async def assess_risk(primary_norad: str, secondary_norad: str) -> dict[str, Any]:
    """Assess conjunction risk using FIX 6 thresholds.

    Args:
        primary_norad: Primary asset NORAD id.
        secondary_norad: Secondary object NORAD id.

    Returns:
        The pair's exact geometry plus the deterministic `risk_level`, or
        `{"error": ...}` when the pair is not in the index.
    """
    try:
        rows = await _esql_rows(
            f'FROM scutaris-conjunctions | WHERE primary_norad == "{primary_norad}" '
            f'AND secondary_norad == "{secondary_norad}" | SORT miss_km ASC | LIMIT 1'
        )
        if not rows:
            return {
                "error": (
                    f"No conjunction indexed for {primary_norad} vs {secondary_norad}."
                )
            }
        row = rows[0]
        miss_km = float(row.get("miss_km") or 0.0)
        pc = row.get("pc")
        return {
            "primary_norad": primary_norad,
            "secondary_norad": secondary_norad,
            "tca_utc": row.get("tca_utc"),
            "miss_km": miss_km,
            "pc": pc,
            "risk_level": classify_risk(miss_km, None if pc is None else float(pc)),
            "stored_risk_level": row.get("risk_level"),
            "thresholds": {
                "critical_miss_km": RISK_CRITICAL_MISS_KM,
                "high_miss_km": RISK_HIGH_MISS_KM,
                "medium_miss_km": RISK_MEDIUM_MISS_KM,
                "critical_pc": RISK_CRITICAL_PC,
            },
        }
    except Exception as exc:  # noqa: BLE001
        return _error(exc, "assess_risk")


SCOUT_TOOLS = [search_satellites, find_conjunctions]
ANALYST_TOOLS = [find_conjunctions, search_debris, assess_risk]
PLANNER_TOOLS = [query_constraints]
SAFETY_TOOLS = [query_constraints]
OPS_BRIEF_TOOLS = [assess_risk]

ALL_TOOLS = [
    search_satellites,
    find_conjunctions,
    search_debris,
    query_constraints,
    assess_risk,
]

__all__ = [
    "search_satellites",
    "find_conjunctions",
    "search_debris",
    "query_constraints",
    "assess_risk",
    "SCOUT_TOOLS",
    "ANALYST_TOOLS",
    "PLANNER_TOOLS",
    "SAFETY_TOOLS",
    "OPS_BRIEF_TOOLS",
    "ALL_TOOLS",
]
