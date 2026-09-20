"""Bridges the LangGraph run to the `GET /agent/stream` SSE generator.

`build_avoidance_graph` publishes progress to an `asyncio.Queue` while the graph
runs as a task; this module races the queue against that task so events reach
the browser as they happen instead of after the pipeline finishes.

With no `LLM_API_KEY` configured it emits a deterministic event sequence with
`mock: true`, so the timeline UI still has something to render.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, AsyncIterator

from backend.agents.config import LLMConfig
from backend.agents.graph import build_avoidance_graph, initial_state
from contracts.schemas import AGENT_SEQUENCE, AgentName

logger = logging.getLogger(__name__)

MOCK_NOTE = "LLM_API_KEY unset — deterministic agent events, no live reasoning."

#: FIX 1 / FIX 7 tool assignments, mirrored by the deterministic fallback.
AGENT_TOOLS: dict[AgentName, tuple[str, ...]] = {
    "SCOUT": ("search_satellites", "find_conjunctions"),
    "ANALYST": ("find_conjunctions", "search_debris", "assess_risk"),
    "PLANNER": ("query_constraints",),
    "SAFETY": ("query_constraints",),
    "OPS_BRIEF": ("assess_risk",),
}

_FALLBACK_SUMMARIES: dict[AgentName, str] = {
    "SCOUT": "Shortlisted 3 debris fragments co-orbital with the asset.",
    "ANALYST": "Top pair 25544 vs 34427 — miss 0.42 km, Pc 3.1e-4, risk critical.",
    "PLANNER": "Two options: 0.18 m/s prograde at TCA-90m, or 0.31 m/s at TCA-40m.",
    "SAFETY": "Option A validated: within fuel budget, no blackout overlap.",
    "OPS_BRIEF": "Operator brief assembled with recommended maneuver and rationale.",
}

_BRIEF_FIELDS: tuple[tuple[str, str], ...] = (
    ("headline", r"HEADLINE:\s*(.+)"),
    ("risk_level", r"RISK:\s*([A-Za-z]+)"),
    ("miss_km", r"MISS_KM:\s*([0-9.eE+-]+)"),
    ("pc", r"PC:\s*([0-9.eE+-]+)"),
    ("tca_utc", r"TCA:\s*(\S+)"),
    ("recommendation", r"RECOMMENDATION:\s*(.+)"),
    ("rationale", r"RATIONALE:\s*(.+)"),
)


def _float_or_none(raw: str) -> float | None:
    """Parse a number the LLM quoted back, or return None rather than guess."""
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _parse_brief(ops_brief: str, fallback_text: str) -> dict[str, Any]:
    """Pull the labelled OPS_BRIEF fields out of the agent's own text.

    Nothing is invented: a field the agent did not emit stays `None`, and the
    raw text is always carried so the UI can show what was actually said.
    """
    text = ops_brief or ""
    brief: dict[str, Any] = {"text": text.strip() or fallback_text}
    for key, pattern in _BRIEF_FIELDS:
        match = re.search(pattern, text)
        if not match:
            brief[key] = None
            continue
        value = match.group(1).strip()
        brief[key] = (
            _float_or_none(value)
            if key in {"miss_km", "pc"}
            else value.lower()
            if key == "risk_level"
            else value
        )
    return brief


def _parse_maneuver(planner_output: str, safety_output: str) -> dict[str, Any]:
    """Summarize PLANNER's options and SAFETY's verdict without re-deriving them."""
    safety_text = safety_output or ""
    rejected = "NO SAFE OPTION" in safety_text.upper()
    return {
        "options": (planner_output or "").strip() or None,
        "verdict": safety_text.strip() or None,
        "validated": bool(re.search(r"VALIDATED", safety_text, re.IGNORECASE))
        and not rejected,
    }


async def _drain(queue: "asyncio.Queue[dict[str, Any]]") -> list[dict[str, Any]]:
    """Take every event already queued, without waiting for more."""
    events: list[dict[str, Any]] = []
    while not queue.empty():
        events.append(queue.get_nowait())
    return events


async def stream_avoidance_pipeline(
    query: str, asset_norad: str = "25544"
) -> AsyncIterator[dict[str, Any]]:
    """Yield SSE event dicts (`{"event": name, "data": {...}}`) for one run.

    Emits `agent_start`, `tool_start`, `tool_end`, and `agent_done` as the graph
    progresses, then exactly one terminal `pipeline_done` or `pipeline_error`.
    """
    started = time.perf_counter()
    config = LLMConfig.from_env()

    if not config.is_configured:
        async for event in _fallback_pipeline(query, asset_norad, started):
            yield event
        return

    queue: "asyncio.Queue[dict[str, Any]]" = asyncio.Queue()
    graph = build_avoidance_graph(config, queue)
    run = asyncio.create_task(graph.ainvoke(initial_state(query, asset_norad)))
    hit_ids: list[str] = []
    last_agent: str = AGENT_SEQUENCE[0]

    try:
        while True:
            pending_event = asyncio.create_task(queue.get())
            done, _ = await asyncio.wait(
                {pending_event, run}, return_when=asyncio.FIRST_COMPLETED
            )
            if pending_event in done:
                event = pending_event.result()
                last_agent = str(event["data"].get("agent") or last_agent)
                hit_ids.extend(event["data"].get("norad_ids") or [])
                yield event
                continue

            pending_event.cancel()
            for event in await _drain(queue):
                last_agent = str(event["data"].get("agent") or last_agent)
                hit_ids.extend(event["data"].get("norad_ids") or [])
                yield event
            break

        state = run.result()
    except asyncio.CancelledError:
        run.cancel()
        raise
    except Exception as exc:  # noqa: BLE001 - the client gets an event, not a dead socket
        logger.exception("Agent pipeline failed (q=%r)", query)
        yield {
            "event": "pipeline_error",
            "data": {
                "agent": last_agent,
                "error": f"{type(exc).__name__}: {exc}",
                "message": f"{type(exc).__name__}: {exc}",
                "took_ms": _elapsed_ms(started),
            },
        }
        return

    ops_brief = str(state.get("ops_brief") or "")
    yield {
        "event": "pipeline_done",
        "data": {
            "query": query,
            "asset_norad": asset_norad,
            "brief": _parse_brief(ops_brief, "OPS_BRIEF produced no text."),
            "maneuver": _parse_maneuver(
                str(state.get("planner_output") or ""),
                str(state.get("safety_output") or ""),
            ),
            "hit_ids": list(dict.fromkeys(hit_ids)),
            "agents": {
                "SCOUT": state.get("scout_output"),
                "ANALYST": state.get("analyst_output"),
                "PLANNER": state.get("planner_output"),
                "SAFETY": state.get("safety_output"),
                "OPS_BRIEF": state.get("ops_brief"),
            },
            "took_ms": _elapsed_ms(started),
            "mock": False,
            "note": None,
            "llm": config.describe(),
        },
    }


async def _fallback_pipeline(
    query: str, asset_norad: str, started: float
) -> AsyncIterator[dict[str, Any]]:
    """Deterministic event sequence used when no LLM key is configured."""
    logger.warning(MOCK_NOTE)
    for position, agent in enumerate(AGENT_SEQUENCE, start=1):
        tools = AGENT_TOOLS[agent]
        yield {
            "event": "agent_start",
            "data": {
                "agent": agent,
                "position": position,
                "of": len(AGENT_SEQUENCE),
                "tools": list(tools),
            },
        }
        for tool_name in tools:
            yield {
                "event": "tool_start",
                "data": {"agent": agent, "tool": tool_name, "args": {"norad_id": asset_norad}},
            }
            yield {
                "event": "tool_end",
                "data": {
                    "agent": agent,
                    "tool": tool_name,
                    "ok": True,
                    "result_count": 0,
                    "preview": MOCK_NOTE,
                    "norad_ids": [asset_norad],
                    "took_ms": 0,
                },
            }
        yield {
            "event": "agent_done",
            "data": {
                "agent": agent,
                "summary": _FALLBACK_SUMMARIES[agent],
                "took_ms": 0,
            },
        }

    yield {
        "event": "pipeline_done",
        "data": {
            "query": query,
            "asset_norad": asset_norad,
            "brief": {
                "text": _FALLBACK_SUMMARIES["OPS_BRIEF"],
                "headline": None,
                "risk_level": None,
                "miss_km": None,
                "pc": None,
                "tca_utc": None,
                "recommendation": None,
                "rationale": None,
            },
            "maneuver": {"options": None, "verdict": None, "validated": False},
            "hit_ids": [asset_norad],
            "agents": dict(_FALLBACK_SUMMARIES),
            "took_ms": _elapsed_ms(started),
            "mock": True,
            "note": MOCK_NOTE,
            "llm": "unconfigured",
        },
    }


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


__all__ = ["AGENT_TOOLS", "MOCK_NOTE", "stream_avoidance_pipeline"]
