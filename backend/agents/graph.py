"""The sequential LangGraph pipeline: SCOUT -> ANALYST -> PLANNER -> SAFETY -> OPS_BRIEF.

Agents are strictly sequential (FIX 1); the tool calls an agent emits in one
round may run together inside `ToolNode`. Each agent gets a hard 10s budget, and
progress is published to an `asyncio.Queue` so `stream.py` can turn it into SSE
without waiting for the graph to finish.
"""

from __future__ import annotations

import asyncio
import json
import logging
import operator
import time
from typing import Annotated, Any, Awaitable, Callable, Optional, Sequence, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from backend.agents.config import LLMConfig
from backend.agents.prompts import (
    AGENT_TASKS,
    ANALYST_PROMPT,
    OPS_BRIEF_PROMPT,
    PLANNER_PROMPT,
    SAFETY_PROMPT,
    SCOUT_PROMPT,
)
from backend.agents.tools import (
    ANALYST_TOOLS,
    OPS_BRIEF_TOOLS,
    PLANNER_TOOLS,
    SAFETY_TOOLS,
    SCOUT_TOOLS,
)
from contracts.schemas import AGENT_SEQUENCE, AgentName

logger = logging.getLogger(__name__)

#: FIX 1: per-agent hard timeout, which keeps the pipeline inside ~50-60s.
AGENT_TIMEOUT_S = 10.0
#: Prior agents' findings are quoted into the next prompt up to this length.
CONTEXT_CHAR_CAP = 500
#: Tool payloads are truncated to this length before the LLM sees them.
TOOL_RESULT_CHAR_CAP = 800

_OUTPUT_KEYS: dict[AgentName, str] = {
    "SCOUT": "scout_output",
    "ANALYST": "analyst_output",
    "PLANNER": "planner_output",
    "SAFETY": "safety_output",
    "OPS_BRIEF": "ops_brief",
}


class AgentState(TypedDict):
    """State threaded through the five nodes."""

    messages: Annotated[list, operator.add]
    current_agent: str
    scout_output: Optional[str]
    analyst_output: Optional[str]
    planner_output: Optional[str]
    safety_output: Optional[str]
    ops_brief: Optional[str]


def initial_state(query: str, asset_norad: str) -> AgentState:
    """Seed the graph with the operator's question."""
    return {
        "messages": [HumanMessage(content=_task_text(query, asset_norad))],
        "current_agent": AGENT_SEQUENCE[0],
        "scout_output": None,
        "analyst_output": None,
        "planner_output": None,
        "safety_output": None,
        "ops_brief": None,
    }


def _task_text(query: str, asset_norad: str) -> str:
    """The human turn every agent sees, naming the query and the asset."""
    return (
        f"Operator query: {query}\n"
        f"Primary asset NORAD id: {asset_norad}\n"
        "Use your tools, then report your findings."
    )


def _truncate(text: str, cap: int) -> str:
    """Clip `text` to `cap` characters, marking it when clipped."""
    text = text.strip()
    return text if len(text) <= cap else f"{text[: cap - 3]}..."


def _stringify(content: Any) -> str:
    """Flatten a message content payload (str or content blocks) to text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(part for part in parts if part)
    return str(content or "")


def _prior_context(state: AgentState) -> list[str]:
    """Quote every upstream agent's output, capped, in pipeline order."""
    labels: Sequence[tuple[str, str]] = (
        ("SCOUT", "scout_output"),
        ("ANALYST", "analyst_output"),
        ("PLANNER", "planner_output"),
        ("SAFETY", "safety_output"),
    )
    lines: list[str] = []
    for label, key in labels:
        value = state.get(key)
        if value:
            lines.append(f"{label} findings: {_truncate(str(value), CONTEXT_CHAR_CAP)}")
    return lines


def _norad_ids(payload: str) -> list[str]:
    """Best-effort NORAD ids from a tool payload, for `pipeline_done.hit_ids`."""
    ids: list[str] = []
    try:
        parsed = json.loads(payload)
    except (TypeError, ValueError):
        return ids
    rows = parsed if isinstance(parsed, list) else [parsed]
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key in ("norad_id", "primary_norad", "secondary_norad"):
            value = row.get(key)
            if value:
                ids.append(str(value))
    return list(dict.fromkeys(ids))


async def _emit(queue: "asyncio.Queue[dict[str, Any]] | None", event: str, data: dict[str, Any]) -> None:
    """Publish one pipeline event, tolerating a caller that is not listening."""
    if queue is None:
        return
    await queue.put({"event": event, "data": data})


