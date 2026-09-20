"""`POST /esql` — allowlisted ES|QL over the `scutaris-*` indices.

Validation is a hard failure (400): a query that is not allowlisted must never
be answered with fixtures, or callers would think it ran.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, HTTPException, status

from backend import es_client
from backend.routers.es_guard import es_available, wait_or_abandon
from backend.routers.mock_data import (
    ES_DOWN_NOTE,
    MOCK_ESQL_COLUMNS,
    mock_esql_values,
)
from contracts.schemas import EsqlColumn, EsqlRequest, EsqlResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["esql"])

ESQL_TIMEOUT_S = 10.0


@router.post("/esql", response_model=EsqlResponse)
async def esql(request: EsqlRequest) -> EsqlResponse:
    """Validate against the `scutaris-*` allowlist, then execute."""
    started = time.perf_counter()

    try:
        validated = es_client.validate_esql(request.query)
    except es_client.ESQLValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    if not await es_available():
        return _mock_response(validated, started, "cluster unreachable")

    try:
        result = await wait_or_abandon(
            es_client.esql_query_async(validated), ESQL_TIMEOUT_S
        )
    except Exception as exc:  # noqa: BLE001 - any upstream failure degrades to mock
        logger.warning(
            "esql_query failed (%s: %s); returning mock rows",
            type(exc).__name__,
            exc,
        )
        return _mock_response(validated, started, type(exc).__name__)


    columns = [EsqlColumn(**column) for column in result.get("columns", [])]
    return EsqlResponse(
        query=result.get("query", validated),
        columns=columns,
        values=result.get("values", []),
        rows=result.get("rows", []),
        took_ms=_elapsed_ms(started),
        mock=False,
    )


def _mock_response(query: str, started: float, reason: str) -> EsqlResponse:
    """Fixture conjunction rows, regardless of what the query actually selected."""
    columns = list(MOCK_ESQL_COLUMNS)
    names = [column.name for column in columns]
    values = mock_esql_values()
    return EsqlResponse(
        query=query,
        columns=columns,
        values=values,
        rows=[dict(zip(names, row, strict=False)) for row in values],
        took_ms=_elapsed_ms(started),
        mock=True,
        note=(
            f"{ES_DOWN_NOTE} ({reason}) "
            "Rows are canned conjunctions and ignore the query's clauses."
        ),
    )


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
