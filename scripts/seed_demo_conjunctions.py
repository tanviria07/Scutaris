"""Seed historically grounded ISS conjunctions for the golden-query demo.

Usage:
    python scripts/seed_demo_conjunctions.py

Does not delete existing `scutaris-conjunctions` documents. Re-runs overwrite
the ten demo ids (`demo_iss_<norad>_<nn>`).
"""

from __future__ import annotations

# DEMO SEED DATA
# These are historical event replays, not live conjunctions. Real ISS close
# approaches from documented CDM history, used to demonstrate the golden
# query flow. Values are illustrative; real-time Pc requires SGP4 + chan
# B-plane integration on live TLEs. Do not present these as live telemetry.

import asyncio
import logging
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

import _bootstrap  # noqa: F401  (adds the project root to sys.path)

from backend.config import INDEX_CONJUNCTIONS, get_settings
from backend.embeddings import embed_text
from backend.es_client import bulk_index_async, cluster_banner, count_docs

logger = logging.getLogger("scutaris.seed_demo_conjunctions")

ISS_NORAD = "25544"
HORIZON_HOURS = 48

# MVP HEURISTIC: documented-style ISS near-misses, not live CDMs. Miss/Pc
# values are illustrative replay numbers for the golden query demo.
CONJUNCTIONS: list[tuple[str, str, float, float, str, str]] = [
    ("33775", "COSMOS 2251 DEB", 0.4, 1.2e-3, "critical", "historical event replay"),
    ("33775", "COSMOS 2251 DEB", 0.8, 4.1e-4, "critical", "historical event replay"),
    ("30181", "FENGYUN 1C DEB", 1.2, 2.0e-4, "critical", "historical event replay"),
    ("30181", "FENGYUN 1C DEB", 2.1, 8.0e-5, "high", "historical event replay"),
    ("30181", "FENGYUN 1C DEB", 4.5, 1.5e-5, "high", "historical event replay"),
    ("34427", "COSMOS 2251 DEB", 6.8, 5.0e-6, "high", "historical event replay"),
    ("34427", "COSMOS 2251 DEB", 12.4, 1.2e-6, "medium", "historical event replay"),
    ("33591", "IRIDIUM 33 DEB", 18.2, 3.0e-7, "medium", "historical event replay"),
    ("33591", "IRIDIUM 33 DEB", 27.5, 5.0e-8, "medium", "historical event replay"),
    ("40074", "SJ-11 DEB", 35.8, 2.0e-8, "medium", "historical event replay"),
]


def _tca_utc(index: int, n: int, started: datetime) -> str:
    """Spread TCA timestamps evenly across the next 48 hours."""
    if n <= 1:
        return started.isoformat()
    offset = HORIZON_HOURS * index / (n - 1)
    return (started + timedelta(hours=offset)).isoformat()


async def build_docs() -> list[dict[str, Any]]:
    """Turn the seed table into indexed conjunction documents with embeddings."""
    started = datetime.now(timezone.utc)
    n = len(CONJUNCTIONS)
    docs: list[dict[str, Any]] = []
    for index, (secondary_norad, secondary_name, miss_km, pc, risk_level, note) in enumerate(
        CONJUNCTIONS
    ):
        text_blob = (
            f"ISS conjunction with {secondary_name} (NORAD {secondary_norad}), "
            f"miss {miss_km} km, risk {risk_level}, historical event replay"
        )
        # MVP HEURISTIC: one passage embedding per seed row; not a live TLE vector.
        embedding = await embed_text(text_blob)
        docs.append(
            {
                "doc_id": f"demo_iss_{secondary_norad}_{index:02d}",
                "primary_norad": ISS_NORAD,
                "secondary_norad": secondary_norad,
                "tca_utc": _tca_utc(index, n, started),
                "miss_km": miss_km,
                "pc": pc,
                "risk_level": risk_level,
                "text_blob": text_blob,
                "embedding": embedding,
                "note": note,
            }
        )
        print(
            f"  [{index + 1}/{n}] demo_iss_{secondary_norad}_{index:02d} "
            f"miss={miss_km} km {risk_level}"
        )
    return docs


async def run() -> int:
    """Embed the ten ISS demo pairs and bulk-index them without wiping the index."""
    settings = get_settings()
    print("Scutaris demo ISS conjunction seeder")
    print(f"Config: {settings.describe()}")
    try:
        print(f"Connected to {cluster_banner()}")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot reach Elasticsearch: {type(exc).__name__}: {exc}")
        return 1

    before = count_docs(INDEX_CONJUNCTIONS)
    print(f"  {INDEX_CONJUNCTIONS} before: {before} docs")
    print(f"Embedding and indexing {len(CONJUNCTIONS)} demo ISS pairs...")
    docs = await build_docs()
    indexed = await bulk_index_async(INDEX_CONJUNCTIONS, docs, id_field="doc_id")
    after = count_docs(INDEX_CONJUNCTIONS)
    print(f"\nIndexed {indexed} demo docs")
    print(f"  {INDEX_CONJUNCTIONS}: {after} docs (was {before})")
    return 0 if indexed == len(CONJUNCTIONS) else 1


def main() -> int:
    """Entry point for `python scripts/seed_demo_conjunctions.py`."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    return asyncio.run(run())


if __name__ == "__main__":
    sys.exit(main())
