"""Ingest CelesTrak groups into Elasticsearch.

Defaults (Part 1 of the battle plan):
    stations            -> scutaris-satellites   (includes ISS, NORAD 25544)
    cosmos-2251-debris  -> scutaris-debris

Usage:
    python scripts/ingest_tles.py
    python scripts/ingest_tles.py --limit 200
    python scripts/ingest_tles.py --satellites-only
    python scripts/ingest_tles.py --group active --index scutaris-satellites
    python scripts/ingest_tles.py --group active --index scutaris-satellites --clear --limit 3000
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

import _bootstrap  # noqa: F401  (adds the project root to sys.path)

from backend.config import INDEX_DEBRIS, INDEX_SATELLITES, get_settings
from backend.es_client import cluster_banner, count_docs, get_es_client
from backend.ingest import ingest_group

logger = logging.getLogger("scutaris.ingest_tles")

ISS_NORAD = "25544"


def _clear_index(index: str) -> int:
    """Delete every document in `index`. Does not drop the index mapping."""
    client = get_es_client()
    if not client.indices.exists(index=index):
        print(f"  {index}: does not exist yet, nothing to clear")
        return 0
    result = client.delete_by_query(
        index=index,
        query={"match_all": {}},
        refresh=True,
        conflicts="proceed",
    )
    deleted = int(result.get("deleted", 0))
    print(f"  {index}: deleted {deleted} docs")
    return deleted


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments for the ingest runner."""
    parser = argparse.ArgumentParser(description="Ingest CelesTrak data into Scutaris")
    parser.add_argument(
        "--group",
        action="append",
        default=None,
        help="CelesTrak group to ingest (repeatable; pairs with --index)",
    )
    parser.add_argument(
        "--index",
        action="append",
        default=None,
        help="target index for the matching --group (repeatable)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5000,
        help="max objects per group (default 5000)",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="delete all documents from each target index before ingesting",
    )
    parser.add_argument(
        "--satellites-only", action="store_true", help="skip the debris group"
    )
    parser.add_argument(
        "--debris-only", action="store_true", help="skip the satellites group"
    )
    parser.add_argument(
        "--no-snapshots",
        action="store_true",
        help="do not write data/raw and data/normalized JSON snapshots",
    )
    return parser.parse_args(argv)


def resolve_jobs(args: argparse.Namespace) -> list[tuple[str, str]]:
    """Resolve the (group, index) jobs to run from CLI arguments and defaults."""
    if args.group:
        indices = args.index or []
        if len(indices) not in (0, len(args.group)):
            raise SystemExit("--index must be supplied once per --group (or not at all)")
        jobs: list[tuple[str, str]] = []
        for position, group in enumerate(args.group):
            if indices:
                target = indices[position]
            else:
                target = INDEX_DEBRIS if "debris" in group.lower() else INDEX_SATELLITES
            jobs.append((group, target))
        return jobs

    settings = get_settings()
    jobs = [
        (settings.default_satellite_group, INDEX_SATELLITES),
        (settings.default_debris_group, INDEX_DEBRIS),
    ]
    if args.satellites_only:
        return jobs[:1]
    if args.debris_only:
        return jobs[1:]
    return jobs


def _check_iss() -> None:
    """Report whether the ISS document landed in `scutaris-satellites`."""
    client = get_es_client()
    try:
        found = client.exists(index=INDEX_SATELLITES, id=ISS_NORAD)
    except Exception as exc:  # noqa: BLE001
        print(f"  ISS check skipped ({type(exc).__name__})")
        return
    print(f"  ISS (NORAD {ISS_NORAD}) present: {bool(found)}")


async def run(args: argparse.Namespace) -> int:
    """Execute every resolved ingest job and print a per-index summary."""
    settings = get_settings()
    jobs = resolve_jobs(args)

    print("Scutaris CelesTrak ingest")
    print(f"Config: {settings.describe()}")
    try:
        print(f"Connected to {cluster_banner()}")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot reach Elasticsearch: {type(exc).__name__}: {exc}")
        print("Run `python scripts/setup_elastic.py` first and check your .env")
        return 1

    if args.clear:
        seen: set[str] = set()
        print("Clearing target indices (--clear)")
        for _, target_index in jobs:
            if target_index in seen:
                continue
            seen.add(target_index)
            try:
                _clear_index(target_index)
            except Exception as exc:  # noqa: BLE001
                print(f"  [{target_index}] clear FAILED: {type(exc).__name__}: {exc}")

    results = []
    for group, target_index in jobs:
        try:
            stats = await ingest_group(
                group,
                target_index,
                limit=args.limit,
                save_snapshots=not args.no_snapshots,
                progress=lambda message: print(f"  {message}"),
            )
        except Exception as exc:  # noqa: BLE001 - one bad group shouldn't kill the run
            print(f"  [{group}] FAILED: {type(exc).__name__}: {exc}")
            results.append({"group": group, "index": target_index, "indexed": 0})
            continue
        results.append(stats)

    print("\nSummary")
    for stats in results:
        print(
            f"  {stats['group']:<22} -> {stats['index']:<22} "
            f"indexed={stats.get('indexed', 0)} "
            f"with_tle={stats.get('with_tle', 0)} "
            f"elapsed={stats.get('elapsed_s', 0)}s"
        )

    print("\nIndex counts")
    for index in sorted({stats["index"] for stats in results}):
        print(f"  {index}: {count_docs(index)} docs")
    if any(stats["index"] == INDEX_SATELLITES for stats in results):
        _check_iss()

    return 0 if all(stats.get("indexed", 0) > 0 for stats in results) else 1


def main(argv: list[str] | None = None) -> int:
    """Entry point for `python scripts/ingest_tles.py`."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    args = parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())
