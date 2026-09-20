"""Part 5 — the sequential LangGraph collision-avoidance pipeline.

Five agents run in order (FIX 1): SCOUT -> ANALYST -> PLANNER -> SAFETY ->
OPS_BRIEF. Each one may call only the tools listed for it in `prompts.py`, and
every tool in `tools.py` wraps `backend.es_client` rather than talking to
Elasticsearch directly.

`stream.stream_avoidance_pipeline` is the entry point used by
`GET /agent/stream`; it yields the SSE event dicts the frontend timeline
consumes. With no `LLM_API_KEY` the pipeline degrades to deterministic events
so the demo still runs.
"""

from __future__ import annotations

from backend.agents.config import LLMConfig
from backend.agents.stream import stream_avoidance_pipeline

__all__ = ["LLMConfig", "stream_avoidance_pipeline"]
