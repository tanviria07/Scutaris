"""`POST /search` — natural language to hybrid (BM25 + kNN, RRF) search."""

from __future__ import annotations

import logging
import time

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


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    """Run a hybrid search, falling back to labeled fixtures if Elastic is down."""
    started = time.perf_counter()
    query_expanded = expand_query(request.query)

    if not await es_available():
        return _mock_response(request, query_expanded, started, "cluster unreachable")

    try:
        raw_hits = await wait_or_abandon(
            es_client.hybrid_search(
                ",".join(request.filters.target_indices()),
                request.query,
                request.filters.to_es_filters(),
                request.size,
            ),
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
