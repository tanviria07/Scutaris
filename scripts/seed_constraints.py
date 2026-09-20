"""Seed operator-constraint documents into scutaris-constraints.

Usage:
    python scripts/seed_constraints.py
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import _bootstrap  # noqa: F401  (adds the project root to sys.path)

from backend.config import INDEX_CONSTRAINTS, INDEX_SATELLITES, get_settings
from backend.es_client import bulk_index, cluster_banner, count_docs, get_es_client

logger = logging.getLogger("scutaris.seed_constraints")

ISS_NORAD = "25544"
STARLINK_1007_NORAD = "43013"

SEED: list[dict[str, Any]] = [
    {
        "norad_id": ISS_NORAD,
        "fuel_kg": 45.0,
        "max_dv_ms": 50.0,
        "min_perigee_km": 400.0,
        "blackout_windows": [],
        "notes": "ISS — demo constraint seed (HackMIT).",
    },
    {
        "norad_id": STARLINK_1007_NORAD,
        "fuel_kg": 30.0,
        "max_dv_ms": 40.0,
        "min_perigee_km": 340.0,
        "blackout_windows": [],
        "notes": "Starlink-1007 — demo constraint seed (HackMIT).",
    },
]


def _extra_satellites(limit: int, skip: set[str]) -> list[dict[str, Any]]:
    """Pull the first `limit` catalog satellites not already in `skip`."""
    client = get_es_client()
    result = client.search(
        index=INDEX_SATELLITES,
        size=max(limit + len(skip), 20),
        query={"match_all": {}},
        source=["norad_id", "name", "orbit_class", "altitude_km"],
        sort=[{"norad_id": {"order": "asc"}}],
    )
    extras: list[dict[str, Any]] = []
    for hit in result.get("hits", {}).get("hits", []):
        src = hit.get("_source") or {}
        norad = str(src.get("norad_id") or "")
        if not norad or norad in skip:
            continue
        extras.append(src)
        if len(extras) >= limit:
            break
    return extras


def _constraint_for(sat: dict[str, Any], index: int) -> dict[str, Any]:
    """Invent a plausible constraint row for one live catalog satellite."""
    # MVP HEURISTIC: fuel/dv/perigee are demo values, not operator-reported.
    altitude = float(sat.get("altitude_km") or 400.0)
    min_perigee = max(200.0, round(altitude - 40.0, 1))
    name = sat.get("name") or f"NORAD {sat['norad_id']}"
    return {
        "norad_id": str(sat["norad_id"]),
        "fuel_kg": 25.0 + 5.0 * (index % 4),
        "max_dv_ms": 30.0 + 5.0 * (index % 3),
        "min_perigee_km": min_perigee,
        "blackout_windows": [],
        "notes": f"{name} — demo constraint seed (HackMIT).",
    }


def run() -> int:
    """Write the locked ISS/Starlink seeds plus five live catalog satellites."""
    settings = get_settings()
    print("Scutaris constraint seeder")
    print(f"Config: {settings.describe()}")
    try:
        print(f"Connected to {cluster_banner()}")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot reach Elasticsearch: {type(exc).__name__}: {exc}")
        return 1

    skip = {doc["norad_id"] for doc in SEED}
    extras = _extra_satellites(5, skip)
    print(f"Locked seeds: {', '.join(sorted(skip))}")
    print(f"Extra catalog satellites: {len(extras)}")
    for sat in extras:
        print(f"  {sat.get('norad_id')} {sat.get('name')}")

    docs = list(SEED)
    for index, sat in enumerate(extras):
        docs.append(_constraint_for(sat, index))

    indexed = bulk_index(INDEX_CONSTRAINTS, docs, id_field="norad_id")
    total = count_docs(INDEX_CONSTRAINTS)
    print(f"\nIndexed {indexed} docs")
    print(f"  {INDEX_CONSTRAINTS}: {total} docs")
    return 0 if indexed > 0 else 1


def main() -> int:
    """Entry point for `python scripts/seed_constraints.py`."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    return run()


if __name__ == "__main__":
    sys.exit(main())
