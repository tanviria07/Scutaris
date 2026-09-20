"""Lightweight query understanding for `/search` and the agent pipeline.

Deliberately rule-based: it runs in microseconds, never fails, and produces the
`query_expanded` block the frontend uses to label a result set. Part 5's agents
do the real reasoning.
"""

from __future__ import annotations

import re

from contracts.schemas import QueryExpanded, QueryIntent

#: Common demo assets that operators refer to by name rather than NORAD id.
ASSET_ALIASES: dict[str, str] = {
    "iss": "25544",
    "zarya": "25544",
    "international space station": "25544",
    "css": "48274",
    "tianhe": "48274",
    "tiangong": "48274",
    "hubble": "20580",
    "hst": "20580",
    "landsat 8": "39084",
    "landsat-8": "39084",
}

_NORAD_RE = re.compile(r"\b(\d{4,6})\b")
_DEBRIS_RE = re.compile(r"\bdebris\b|\bfragment", re.IGNORECASE)
_CONJUNCTION_RE = re.compile(
    r"\bconjunction|\bclose approach|\bcollision|\btca\b|\bmiss distance\b",
    re.IGNORECASE,
)


def resolve_asset_norad(query: str) -> str | None:
    """Pull an asset NORAD id out of a natural-language query, if one is named."""
    lowered = query.lower()
    for alias, norad_id in ASSET_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", lowered):
            return norad_id
    match = _NORAD_RE.search(query)
    return match.group(1) if match else None


def classify_intent(query: str, asset_norad: str | None) -> QueryIntent:
    """Bucket the query into one of the four intents the UI knows how to render."""
    if _DEBRIS_RE.search(query) and asset_norad:
        return "debris_near_asset"
    if _CONJUNCTION_RE.search(query):
        return "conjunction_lookup"
    if asset_norad:
        return "object_lookup"
    return "general_search"


def expand_query(query: str, asset_norad: str | None = None) -> QueryExpanded:
    """Build the `query_expanded` block, honouring an explicitly supplied asset."""
    resolved = asset_norad or resolve_asset_norad(query)
    return QueryExpanded(asset_norad=resolved, intent=classify_intent(query, resolved))
