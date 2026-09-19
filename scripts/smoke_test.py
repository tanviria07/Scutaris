"""Part 1 smoke test.

Offline by default: exercises the orbital math, GP normalization, text blobs,
filter building and the ES|QL allowlist without any network access.
`--live` additionally hits CelesTrak, the embedding provider and Elasticsearch.

Usage:
    python scripts/smoke_test.py
    python scripts/smoke_test.py --live
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

import _bootstrap  # noqa: F401  (adds the project root to sys.path)

from backend.ingest import (
    build_text_blob,
    classify_orbit,
    derive_parent_object,
    gmst_deg,
    normalize_gp_to_doc,
    semi_major_axis_km,
)

# A real ISS GP record shape (values frozen so the test is deterministic).
ISS_GP = {
    "OBJECT_NAME": "ISS (ZARYA)",
    "OBJECT_ID": "1998-067A",
    "EPOCH": "2026-09-19T05:32:41.123456",
    "MEAN_MOTION": 15.50103472,
    "ECCENTRICITY": 0.0004364,
    "INCLINATION": 51.6416,
    "RA_OF_ASC_NODE": 247.4627,
    "ARG_OF_PERICENTER": 130.5360,
    "MEAN_ANOMALY": 325.0288,
    "NORAD_CAT_ID": 25544,
    "BSTAR": 0.0001,
}

DEBRIS_GP = {
    "OBJECT_NAME": "COSMOS 2251 DEB",
    "OBJECT_ID": "1993-036SX",
    "EPOCH": "2026-09-18T22:10:00.000000",
    "MEAN_MOTION": 14.2,
    "ECCENTRICITY": 0.012,
    "INCLINATION": 74.03,
    "RA_OF_ASC_NODE": 12.5,
    "ARG_OF_PERICENTER": 88.1,
    "MEAN_ANOMALY": 271.9,
    "NORAD_CAT_ID": 34427,
}

NOW = datetime(2026, 9, 19, 12, 0, 0, tzinfo=timezone.utc)

_failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    """Record and print one assertion result."""
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}{f' — {detail}' if detail else ''}")
    if not condition:
        _failures.append(label)


def test_orbital_math() -> None:
    """Semi-major axis, orbit classification and GMST sanity checks."""
    print("Orbital math")
    axis = semi_major_axis_km(15.50103472)
    check("ISS semi-major axis ~6796 km", 6750 < axis < 6850, f"{axis:.1f} km")
    geo_axis = semi_major_axis_km(1.0027)
    check("GEO semi-major axis ~42164 km", 42000 < geo_axis < 42300, f"{geo_axis:.1f} km")
    check("LEO classification", classify_orbit(420.0, 0.0004) == "LEO")
    check("GEO classification", classify_orbit(35786.0, 0.0002) == "GEO")
    check("MEO classification", classify_orbit(20200.0, 0.001) == "MEO")
    check("HEO by eccentricity", classify_orbit(1200.0, 0.72) == "HEO")
    gmst = gmst_deg(datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc))
    check("GMST at J2000 ~280.46 deg", abs(gmst - 280.46) < 0.1, f"{gmst:.3f}")


def test_normalization() -> None:
    """GP -> document conversion for a satellite and a debris fragment."""
    print("Normalization")
    sat = normalize_gp_to_doc(ISS_GP, ("1 25544U ...", "2 25544  51.6416 ..."), now=NOW)
    check("norad_id is a string", sat["norad_id"] == "25544", sat["norad_id"])
    check("orbit_class LEO", sat["orbit_class"] == "LEO")
    check("altitude ~400-430 km", 380 < sat["altitude_km"] < 440, f"{sat['altitude_km']}")
    check("|lat| <= inclination", abs(sat["lat"]) <= 51.65, f"{sat['lat']}")
    check("lon in [-180,180)", -180 <= sat["lon"] < 180, f"{sat['lon']}")
    check("alt_km_now plausible", 350 < sat["alt_km_now"] < 470, f"{sat['alt_km_now']}")
    check("epoch is ISO UTC", sat["epoch_utc"].endswith("+00:00"), sat["epoch_utc"])
    check("tle lines stored", bool(sat["tle_line1"] and sat["tle_line2"]))
    check("no debris fields on satellite", "parent_object" not in sat)
    check("text_blob mentions ISS", "ISS" in sat["text_blob"])

    deb = normalize_gp_to_doc(DEBRIS_GP, None, group="cosmos-2251-debris", is_debris=True, now=NOW)
    check("parent object derived", deb["parent_object"] == "COSMOS 2251", str(deb["parent_object"]))
    check("group recorded", deb["group"] == "cosmos-2251-debris")
    check("rcs_m2 nullable", deb["rcs_m2"] is None)
    check("debris blob has group", "cosmos-2251-debris" in deb["text_blob"])
    check(
        "parent fallback from group",
        derive_parent_object("UNKNOWN FRAGMENT", "cosmos-2251-debris") == "COSMOS 2251",
    )
    blob = build_text_blob({"name": "TEST", "orbit_class": "LEO", "norad_id": "1"})
    check("build_text_blob works standalone", "TEST" in blob and "LEO" in blob)


def test_esql_and_filters() -> None:
    """ES|QL allowlist and filter-clause construction (no cluster needed)."""
    print("ES|QL allowlist + filters")
    from backend.es_client import ESQLValidationError, build_filter_clauses, validate_esql

    ok = validate_esql('FROM scutaris-conjunctions | WHERE risk_level == "critical" | LIMIT 10')
    check("valid query accepted", ok.startswith("FROM scutaris-conjunctions"))

    multi = validate_esql("FROM scutaris-debris,scutaris-satellites | LIMIT 5")
    check("multi-index source accepted", multi.startswith("FROM scutaris-debris,"))
    dropped = validate_esql("FROM scutaris-satellites | DROP embedding | LIMIT 5")
    check("ES|QL DROP (column) still allowed", "DROP embedding" in dropped)

    bad_queries = (
        "FROM other-index | LIMIT 1",
        "SHOW INFO",
        "",
        "FROM scutaris-secret | LIMIT 1",
        "FROM scutaris-satellites-private | LIMIT 1",
        "FROM scutaris-satellites | LIMIT 1 ; DELETE everything",
    )
    for bad in bad_queries:
        try:
            validate_esql(bad)
        except ESQLValidationError:
            check(f"rejected {bad[:28]!r}", True)
        else:
            check(f"rejected {bad[:28]!r}", False, "was accepted")

    clauses = build_filter_clauses(
        {
            "orbit_class": ["LEO"],
            "risk_level": "critical",
            "altitude_km": {"gte": 300, "lte": 600},
            "indices": ["scutaris-debris"],
            "empty": None,
        }
    )
    kinds = [next(iter(clause)) for clause in clauses]
    check("terms + term + range built", kinds == ["terms", "term", "range"], str(kinds))
    check("reserved keys ignored", all("indices" not in str(clause) for clause in clauses))


async def test_live() -> None:
    """Optional end-to-end checks against CelesTrak, embeddings and Elasticsearch."""
    print("Live checks")
    from backend.embeddings import active_provider, embed_text
    from backend.es_client import cluster_banner, count_docs
    from backend.ingest import fetch_group, fetch_tle_by_norad

    try:
        records = await fetch_group("stations")
        check("CelesTrak stations group", len(records) > 0, f"{len(records)} records")
        has_iss = any(str(r.get("NORAD_CAT_ID")) == "25544" for r in records)
        check("ISS present in stations", has_iss)
    except Exception as exc:  # noqa: BLE001
        check("CelesTrak stations group", False, f"{type(exc).__name__}: {exc}")

    try:
        line1, line2 = await fetch_tle_by_norad(25544)
        check("ISS TLE fetched", line1.startswith("1 25544") and line2.startswith("2 25544"))
    except Exception as exc:  # noqa: BLE001
        check("ISS TLE fetched", False, f"{type(exc).__name__}: {exc}")

    try:
        vector = await embed_text("high-risk debris near the ISS")
        check(
            f"embedding via {active_provider()}",
            len(vector) > 0,
            f"{len(vector)} dims",
        )
    except Exception as exc:  # noqa: BLE001
        check("embedding", False, f"{type(exc).__name__}: {exc}")

    try:
        check("elasticsearch reachable", True, cluster_banner())
        for index in ("scutaris-satellites", "scutaris-debris"):
            print(f"       {index}: {count_docs(index)} docs")
    except Exception as exc:  # noqa: BLE001
        check("elasticsearch reachable", False, f"{type(exc).__name__}: {exc}")


def main(argv: list[str] | None = None) -> int:
    """Run the offline checks, plus live checks when `--live` is passed."""
    parser = argparse.ArgumentParser(description="Scutaris Part 1 smoke test")
    parser.add_argument("--live", action="store_true", help="also hit external services")
    args = parser.parse_args(argv)

    test_orbital_math()
    test_normalization()
    test_esql_and_filters()
    if args.live:
        asyncio.run(test_live())

    print()
    if _failures:
        print(f"{len(_failures)} check(s) failed: {', '.join(_failures)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
