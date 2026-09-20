"""`POST /visualize` — Grok Imagine cards.

Part 2 stub: the FIX 4 prompt templates are real and final, the image is a
static placeholder. Part 4 replaces `_render` with the Grok Imagine call and
keeps everything else — including the response shape — as is.
"""

from __future__ import annotations

import time
from typing import Any, Mapping

from fastapi import APIRouter

from contracts.schemas import CardType, VisualizeRequest, VisualizeResponse

router = APIRouter(tags=["visualize"])

STUB_NOTE = "Grok Imagine not wired yet (Part 4) — static placeholder image."

#: FIX 4 templates. Brand palette: teal #5eead4, amber #fbbf24, red #ef4444.
PROMPT_TEMPLATES: dict[CardType, str] = {
    "risk_card": (
        "Cinematic space-ops risk card. Conjunction {primary_name} "
        "(NORAD {primary_norad}) vs {secondary_name} (NORAD {secondary_norad}). "
        "TCA {tca_utc}. Miss {miss_km} km. Risk {risk_level}. "
        "Dark HUD poster, teal orbit arcs (#5eead4), amber (#fbbf24) or red "
        "(#ef4444) by severity, no gore, square."
    ),
    "object_card": (
        'Mission-patch emblem for "{name}" (NORAD {norad_id}), {orbit_class}. '
        "Dark badge, teal (#5eead4) linework, minimal type, no crash imagery."
    ),
    "scenario_card": (
        'Atmospheric LEO scene for query "{query}". Earth limb, sparse debris '
        "sparks, teal HUD (#5eead4), amber watch highlights (#fbbf24), dark "
        "cinematic frame."
    ),
}

#: Any placeholder a template references but the caller omitted.
_PLACEHOLDER = "unknown"


class _DefaultingContext(dict):
    """Renders missing template keys as `unknown` instead of raising."""

    def __missing__(self, key: str) -> str:
        return _PLACEHOLDER


@router.post("/visualize", response_model=VisualizeResponse)
async def visualize(request: VisualizeRequest) -> VisualizeResponse:
    """Build the Imagine prompt for `type` and return a card image URL."""
    started = time.perf_counter()
    prompt = build_prompt(request.type, request.context)
    image_url, cached = _render(request.type, prompt)
    return VisualizeResponse(
        type=request.type,
        prompt_used=prompt,
        image_url=image_url,
        cached=cached,
        took_ms=int((time.perf_counter() - started) * 1000),
        mock=True,
        note=STUB_NOTE,
    )


def build_prompt(card_type: CardType, context: Mapping[str, Any]) -> str:
    """Fill the FIX 4 template for `card_type` from `context`."""
    return PROMPT_TEMPLATES[card_type].format_map(_DefaultingContext(context))


def _render(card_type: CardType, prompt: str) -> tuple[str, bool]:
    """Stub renderer. Part 4 swaps this for `backend.grok_imagine.generate`."""
    return f"/static/mocks/{card_type}.png", True
