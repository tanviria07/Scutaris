"""Fixture data served when Elasticsearch is unreachable.

Every response built from this module carries `mock: true` and a `note`, so a
degraded backend is never mistaken for a working one. The fixtures are shaped
around the golden query — `show me high-risk debris near the ISS` — so the
frontend and the demo stay buildable while Elastic Cloud is still coming up.
"""

from __future__ import annotations

from typing import Any

from contracts.schemas import (
    EsqlColumn,
    SearchFilters,
    SearchHit,
    classify_risk,
)

ES_DOWN_NOTE = (
    "Elasticsearch unreachable — serving labeled fixture data. "
    "Numbers are illustrative, not live CelesTrak state."
)

#: `(primary, secondary, tca_utc, miss_km, pc)` — risk_level is derived, never typed.
_CONJUNCTION_FIXTURES: tuple[tuple[str, str, str, float, float], ...] = (
    ("25544", "34427", "2026-09-20T04:12:07Z", 0.42, 3.1e-4),
    ("25544", "30592", "2026-09-20T09:48:31Z", 4.80, 2.2e-5),
    ("48274", "34155", "2026-09-20T15:03:55Z", 18.60, 1.1e-6),
    ("20580", "13552", "2026-09-21T02:27:14Z", 62.30, 4.0e-8),
)

_OBJECT_FIXTURES: tuple[dict[str, Any], ...] = (
    {
        "index": "scutaris-satellites",
        "id": "25544",
        "norad_id": "25544",
        "name": "ISS (ZARYA)",
        "score": 18.42,
        "risk_level": None,
        "orbit_class": "LEO",
        "lat": 12.41,
        "lon": -53.22,
        "alt_km_now": 417.3,
        "snippet": "ISS (ZARYA), NORAD 25544, LEO station at 417 km, inclination 51.6 deg.",
    },
    {
        "index": "scutaris-satellites",
        "id": "48274",
        "norad_id": "48274",
        "name": "CSS (TIANHE)",
        "score": 11.07,
        "risk_level": None,
        "orbit_class": "LEO",
        "lat": -8.63,
        "lon": 104.91,
        "alt_km_now": 389.6,
        "snippet": "CSS (TIANHE), NORAD 48274, LEO station at 390 km, inclination 41.5 deg.",
    },
    {
        "index": "scutaris-debris",
        "id": "34427",
        "norad_id": "34427",
        "name": "COSMOS 2251 DEB",
        "score": 14.86,
        "risk_level": "critical",
        "orbit_class": "LEO",
        "lat": 13.88,
        "lon": -51.07,
        "alt_km_now": 416.8,
        "snippet": "COSMOS 2251 DEB, NORAD 34427, fragment of COSMOS 2251, LEO at 417 km.",
    },
    {
        "index": "scutaris-debris",
        "id": "30592",
        "norad_id": "30592",
        "name": "FENGYUN 1C DEB",
        "score": 12.40,
        "risk_level": "high",
        "orbit_class": "LEO",
        "lat": 9.02,
        "lon": -57.75,
        "alt_km_now": 421.5,
        "snippet": "FENGYUN 1C DEB, NORAD 30592, fragment of FENGYUN 1C, LEO at 422 km.",
    },
    {
        "index": "scutaris-debris",
        "id": "34155",
        "norad_id": "34155",
        "name": "IRIDIUM 33 DEB",
        "score": 9.71,
        "risk_level": "medium",
        "orbit_class": "LEO",
        "lat": -7.44,
        "lon": 101.38,
        "alt_km_now": 412.2,
        "snippet": "IRIDIUM 33 DEB, NORAD 34155, fragment of IRIDIUM 33, LEO at 412 km.",
    },
)


def _conjunction_hit(
    primary: str, secondary: str, tca_utc: str, miss_km: float, pc: float, score: float
) -> dict[str, Any]:
    risk_level = classify_risk(miss_km, pc)
    return {
        "index": "scutaris-conjunctions",
        "id": f"{primary}-{secondary}-{tca_utc}",
        "norad_id": primary,
        "name": f"{primary} vs {secondary}",
        "score": score,
        "risk_level": risk_level,
        "orbit_class": "LEO",
        "lat": None,
        "lon": None,
        "alt_km_now": None,
        "snippet": (
            f"Conjunction {primary} vs {secondary} at TCA {tca_utc}: "
            f"miss {miss_km} km, Pc {pc:.1e}, risk {risk_level}."
        ),
    }


_ALL_FIXTURES: tuple[dict[str, Any], ...] = _OBJECT_FIXTURES + tuple(
    _conjunction_hit(*row, score=16.0 - index * 2.3)
    for index, row in enumerate(_CONJUNCTION_FIXTURES)
)


def mock_search_hits(filters: SearchFilters, size: int) -> list[SearchHit]:
    """Fixtures narrowed by the same filters a live search would have applied."""
    indices = set(filters.target_indices())
    orbit_classes = set(filters.orbit_class or ())
    risk_levels = set(filters.risk_level or ())

    selected: list[SearchHit] = []
    for fixture in _ALL_FIXTURES:
        if fixture["index"] not in indices:
            continue
        if orbit_classes and fixture.get("orbit_class") not in orbit_classes:
            continue
        if risk_levels and fixture.get("risk_level") not in risk_levels:
            continue
        selected.append(SearchHit.from_es(fixture))

    selected.sort(key=lambda hit: hit.score, reverse=True)
    return selected[:size]


MOCK_ESQL_COLUMNS: tuple[EsqlColumn, ...] = (
    EsqlColumn(name="primary_norad", type="keyword"),
    EsqlColumn(name="secondary_norad", type="keyword"),
    EsqlColumn(name="tca_utc", type="date"),
    EsqlColumn(name="miss_km", type="double"),
    EsqlColumn(name="pc", type="double"),
    EsqlColumn(name="risk_level", type="keyword"),
)


def mock_esql_values() -> list[list[Any]]:
    """Conjunction rows in `MOCK_ESQL_COLUMNS` order, sorted by miss distance."""
    rows = sorted(_CONJUNCTION_FIXTURES, key=lambda row: row[3])
    return [
        [primary, secondary, tca_utc, miss_km, pc, classify_risk(miss_km, pc)]
        for primary, secondary, tca_utc, miss_km, pc in rows
    ]
