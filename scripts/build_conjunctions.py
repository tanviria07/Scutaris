"""Build approximate satellite–debris conjunctions and index them.

Reads every document in `scutaris-satellites` and `scutaris-debris`, screens
pairs by altitude, then writes close encounters into `scutaris-conjunctions`
with FIX 6 `risk_level` labels.

Usage:
    python scripts/build_conjunctions.py
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import math
import sys
import time
from datetime import datetime, timezone
from typing import Any, Mapping

import _bootstrap  # noqa: F401  (adds the project root to sys.path)

from elasticsearch import helpers as es_helpers

from backend.config import INDEX_CONJUNCTIONS, INDEX_DEBRIS, INDEX_SATELLITES, get_settings
from backend.embeddings import active_provider, embed_batch
from backend.es_client import cluster_banner, count_docs, get_es_client
from backend.ingest import EARTH_RADIUS_KM
from contracts.schemas import classify_risk

logger = logging.getLogger("scutaris.build_conjunctions")

PRIMARY_ALT_KM = 100.0
PRIMARY_MISS_KM = 40.0
FALLBACK_ALT_KM = 200.0
FALLBACK_MISS_KM = 100.0
NEAREST_PER_SAT = 20
DEFAULT_INDEX_CAP = 5000
SOURCE_FIELDS = (
    "norad_id",
    "name",
    "lat",
    "lon",
    "alt_km_now",
    "altitude_km",
    "orbit_class",
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments for the conjunction builder."""
    parser = argparse.ArgumentParser(description="Build Scutaris conjunctions from ES catalogs")
    parser.add_argument(
        "--max-index",
        type=int,
        default=DEFAULT_INDEX_CAP,
        help=f"cap on indexed pairs (default {DEFAULT_INDEX_CAP})",
    )
    return parser.parse_args(argv)


def _as_float(value: Any) -> float | None:
    """Parse a numeric field, returning None when missing or unusable."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _altitude_km(doc: Mapping[str, Any]) -> float | None:
    """Prefer live altitude, fall back to mean orbital altitude."""
    live = _as_float(doc.get("alt_km_now"))
    if live is not None:
        return live
    return _as_float(doc.get("altitude_km"))


def angular_separation_deg(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Great-circle angular separation in degrees between two geodetic points."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    hav = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    return math.degrees(2.0 * math.asin(min(1.0, math.sqrt(hav))))


def great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Surface great-circle distance in km."""
    return EARTH_RADIUS_KM * math.radians(angular_separation_deg(lat1, lon1, lat2, lon2))


def approximate_miss_km(primary: Mapping[str, Any], secondary: Mapping[str, Any]) -> float:
    """Approximate 3D miss distance from a single catalog snapshot.

    # MVP HEURISTIC: snapshot-based miss distance, not real TCA propagation.
    miss_km = sqrt(alt_diff_km^2 + great_circle_km^2). Current epoch is stored
    as tca_utc; this is not an SGP4 closest-approach screen.
    """
    lat1 = _as_float(primary["lat"])
    lon1 = _as_float(primary["lon"])
    alt1 = _altitude_km(primary)
    lat2 = _as_float(secondary["lat"])
    lon2 = _as_float(secondary["lon"])
    alt2 = _altitude_km(secondary)
    assert lat1 is not None and lon1 is not None and alt1 is not None
    assert lat2 is not None and lon2 is not None and alt2 is not None
    alt_diff_km = abs(alt1 - alt2)
    gc_km = great_circle_km(lat1, lon1, lat2, lon2)
    return math.sqrt(alt_diff_km**2 + gc_km**2)


def heuristic_pc(miss_km: float) -> float:
    """Collision probability stand-in from miss distance.

    # MVP HEURISTIC: heuristic Pc = exp(-miss_km / 5). Not a covariance-based
    # probability of collision.
    """
    return math.exp(-miss_km / 5.0)


def _usable(doc: Mapping[str, Any]) -> bool:
    """True when a catalog doc has the fields the geometry screen needs."""
    return (
        bool(doc.get("norad_id"))
        and _as_float(doc.get("lat")) is not None
        and _as_float(doc.get("lon")) is not None
        and _altitude_km(doc) is not None
    )


def load_catalog(index: str) -> list[dict[str, Any]]:
    """Scroll every document in `index`, dropping unusable rows."""
    client = get_es_client()
    docs: list[dict[str, Any]] = []
    for hit in es_helpers.scan(
        client,
        index=index,
        query={"query": {"match_all": {}}},
        _source=list(SOURCE_FIELDS),
        size=500,
    ):
        src = hit.get("_source") or {}
        if _usable(src):
            docs.append(src)
    return docs


