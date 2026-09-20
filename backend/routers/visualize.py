"""`POST /visualize` — Grok Imagine cards.

FIX 4 prompt templates live in `backend.grok_imagine`. This router keeps the
`VisualizeResponse` shape locked and degrades to the static placeholder if
Imagine raises.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Mapping

from fastapi import APIRouter

from backend.grok_imagine import ImagineError, build_prompt as _build_prompt
from backend.grok_imagine import generate_image, mock_url
from contracts.schemas import CardType, VisualizeRequest, VisualizeResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["visualize"])

MOCK_NOTE = "Grok Imagine mock mode — XAI_API_KEY unset or USE_MOCK_IMAGINE=1."


@router.post("/visualize", response_model=VisualizeResponse)
async def visualize(request: VisualizeRequest) -> VisualizeResponse:
    """Build the Imagine prompt for `type` and return a card image URL."""
    started = time.perf_counter()
    try:
        result = await generate_image(request.type, dict(request.context))
    except Exception as exc:  # noqa: BLE001 - any Imagine failure degrades to mock
        logger.warning(
            "Grok Imagine failed (%s: %s); serving placeholder",
            type(exc).__name__,
            exc,
        )
        return VisualizeResponse(
            type=request.type,
            prompt_used=build_prompt(request.type, request.context),
            image_url=mock_url(request.type),
            cached=False,
            took_ms=int((time.perf_counter() - started) * 1000),
            mock=True,
            note=(
                f"Grok Imagine failed ({type(exc).__name__}: {exc}); "
                "serving static placeholder."
            ),
        )

    note = MOCK_NOTE if result["mock"] else None
    return VisualizeResponse(
        type=request.type,
        prompt_used=result["prompt_used"],
        image_url=result["image_url"],
        cached=bool(result["cached"]),
        took_ms=int(result["took_ms"]),
        mock=bool(result["mock"]),
        note=note,
    )


def build_prompt(card_type: CardType, context: Mapping[str, Any]) -> str:
    """Fill the FIX 4 template for `card_type` from `context`.

    Kept here so `backend.routers.agents` can keep importing it.
    """
    try:
        return _build_prompt(card_type, context)
    except ImagineError:
        return ""
