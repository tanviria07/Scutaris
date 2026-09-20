"""`GET /agent/stream` — SSE for the sequential LangGraph pipeline.

Part 5: the scripted stub is gone. Events now come from
`backend.agents.stream_avoidance_pipeline`, which runs SCOUT -> ANALYST ->
PLANNER -> SAFETY -> OPS_BRIEF against Elasticsearch through the five locked
tools. The wire format is unchanged from the Part 2 stub — same event names,
same agent order — so the frontend timeline keeps working.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from backend.agents.stream import AGENT_TOOLS, stream_avoidance_pipeline
from backend.routers.nlu import expand_query
from contracts.schemas import AGENT_SEQUENCE, AgentName, SseEventName

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agents"])

#: Asset used when the query names no satellite the NLU layer recognizes.
DEFAULT_ASSET_NORAD = "25544"

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    # Stop nginx/Railway from buffering the stream into a single chunk.
    "X-Accel-Buffering": "no",
}

__all__ = ["AGENT_SEQUENCE", "AGENT_TOOLS", "AgentName", "router"]


@router.get("/agent/stream")
async def agent_stream(
    q: str = Query(min_length=1, max_length=512, description="Natural language query"),
    asset_norad: str | None = Query(default=None, description="Primary asset NORAD id"),
) -> StreamingResponse:
    """Stream the SCOUT -> OPS_BRIEF pipeline as Server-Sent Events."""
    return StreamingResponse(
        _pipeline(q, asset_norad),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


async def _pipeline(query: str, asset_norad: str | None) -> AsyncIterator[str]:
    """Serialize pipeline events as SSE frames."""
    started = time.perf_counter()
    expanded = expand_query(query, asset_norad)
    asset = expanded.asset_norad or DEFAULT_ASSET_NORAD

    # Opening comment flushes proxy buffers before the first real event.
    yield ": scutaris agent stream open\n\n"

    try:
        async for event in stream_avoidance_pipeline(query, asset):
            data = dict(event["data"])
            data.setdefault("query", query)
            data.setdefault("asset_norad", asset)
            yield _sse(event["event"], data)
    except asyncio.CancelledError:
        logger.info("Agent stream cancelled by client (q=%r)", query)
        raise
    except Exception as exc:  # noqa: BLE001 - the client gets an event, not a dead socket
        logger.exception("Agent stream failed (q=%r)", query)
        yield _sse(
            "pipeline_error",
            {
                "agent": None,
                "error": f"{type(exc).__name__}: {exc}",
                "message": f"{type(exc).__name__}: {exc}",
                "took_ms": _elapsed_ms(started),
            },
        )


def _sse(event: SseEventName | str, data: dict[str, Any]) -> str:
    payload = {"ts": datetime.now(timezone.utc).isoformat(), **data}
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'), default=str)}\n\n"


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