def _create_agent_node(
    llm: ChatOpenAI,
    system_prompt: str,
    tools: list[BaseTool],
    agent_name: AgentName,
    output_key: str,
    next_agent: str,
    event_queue: "asyncio.Queue[dict[str, Any]] | None",
    max_iterations: int = 10,
) -> Callable[[AgentState], Awaitable[dict[str, Any]]]:
    """Build one agent node: a reason/act loop bound to `tools` only."""
    llm_with_tools = llm.bind_tools(tools)
    tool_node = ToolNode(tools)
    tool_names = tuple(tool.name for tool in tools)
    position = AGENT_SEQUENCE.index(agent_name) + 1

    async def _run(state: AgentState) -> dict[str, Any]:
        """One agent turn: think, call tools, report."""
        messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]
        context = _prior_context(state)
        if context:
            messages.append(SystemMessage(content="\n".join(context)))
        mandate = AGENT_TASKS.get(agent_name, "Report your findings.")
        messages.append(
            HumanMessage(
                content=f"{_task_text_from(state)}\n\nYour task as {agent_name}: {mandate}"
            )
        )

        produced: list[BaseMessage] = []
        for _ in range(max_iterations):
            reply = await llm_with_tools.ainvoke(messages)
            messages.append(reply)
            produced.append(reply)
            tool_calls = getattr(reply, "tool_calls", None) or []
            if not tool_calls:
                break

            for call in tool_calls:
                await _emit(
                    event_queue,
                    "tool_start",
                    {
                        "agent": agent_name,
                        "tool": call.get("name"),
                        "args": call.get("args") or {},
                    },
                )

            tool_started = time.perf_counter()
            result = await tool_node.ainvoke({"messages": [reply]})
            took_ms = int((time.perf_counter() - tool_started) * 1000)

            for message in result.get("messages", []):
                payload = _stringify(message.content)
                message.content = _truncate(payload, TOOL_RESULT_CHAR_CAP)
                messages.append(message)
                produced.append(message)
                await _emit(
                    event_queue,
                    "tool_end",
                    {
                        "agent": agent_name,
                        "tool": getattr(message, "name", None),
                        "ok": '"error"' not in payload,
                        "result_count": payload.count("{"),
                        "preview": _truncate(payload, TOOL_RESULT_CHAR_CAP),
                        "norad_ids": _norad_ids(payload)[:10],
                        "took_ms": took_ms,
                    },
                )

        summary = _stringify(produced[-1].content) if produced else ""
        return {
            "messages": produced,
            output_key: summary,
            "current_agent": next_agent,
        }

    def _task_text_from(state: AgentState) -> str:
        """Reuse the operator's original human turn as this agent's task."""
        for message in state.get("messages", []):
            if isinstance(message, HumanMessage):
                return _stringify(message.content)
        return "Report your findings."

    async def _guarded(state: AgentState) -> dict[str, Any]:
        """Run `_run` under the 10s budget, degrading instead of hanging."""
        started = time.perf_counter()
        await _emit(
            event_queue,
            "agent_start",
            {
                "agent": agent_name,
                "position": position,
                "of": len(AGENT_SEQUENCE),
                "tools": list(tool_names),
            },
        )
        try:
            update = await asyncio.wait_for(_run(state), timeout=AGENT_TIMEOUT_S)
        except (asyncio.TimeoutError, TimeoutError):
            # MVP HEURISTIC: a timed-out agent degrades to a note and the chain
            # continues, so one slow hop cannot take down the whole brief.
            logger.warning("%s exceeded %.1fs budget", agent_name, AGENT_TIMEOUT_S)
            note = f"{agent_name} exceeded its {AGENT_TIMEOUT_S:.0f}s budget; no findings."
            update = {"messages": [], output_key: note, "current_agent": next_agent}
        except Exception as exc:  # noqa: BLE001 - surfaced as a degraded agent
            logger.exception("%s failed", agent_name)
            note = f"{agent_name} failed: {type(exc).__name__}: {exc}"
            update = {"messages": [], output_key: note, "current_agent": next_agent}

        await _emit(
            event_queue,
            "agent_done",
            {
                "agent": agent_name,
                "summary": _truncate(str(update.get(output_key) or ""), CONTEXT_CHAR_CAP),
                "took_ms": int((time.perf_counter() - started) * 1000),
            },
        )
        return update

    return _guarded


def build_avoidance_graph(
    config: LLMConfig,
    event_queue: "asyncio.Queue[dict[str, Any]] | None" = None,
) -> Any:
    """Compile the five-agent graph, publishing progress to `event_queue`."""
    llm = ChatOpenAI(**config.to_llm_kwargs())

    specs: list[tuple[AgentName, str, list[BaseTool], str]] = [
        ("SCOUT", SCOUT_PROMPT, list(SCOUT_TOOLS), "ANALYST"),
        ("ANALYST", ANALYST_PROMPT, list(ANALYST_TOOLS), "PLANNER"),
        ("PLANNER", PLANNER_PROMPT, list(PLANNER_TOOLS), "SAFETY"),
        ("SAFETY", SAFETY_PROMPT, list(SAFETY_TOOLS), "OPS_BRIEF"),
        ("OPS_BRIEF", OPS_BRIEF_PROMPT, list(OPS_BRIEF_TOOLS), "END"),
    ]

    graph = StateGraph(AgentState)
    for agent_name, prompt, tools, next_agent in specs:
        graph.add_node(
            agent_name,
            _create_agent_node(
                llm=llm,
                system_prompt=prompt,
                tools=tools,
                agent_name=agent_name,
                output_key=_OUTPUT_KEYS[agent_name],
                next_agent=next_agent,
                event_queue=event_queue,
                max_iterations=config.max_iterations,
            ),
        )

    graph.set_entry_point("SCOUT")
    graph.add_edge("SCOUT", "ANALYST")
    graph.add_edge("ANALYST", "PLANNER")
    graph.add_edge("PLANNER", "SAFETY")
    graph.add_edge("SAFETY", "OPS_BRIEF")
    graph.add_edge("OPS_BRIEF", END)
    return graph.compile()


__all__ = [
    "AGENT_TIMEOUT_S",
    "AgentState",
    "build_avoidance_graph",
    "initial_state",
]
