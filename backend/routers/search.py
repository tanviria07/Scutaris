"""`POST /search` — natural language to hybrid (BM25 + kNN, RRF) search."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter

from backend import es_client
from backend.routers.es_guard import es_available, wait_or_abandon
from backend.routers.mock_data import ES_DOWN_NOTE, mock_search_hits
from backend.routers.nlu import expand_query
from contracts.schemas import QueryExpanded, SearchHit, SearchRequest, SearchResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])

#: Hard cap so a stalled cluster degrades to fixtures instead of hanging the UI.
SEARCH_TIMEOUT_S = 8.0

# MVP HEURISTIC: intent-based index boost so the golden query returns
# conjunctions first, not generic satellites. Real semantic re-ranking
# is on the roadmap.
_CONJUNCTION_SCORE_BOOST = 3.0
_CONJUNCTION_INDEX = "scutaris-conjunctions"
_FILLER_INDICES = ("scutaris-satellites", "scutaris-debris")
_RISK_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    """Run a hybrid search, falling back to labeled fixtures if Elastic is down."""
    started = time.perf_counter()
    query_expanded = expand_query(request.query)

    if not await es_available():
        return _mock_response(request, query_expanded, started, "cluster unreachable")

    try:
        raw_hits = await wait_or_abandon(
            _live_hits(request, query_expanded),
            SEARCH_TIMEOUT_S,
        )
    except Exception as exc:  # noqa: BLE001 - any upstream failure degrades to mock
        logger.warning(
            "hybrid_search failed (%s: %s); returning mock results",
            type(exc).__name__,
            exc,
        )
        return _mock_response(request, query_expanded, started, type(exc).__name__)

    return SearchResponse(
        query_expanded=query_expanded,
        hits=[SearchHit.from_es(hit) for hit in raw_hits],
        took_ms=_elapsed_ms(started),
        mock=False,
    )


def _is_asset_conjunction_intent(query_expanded: QueryExpanded) -> bool:
    return query_expanded.intent == "debris_near_asset" and bool(
        query_expanded.asset_norad
    )


def _normalize_conjunction_hit(hit: dict[str, Any]) -> dict[str, Any]:
    """Surface `primary_norad` as `norad_id` so conjunctions match SearchHit."""
    if not hit.get("norad_id") and hit.get("primary_norad"):
        hit["norad_id"] = str(hit["primary_norad"])
    if not hit.get("name") and hit.get("primary_norad") and hit.get("secondary_norad"):
        hit["name"] = f"{hit['primary_norad']} vs {hit['secondary_norad']}"
    hit["score"] = float(hit.get("score") or 0.0) * _CONJUNCTION_SCORE_BOOST
    return hit


def _rank_conjunctions(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        hits,
        key=lambda hit: (
            _RISK_RANK.get(str(hit.get("risk_level") or ""), 9),
            float(hit["miss_km"]) if hit.get("miss_km") is not None else 1e9,
        ),
    )


def _merge_hits(
    preferred: list[dict[str, Any]], filler: list[dict[str, Any]], size: int
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[Any, Any]] = set()
    for hit in preferred + filler:
        key = (hit.get("index"), hit.get("id"))
        if key in seen:
            continue
        seen.add(key)
        merged.append(hit)
        if len(merged) >= size:
            break
    return merged


async def _live_hits(
    request: SearchRequest, query_expanded: QueryExpanded
) -> list[dict[str, Any]]:
    """Run hybrid search, boosting ISS conjunctions for debris_near_asset."""
    filters = request.filters.to_es_filters()
    size = request.size

    if not _is_asset_conjunction_intent(query_expanded):
        return await es_client.hybrid_search(
            ",".join(request.filters.target_indices()),
            request.query,
            filters,
            size,
        )

    conjunction_hits = await es_client.hybrid_search(
        _CONJUNCTION_INDEX,
        request.query,
        {**filters, "primary_norad": query_expanded.asset_norad},
        size,
    )
    preferred = _rank_conjunctions(
        [_normalize_conjunction_hit(dict(hit)) for hit in conjunction_hits]
    )
    if len(preferred) >= size:
        return preferred[:size]

    filler_indices = [
        index
        for index in request.filters.target_indices()
        if index != _CONJUNCTION_INDEX
    ] or list(_FILLER_INDICES)
    filler = await es_client.hybrid_search(
        ",".join(filler_indices),
        request.query,
        filters,
        size - len(preferred),
    )
    return _merge_hits(preferred, filler, size)


def _mock_response(
    request: SearchRequest, query_expanded: QueryExpanded, started: float, reason: str
) -> SearchResponse:
    return SearchResponse(
        query_expanded=query_expanded,
        hits=mock_search_hits(request.filters, request.size),
        took_ms=_elapsed_ms(started),
        mock=True,
        note=f"{ES_DOWN_NOTE} ({reason})",
    )


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
