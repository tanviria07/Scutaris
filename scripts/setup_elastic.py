"""Create the four Scutaris Elasticsearch indices (FIX 2 in the battle plan).

Usage:
    python scripts/setup_elastic.py            # create anything missing
    python scripts/setup_elastic.py --recreate # delete + recreate (destructive)
    python scripts/setup_elastic.py --dry-run  # print mappings, touch nothing
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any

import _bootstrap  # noqa: F401  (adds the project root to sys.path)

from backend.config import (
    INDEX_CONJUNCTIONS,
    INDEX_CONSTRAINTS,
    INDEX_DEBRIS,
    INDEX_SATELLITES,
    JINA_DIMS,
    get_settings,
)
from backend.es_client import cluster_banner, count_docs, get_es_client

logger = logging.getLogger("scutaris.setup_elastic")

#: Shared orbital-state fields carried by both satellites and debris.
_ORBITAL_FIELDS: dict[str, Any] = {
    "norad_id": {"type": "keyword"},
    "name": {
        "type": "text",
        "fields": {"keyword": {"type": "keyword", "ignore_above": 256}},
    },
    "orbit_class": {"type": "keyword"},
    "altitude_km": {"type": "float"},
    "inclination_deg": {"type": "float"},
    "tle_line1": {"type": "keyword", "index": False},
    "tle_line2": {"type": "keyword", "index": False},
    "epoch_utc": {"type": "date"},
    "lat": {"type": "float"},
    "lon": {"type": "float"},
    "alt_km_now": {"type": "float"},
    "text_blob": {"type": "text"},
}


def _dense_vector(dims: int) -> dict[str, Any]:
    """Return a cosine dense_vector mapping of `dims` dimensions."""
    return {
        "type": "dense_vector",
        "dims": dims,
        "index": True,
        "similarity": "cosine",
    }


def build_mappings(dims: int) -> dict[str, dict[str, Any]]:
    """Build the index -> mapping table for the configured embedding dimensions."""
    satellites = {
        "properties": {**_ORBITAL_FIELDS, "embedding": _dense_vector(dims)}
    }
    debris = {
        "properties": {
            **_ORBITAL_FIELDS,
            "parent_object": {"type": "keyword"},
            "rcs_m2": {"type": "float", "null_value": None},
            "group": {"type": "keyword"},
            "embedding": _dense_vector(dims),
        }
    }
    conjunctions = {
        "properties": {
            "primary_norad": {"type": "keyword"},
            "secondary_norad": {"type": "keyword"},
            "tca_utc": {"type": "date"},
            "miss_km": {"type": "float"},
            "pc": {"type": "float"},
            "risk_level": {"type": "keyword"},
            "text_blob": {"type": "text"},
            "embedding": _dense_vector(dims),
        }
    }
    constraints = {
        "properties": {
            "norad_id": {"type": "keyword"},
            "fuel_kg": {"type": "float"},
            "max_dv_ms": {"type": "float"},
            "min_perigee_km": {"type": "float"},
            "blackout_windows": {
                "type": "nested",
                "properties": {
                    "start_utc": {"type": "date"},
                    "end_utc": {"type": "date"},
                    "reason": {"type": "keyword"},
                },
            },
            "notes": {"type": "text"},
        }
    }
    return {
        INDEX_SATELLITES: satellites,
        INDEX_DEBRIS: debris,
        INDEX_CONJUNCTIONS: conjunctions,
        INDEX_CONSTRAINTS: constraints,
    }


def create_index(name: str, mapping: dict[str, Any], recreate: bool) -> str:
    """Create one index; returns `created`, `recreated`, or `exists`."""
    client = get_es_client()
    exists = client.indices.exists(index=name)
    if exists and not recreate:
        return "exists"
    if exists:
        client.indices.delete(index=name)
    client.indices.create(
        index=name,
        mappings=mapping,
        settings={"number_of_shards": 1, "number_of_replicas": 0},
    )
    return "recreated" if exists else "created"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments for the setup script."""
    parser = argparse.ArgumentParser(description="Create the Scutaris ES indices")
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="delete and recreate existing indices (destroys data)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="print mappings without contacting ES"
    )
    parser.add_argument(
        "--dims",
        type=int,
        default=None,
        help="override embedding dimensions (defaults to EMBED_DIMS)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Entry point: create/recreate the four indices and report their counts."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    settings = get_settings()
    dims = args.dims or settings.embed_dims
    mappings = build_mappings(dims)

    print(f"Scutaris index setup — dense_vector dims={dims} (cosine)")
    print(f"Config: {settings.describe()}")
    if dims == JINA_DIMS and not settings.has_jina:
        print(
            "  WARNING: JINA_API_KEY is not set, so ingest will use MiniLM (384-dim) "
            "and zero-pad vectors to 1024. Set EMBED_DIMS=384 for a tighter index."
        )

    if args.dry_run:
        print(json.dumps(mappings, indent=2))
        return 0

    try:
        print(f"Connected to {cluster_banner()}")
    except Exception as exc:  # noqa: BLE001 - surface a readable CLI error
        print(f"ERROR: cannot reach Elasticsearch: {type(exc).__name__}: {exc}")
        print("Check ELASTIC_CLOUD_ID / ELASTIC_API_KEY (or ELASTIC_URL) in .env")
        return 1

    for name, mapping in mappings.items():
        try:
            status = create_index(name, mapping, args.recreate)
        except Exception as exc:  # noqa: BLE001
            print(f"  {name}: FAILED ({type(exc).__name__}: {exc})")
            return 1
        print(f"  {name}: {status} (docs={count_docs(name)})")

    print("Done. Next: python scripts/ingest_tles.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
