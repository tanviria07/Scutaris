"""`GET /agent/stream` — SSE for the sequential LangGraph pipeline.

Part 2 stub: it walks SCOUT -> OPS_BRIEF on a timer and emits the exact event
names and agent order the real pipeline will use, so the frontend timeline can
be built and demoed before Part 5 lands. Only the generator body changes later;
the wire format does not.
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

from backend.routers.mock_data import mock_search_hits
from backend.routers.nlu import expand_query
from backend.routers.visualize import build_prompt
from contracts.schemas import AGENT_SEQUENCE, AgentName, SearchFilters, SseEventName

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agents"])

STUB_NOTE = "LangGraph pipeline not wired yet (Part 5) — scripted event stream."

#: FIX 1 / FIX 7 tool assignments. Tools inside one agent may run in parallel,
#: which is why the stub emits every `tool_start` for an agent before its
#: `tool_end` events.
AGENT_TOOLS: dict[AgentName, tuple[str, ...]] = {
    "SCOUT": ("search_satellites", "find_conjunctions"),
    "ANALYST": ("find_conjunctions", "search_debris", "assess_risk"),
    "PLANNER": ("query_constraints",),
    "SAFETY": ("query_constraints",),
    "OPS_BRIEF": ("assess_risk",),
}

AGENT_SUMMARIES: dict[AgentName, str] = {
    "SCOUT": "Shortlisted 3 debris fragments co-orbital with the asset.",
    "ANALYST": "Top pair 25544 vs 34427 — miss 0.42 km, Pc 3.1e-4, risk critical.",
    "PLANNER": "Two options: 0.18 m/s prograde at TCA-90m, or 0.31 m/s at TCA-40m.",
    "SAFETY": "Option A validated: within fuel budget, no blackout overlap, perigee safe.",
    "OPS_BRIEF": "Operator brief assembled with recommended maneuver and rationale.",
}

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    # Stop nginx/Railway from buffering the stream into a single chunk.
    "X-Accel-Buffering": "no",
}


@router.get("/agent/stream")
async def agent_stream(
    q: str = Query(min_length=1, max_length=512, description="Natural language query"),
    asset_norad: str | None = Query(default=None, description="Primary asset NORAD id"),
    delay: float = Query(
        default=0.5, ge=0.0, le=2.0, description="Seconds between scripted steps"
    ),
) -> StreamingResponse:
    """Stream the scripted SCOUT -> OPS_BRIEF pipeline as Server-Sent Events."""
    return StreamingResponse(
        _pipeline(q, asset_norad, delay),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


async def _pipeline(query: str, asset_norad: str | None, delay: float) -> AsyncIterator[str]:
    started = time.perf_counter()
    expanded = expand_query(query, asset_norad)

    # Opening comment flushes proxy buffers before the first real event.
    yield ": scutaris agent stream open\n\n"

    try:
        for position, agent in enumerate(AGENT_SEQUENCE, start=1):
            agent_started = time.perf_counter()
            tools = AGENT_TOOLS[agent]

            yield _sse(
                "agent_start",
                {
                    "agent": agent,
                    "position": position,
                    "of": len(AGENT_SEQUENCE),
                    "query": query,
                    "asset_norad": expanded.asset_norad,
                },
            )
            await asyncio.sleep(delay)

            for tool in tools:
                yield _sse(
                    "tool_start",
                    {"agent": agent, "tool": tool, "args": _tool_args(tool, expanded.asset_norad)},
                )

            for tool in tools:
                await asyncio.sleep(delay)
                yield _sse(
                    "tool_end",
                    {
                        "agent": agent,
                        "tool": tool,
                        "ok": True,
                        "result_count": 3,
                        "took_ms": int(delay * 1000),
                    },
                )

            yield _sse(
                "agent_done",
                {
                    "agent": agent,
                    "summary": AGENT_SUMMARIES[agent],
                    "took_ms": _elapsed_ms(agent_started),
                },
            )

        yield _sse("pipeline_done", _final_payload(query, expanded.asset_norad, started))

    except asyncio.CancelledError:
        logger.info("Agent stream cancelled by client (q=%r)", query)
        raise
    except Exception as exc:  # noqa: BLE001 - the client gets an event, not a dead socket
        logger.exception("Agent stream failed (q=%r)", query)
        yield _sse(
            "pipeline_error",
            {
                "message": f"{type(exc).__name__}: {exc}",
                "took_ms": _elapsed_ms(started),
            },
        )


def _final_payload(query: str, asset_norad: str | None, started: float) -> dict[str, Any]:
    """The `pipeline_done` body: brief, maneuver, hit ids, visualize card."""
    hits = mock_search_hits(SearchFilters(), size=6)
    risk_context = {
        "primary_name": "ISS (ZARYA)",
        "primary_norad": asset_norad or "25544",
        "secondary_name": "COSMOS 2251 DEB",
        "secondary_norad": "34427",
        "tca_utc": "2026-09-20T04:12:07Z",
        "miss_km": 0.42,
        "risk_level": "critical",
    }
    return {
        "query": query,
        "asset_norad": asset_norad or "25544",
        "brief": {
            "headline": "Critical conjunction: ISS (25544) vs COSMOS 2251 DEB (34427)",
            "risk_level": "critical",
            "tca_utc": "2026-09-20T04:12:07Z",
            "miss_km": 0.42,
            "pc": 3.1e-4,
            "recommendation": "Execute option A: 0.18 m/s prograde burn at TCA-90m.",
            "rationale": (
                "Pc exceeds 1e-4, which escalates to critical regardless of miss "
                "distance. Option A clears the screening volume with the smaller "
                "of the two fuel costs and avoids the ground-station blackout."
            ),
        },
        "maneuver": {
            "option": "A",
            "dv_ms": 0.18,
            "direction": "prograde",
            "burn_utc": "2026-09-20T02:42:07Z",
            "fuel_cost_kg": 0.9,
            "validated": True,
        },
        # Conjunction docs reuse their primary NORAD id, so deduplicate.
        "hit_ids": list(dict.fromkeys(hit.norad_id for hit in hits if hit.norad_id)),
        "visualize": {
            "type": "risk_card",
            "prompt_used": build_prompt("risk_card", risk_context),
            "image_url": "/static/mocks/risk_card.png",
        },
        "took_ms": _elapsed_ms(started),
        "mock": True,
        "note": STUB_NOTE,
    }


def _tool_args(tool: str, asset_norad: str | None) -> dict[str, Any]:
    """Plausible arguments so the timeline UI has something to render."""
    norad_id = asset_norad or "25544"
    match tool:
        case "search_satellites":
            return {"query": "station", "filters": {"orbit_class": ["LEO"]}}
        case "find_conjunctions":
            return {"norad_id": norad_id, "horizon_hours": 72}
        case "search_debris":
            return {"orbit_class": "LEO", "limit": 20}
        case "query_constraints":
            return {"norad_id": norad_id}
        case "assess_risk":
            return {"primary_norad": norad_id, "secondary_norad": "34427"}
        case _:
            return {}


def _sse(event: SseEventName | str, data: dict[str, Any]) -> str:
    payload = {"ts": datetime.now(timezone.utc).isoformat(), **data}
    return f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)