def _pair_doc(
    sat: Mapping[str, Any],
    deb: Mapping[str, Any],
    miss_km: float,
    tca_utc: str,
) -> dict[str, Any]:
    """Build one conjunction document (no embedding yet)."""
    pc = heuristic_pc(miss_km)
    risk_level = classify_risk(miss_km, pc)
    primary_norad = str(sat["norad_id"])
    secondary_norad = str(deb["norad_id"])
    primary_name = str(sat.get("name") or f"NORAD {primary_norad}")
    secondary_name = str(deb.get("name") or f"NORAD {secondary_norad}")
    return {
        "primary_norad": primary_norad,
        "secondary_norad": secondary_norad,
        "tca_utc": tca_utc,
        "miss_km": round(miss_km, 4),
        "pc": float(pc),
        "risk_level": risk_level,
        "text_blob": (
            f"Conjunction {primary_name} (NORAD {primary_norad}) vs "
            f"{secondary_name} (NORAD {secondary_norad}). "
            f"TCA {tca_utc}. Miss {miss_km:.3f} km. "
            f"Pc {pc:.6e}. Risk {risk_level}."
        ),
    }


def _dedupe(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep one row per (primary_norad, secondary_norad), preferring smaller miss."""
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for doc in docs:
        key = (doc["primary_norad"], doc["secondary_norad"])
        existing = best.get(key)
        if existing is None or doc["miss_km"] < existing["miss_km"]:
            best[key] = doc
    return list(best.values())


def screen_pairs(
    satellites: list[dict[str, Any]],
    debris: list[dict[str, Any]],
    *,
    alt_max_km: float,
    miss_max_km: float,
) -> list[dict[str, Any]]:
    """Compare every satellite to every debris object and keep close pairs.

    No angular pre-filter. Pairs with the same NORAD on both sides are skipped.
    """
    # MVP HEURISTIC: using current epoch as tca_utc.
    tca_utc = datetime.now(timezone.utc).isoformat()
    candidates: list[dict[str, Any]] = []
    compared = 0
    alt_pass = 0

    for sat in satellites:
        sat_alt = _altitude_km(sat)
        sat_norad = str(sat["norad_id"])
        assert sat_alt is not None
        for deb in debris:
            compared += 1
            if str(deb["norad_id"]) == sat_norad:
                continue
            deb_alt = _altitude_km(deb)
            assert deb_alt is not None
            if abs(sat_alt - deb_alt) >= alt_max_km:
                continue
            alt_pass += 1
            miss_km = approximate_miss_km(sat, deb)
            if miss_km >= miss_max_km:
                continue
            candidates.append(_pair_doc(sat, deb, miss_km, tca_utc))

    unique = _dedupe(candidates)
    print(
        f"  compared={compared} d_alt<{alt_max_km:g}={alt_pass} "
        f"miss_km<{miss_max_km:g}={len(candidates)} unique_pairs={len(unique)}"
    )
    return unique


def nearest_debris_fallback(
    satellites: list[dict[str, Any]],
    debris: list[dict[str, Any]],
    k: int = NEAREST_PER_SAT,
) -> list[dict[str, Any]]:
    """Force-index the k nearest debris objects per satellite by lat/lon distance.

    # MVP HEURISTIC: snapshot-based miss distance, not real TCA propagation.
    Used only when altitude/miss screens return zero pairs.
    """
    tca_utc = datetime.now(timezone.utc).isoformat()
    candidates: list[dict[str, Any]] = []
    for sat in satellites:
        sat_norad = str(sat["norad_id"])
        sat_lat = float(sat["lat"])
        sat_lon = float(sat["lon"])
        ranked: list[tuple[float, dict[str, Any]]] = []
        for deb in debris:
            if str(deb["norad_id"]) == sat_norad:
                continue
            gc_km = great_circle_km(sat_lat, sat_lon, float(deb["lat"]), float(deb["lon"]))
            ranked.append((gc_km, deb))
        ranked.sort(key=lambda item: item[0])
        for _, deb in ranked[:k]:
            miss_km = approximate_miss_km(sat, deb)
            candidates.append(_pair_doc(sat, deb, miss_km, tca_utc))
    unique = _dedupe(candidates)
    print(f"  nearest-{k}-per-sat unique_pairs={len(unique)}")
    return unique


MIN_DEMO_PAIRS = 500


def select_pairs(
    satellites: list[dict[str, Any]], debris: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], str]:
    """Try the primary screen, then looser thresholds, then a nearest-k fallback.

    A handful of snapshot pairs is not demo-able (target 500–5000), so any
    screen that returns fewer than MIN_DEMO_PAIRS continues down the ladder.
    """
    labels: list[str] = []
    docs: list[dict[str, Any]] = []

    print(f"Screening pairs (d_alt < {PRIMARY_ALT_KM:g} km, miss < {PRIMARY_MISS_KM:g} km)...")
    docs = screen_pairs(
        satellites, debris, alt_max_km=PRIMARY_ALT_KM, miss_max_km=PRIMARY_MISS_KM
    )
    labels.append(f"d_alt<{PRIMARY_ALT_KM:g} miss<{PRIMARY_MISS_KM:g}")
    if len(docs) >= MIN_DEMO_PAIRS:
        return docs, labels[-1]

    print(
        f"Only {len(docs)} pairs; loosening to d_alt < {FALLBACK_ALT_KM:g} km, "
        f"miss < {FALLBACK_MISS_KM:g} km..."
    )
    extra = screen_pairs(
        satellites, debris, alt_max_km=FALLBACK_ALT_KM, miss_max_km=FALLBACK_MISS_KM
    )
    docs = _dedupe(docs + extra)
    labels.append(f"d_alt<{FALLBACK_ALT_KM:g} miss<{FALLBACK_MISS_KM:g}")
    if len(docs) >= MIN_DEMO_PAIRS:
        return docs, "+".join(labels)

    print(
        f"Only {len(docs)} pairs; falling back to {NEAREST_PER_SAT} closest "
        "debris per satellite..."
    )
    extra = nearest_debris_fallback(satellites, debris, k=NEAREST_PER_SAT)
    docs = _dedupe(docs + extra)
    labels.append(f"nearest-{NEAREST_PER_SAT}-per-sat")
    return docs, "+".join(labels)


def _chunks(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    """Split `items` into consecutive batches of at most `size`."""
    return [items[start : start + size] for start in range(0, len(items), size)]


async def embed_docs(docs: list[dict[str, Any]], progress=print) -> None:
    """Attach dense vectors to each conjunction document in batches."""
    settings = get_settings()
    if not docs:
        return
    progress(f"embedding {len(docs)} conjunctions via {active_provider()}...")
    embedded = 0
    for batch in _chunks(docs, settings.embed_batch_size):
        vectors = await embed_batch([doc["text_blob"] for doc in batch])
        for doc, vector in zip(batch, vectors, strict=True):
            doc["embedding"] = vector
        embedded += len(batch)
        progress(f"embedded {embedded}/{len(docs)}")


def bulk_conjunctions(docs: list[dict[str, Any]]) -> int:
    """Bulk-index conjunctions keyed by primary-secondary NORAD pair."""
    if not docs:
        return 0
    actions = [
        {
            "_index": INDEX_CONJUNCTIONS,
            "_id": f"{doc['primary_norad']}-{doc['secondary_norad']}",
            "_source": doc,
        }
        for doc in docs
    ]
    success, errors = es_helpers.bulk(
        get_es_client(), actions, raise_on_error=False, stats_only=False
    )
    for error in list(errors)[:3]:
        logger.error("Bulk index error: %s", error)
    return int(success)


def risk_distribution() -> dict[str, int]:
    """Terms aggregation of `risk_level` on the conjunctions index."""
    client = get_es_client()
    client.indices.refresh(index=INDEX_CONJUNCTIONS)
    result = client.search(
        index=INDEX_CONJUNCTIONS,
        size=0,
        aggregations={"by_risk": {"terms": {"field": "risk_level", "size": 10}}},
    )
    buckets = result.get("aggregations", {}).get("by_risk", {}).get("buckets", [])
    return {str(bucket["key"]): int(bucket["doc_count"]) for bucket in buckets}


async def run(args: argparse.Namespace) -> int:
    """Load catalogs, screen pairs, embed, and bulk-index conjunctions."""
    settings = get_settings()
    print("Scutaris conjunction builder")
    print(f"Config: {settings.describe()}")
    try:
        print(f"Connected to {cluster_banner()}")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot reach Elasticsearch: {type(exc).__name__}: {exc}")
        return 1

    started = time.perf_counter()
    print(f"Loading {INDEX_SATELLITES}...")
    satellites = load_catalog(INDEX_SATELLITES)
    print(f"  {len(satellites)} usable satellites")
    print(f"Loading {INDEX_DEBRIS}...")
    debris = load_catalog(INDEX_DEBRIS)
    print(f"  {len(debris)} usable debris")
    if not satellites or not debris:
        print("ERROR: need at least one satellite and one debris object")
        return 1

    docs, threshold_used = select_pairs(satellites, debris)
    print(f"  threshold_used={threshold_used}")
    docs.sort(key=lambda row: (row["miss_km"], row["primary_norad"], row["secondary_norad"]))
    if args.max_index and len(docs) > args.max_index:
        print(f"  capping {len(docs)} -> {args.max_index} closest pairs")
        docs = docs[: args.max_index]
    if not docs:
        print("ERROR: no conjunctions produced at any threshold")
        return 1

    await embed_docs(docs, progress=lambda message: print(f"  {message}"))

    print(f"Indexing into {INDEX_CONJUNCTIONS}...")
    indexed = 0
    for batch in _chunks(docs, 500):
        indexed += bulk_conjunctions(batch)
        print(f"  indexed {indexed}/{len(docs)}")

    elapsed = round(time.perf_counter() - started, 2)
    total = count_docs(INDEX_CONJUNCTIONS)
    dist = risk_distribution()
    print(f"\nDone in {elapsed}s")
    print(f"  threshold_used={threshold_used}")
    print(f"  {INDEX_CONJUNCTIONS}: {total} docs")
    print(
        "  risk_level: "
        f"critical={dist.get('critical', 0)} "
        f"high={dist.get('high', 0)} "
        f"medium={dist.get('medium', 0)} "
        f"low={dist.get('low', 0)}"
    )
    return 0 if indexed > 0 else 1


def main(argv: list[str] | None = None) -> int:
    """Entry point for `python scripts/build_conjunctions.py`."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
