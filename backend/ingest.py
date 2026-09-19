"""CelesTrak ingestion: GP (JSON) + TLE -> normalized docs -> embeddings -> Elasticsearch.

Decision A in the battle plan: pull bulk GP JSON per group and the matching TLE
lines, so downstream phases can run real SGP4 while the MVP renders positions
from a cheap circular-orbit approximation.

All HTTP traffic uses async `httpx`.
"""

from __future__ import annotations

import json
import logging
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

import httpx

from backend.config import PROJECT_ROOT, Settings, get_settings
from backend.embeddings import active_provider, embed_batch
from backend.es_client import bulk_index_async

logger = logging.getLogger(__name__)

# --- Physical constants (WGS-84 / standard gravitational parameter) ---
EARTH_RADIUS_KM: float = 6378.137
MU_EARTH_KM3_S2: float = 398600.4418
SECONDS_PER_DAY: float = 86400.0

#: Geostationary altitude band used for orbit classification.
GEO_ALT_KM: float = 35786.0
GEO_BAND_KM: float = 500.0

RAW_DIR: Path = PROJECT_ROOT / "data" / "raw"
NORMALIZED_DIR: Path = PROJECT_ROOT / "data" / "normalized"

ProgressFn = Callable[[str], None]


class IngestError(RuntimeError):
    """Raised when CelesTrak returns unusable data."""


# --------------------------------------------------------------------------
# CelesTrak fetching
# --------------------------------------------------------------------------


def _headers(settings: Settings) -> dict[str, str]:
    """Polite request headers (CelesTrak asks for an identifying user agent)."""
    return {"User-Agent": settings.user_agent, "Accept": "*/*"}


async def fetch_group(group: str) -> list[dict[str, Any]]:
    """Fetch one CelesTrak GP group as JSON.

    Calls `{CELESTRAK_BASE_URL}?GROUP={group}&FORMAT=JSON` and returns the raw
    GP records (one dict per object).
    """
    settings = get_settings()
    params = {"GROUP": group, "FORMAT": "JSON"}
    async with httpx.AsyncClient(
        timeout=settings.http_timeout, follow_redirects=True
    ) as client:
        response = await client.get(
            settings.celestrak_base_url, params=params, headers=_headers(settings)
        )
        response.raise_for_status()
        text = response.text.strip()

    if not text or text.lower().startswith("no gp data found"):
        raise IngestError(f"CelesTrak returned no GP data for group '{group}'")
    try:
        records = json.loads(text)
    except json.JSONDecodeError as exc:
        raise IngestError(
            f"CelesTrak group '{group}' did not return JSON (got: {text[:120]!r})"
        ) from exc
    if not isinstance(records, list):
        raise IngestError(f"Unexpected GP payload for group '{group}': {type(records)}")
    return records


def _parse_tle_text(text: str) -> dict[str, tuple[str, str]]:
    """Parse a 3-line-per-object TLE blob into `{norad_id: (line1, line2)}`."""
    tles: dict[str, tuple[str, str]] = {}
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if not line.startswith("1 ") or index + 1 >= len(lines):
            continue
        line2 = lines[index + 1]
        if not line2.startswith("2 "):
            continue
        norad = line[2:7].strip().lstrip("0") or "0"
        tles[norad] = (line, line2)
    return tles


async def fetch_group_tles(group: str) -> dict[str, tuple[str, str]]:
    """Fetch every TLE in a group in one request, keyed by NORAD id.

    Used by `ingest_group` so we do not issue one HTTP call per object.
    """
    settings = get_settings()
    params = {"GROUP": group, "FORMAT": "TLE"}
    async with httpx.AsyncClient(
        timeout=settings.http_timeout, follow_redirects=True
    ) as client:
        response = await client.get(
            settings.celestrak_base_url, params=params, headers=_headers(settings)
        )
        response.raise_for_status()
        return _parse_tle_text(response.text)


async def fetch_tle_by_norad(norad_id: int) -> tuple[str, str]:
    """Fetch the two TLE lines for a single NORAD catalog number."""
    settings = get_settings()
    params = {"CATNR": str(norad_id), "FORMAT": "TLE"}
    async with httpx.AsyncClient(
        timeout=settings.http_timeout, follow_redirects=True
    ) as client:
        response = await client.get(
            settings.celestrak_base_url, params=params, headers=_headers(settings)
        )
        response.raise_for_status()
        tles = _parse_tle_text(response.text)

    key = str(norad_id).lstrip("0") or "0"
    if key not in tles:
        raise IngestError(f"CelesTrak has no TLE for NORAD {norad_id}")
    return tles[key]


# --------------------------------------------------------------------------
# Orbital math (MVP circular-orbit approximation)
# --------------------------------------------------------------------------


def _as_float(value: Any, default: float = 0.0) -> float:
    """Coerce a GP field to float, tolerating strings and nulls."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_epoch(raw: Any) -> datetime:
    """Parse a CelesTrak `EPOCH` string into a timezone-aware UTC datetime."""
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    text = str(raw or "").strip().replace("Z", "+00:00")
    if not text:
        return datetime.now(timezone.utc)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return datetime.now(timezone.utc)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def semi_major_axis_km(mean_motion_rev_day: float) -> float:
    """Convert mean motion (rev/day) to semi-major axis in km via Kepler's third law."""
    if mean_motion_rev_day <= 0:
        return EARTH_RADIUS_KM
    n_rad_s = mean_motion_rev_day * 2.0 * math.pi / SECONDS_PER_DAY
    return (MU_EARTH_KM3_S2 / (n_rad_s**2)) ** (1.0 / 3.0)


def classify_orbit(mean_altitude_km: float, eccentricity: float) -> str:
    """Bucket an orbit into LEO / MEO / GEO / HEO from altitude and eccentricity."""
    if eccentricity > 0.25:
        return "HEO"
    if mean_altitude_km < 2000.0:
        return "LEO"
    if abs(mean_altitude_km - GEO_ALT_KM) <= GEO_BAND_KM:
        return "GEO"
    if mean_altitude_km < GEO_ALT_KM:
        return "MEO"
    return "HEO"


def gmst_deg(when: datetime) -> float:
    """Greenwich Mean Sidereal Time in degrees for a UTC datetime (IAU 1982)."""
    julian_day = when.timestamp() / SECONDS_PER_DAY + 2440587.5
    days_since_j2000 = julian_day - 2451545.0
    centuries = days_since_j2000 / 36525.0
    gmst = (
        280.46061837
        + 360.98564736629 * days_since_j2000
        + 0.000387933 * centuries**2
        - centuries**3 / 38710000.0
    )
    return gmst % 360.0


def _wrap_longitude(degrees: float) -> float:
    """Wrap a longitude into [-180, 180)."""
    return (degrees + 180.0) % 360.0 - 180.0


def propagate_circular(
    gp: Mapping[str, Any], when: datetime | None = None
) -> tuple[float, float, float]:
    """Approximate sub-satellite (lat, lon, altitude_km) at `when`.

    MVP heuristic, **not** SGP4: the mean anomaly is advanced linearly from the
    element epoch and the true anomaly is taken as the mean anomaly (exact for a
    circular orbit, degrading with eccentricity). Good enough to place markers
    on the globe; Phase 3+ swaps in real SGP4 from the stored TLE lines.
    """
    when = when or datetime.now(timezone.utc)
    epoch = parse_epoch(gp.get("EPOCH"))

    mean_motion = _as_float(gp.get("MEAN_MOTION"), 15.5)
    eccentricity = _as_float(gp.get("ECCENTRICITY"))
    inclination = math.radians(_as_float(gp.get("INCLINATION")))
    raan = math.radians(_as_float(gp.get("RA_OF_ASC_NODE")))
    arg_perigee = math.radians(_as_float(gp.get("ARG_OF_PERICENTER")))
    mean_anomaly = math.radians(_as_float(gp.get("MEAN_ANOMALY")))

    axis = semi_major_axis_km(mean_motion)
    n_rad_s = mean_motion * 2.0 * math.pi / SECONDS_PER_DAY
    elapsed_s = (when - epoch).total_seconds()

    anomaly = (mean_anomaly + n_rad_s * elapsed_s) % (2.0 * math.pi)
    argument_of_latitude = arg_perigee + anomaly

    latitude = math.asin(
        max(-1.0, min(1.0, math.sin(inclination) * math.sin(argument_of_latitude)))
    )
    right_ascension = raan + math.atan2(
        math.cos(inclination) * math.sin(argument_of_latitude),
        math.cos(argument_of_latitude),
    )
    longitude = _wrap_longitude(math.degrees(right_ascension) - gmst_deg(when))

    radius = axis * (1.0 - eccentricity * math.cos(anomaly))
    return (
        round(math.degrees(latitude), 4),
        round(longitude, 4),
        round(radius - EARTH_RADIUS_KM, 3),
    )


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------


def derive_parent_object(name: str, group: str | None) -> str | None:
    """Infer the parent object for a debris fragment from its name or group.

    `"COSMOS 2251 DEB"` -> `"COSMOS 2251"`; otherwise fall back to the group
    slug (`"cosmos-2251-debris"` -> `"COSMOS 2251"`).
    """
    upper = (name or "").upper().strip()
    for marker in (" DEB", " DEBRIS", " R/B", " COOLANT"):
        if marker in upper:
            return upper.split(marker)[0].strip() or None
    if group:
        slug = group.lower().removesuffix("-debris").replace("-", " ").strip()
        if slug:
            return slug.upper()
    return None


def describe_doc(doc: Mapping[str, Any]) -> str:
    """Build a one-sentence natural-language description used for BM25/embeddings."""
    parts = [
        f"{doc.get('name', 'Unknown object')} (NORAD {doc.get('norad_id', '?')})",
        f"is a {doc.get('orbit_class', 'unknown-orbit')} object",
    ]
    altitude = doc.get("altitude_km")
    if altitude is not None:
        parts.append(f"at about {altitude:.0f} km mean altitude")
    inclination = doc.get("inclination_deg")
    if inclination is not None:
        parts.append(f"with {inclination:.1f} degree inclination")
    if doc.get("parent_object"):
        parts.append(f"originating from breakup of {doc['parent_object']}")
    if doc.get("group"):
        parts.append(f"tracked in the CelesTrak {doc['group']} group")
    if doc.get("epoch_utc"):
        parts.append(f"elements epoch {doc['epoch_utc']}")
    return " ".join(parts) + "."


def build_text_blob(doc: Mapping[str, Any]) -> str:
    """Concatenate name, orbit class, group and description for lexical search."""
    fields: list[str] = [
        str(doc.get("name") or ""),
        str(doc.get("norad_id") or ""),
        str(doc.get("orbit_class") or ""),
        str(doc.get("group") or ""),
        str(doc.get("parent_object") or ""),
        str(doc.get("description") or describe_doc(doc)),
    ]
    return " ".join(part.strip() for part in fields if part and part.strip())


def normalize_gp_to_doc(
    gp: Mapping[str, Any],
    tle: tuple[str, str] | None = None,
    *,
    group: str | None = None,
    is_debris: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Convert one CelesTrak GP record into a Scutaris Elasticsearch document.

    `tle` is the matching `(line1, line2)` pair when available. Positions
    (`lat`, `lon`, `alt_km_now`) come from `propagate_circular`. Debris docs also
    get `parent_object`, `rcs_m2` and `group`.
    """
    now = now or datetime.now(timezone.utc)
    name = str(gp.get("OBJECT_NAME") or gp.get("OBJECT_ID") or "UNKNOWN").strip()
    norad_id = str(gp.get("NORAD_CAT_ID") or "").strip()

    mean_motion = _as_float(gp.get("MEAN_MOTION"), 15.5)
    eccentricity = _as_float(gp.get("ECCENTRICITY"))
    axis = semi_major_axis_km(mean_motion)
    mean_altitude = axis - EARTH_RADIUS_KM
    epoch = parse_epoch(gp.get("EPOCH"))
    latitude, longitude, altitude_now = propagate_circular(gp, now)

    doc: dict[str, Any] = {
        "norad_id": norad_id,
        "name": name,
        "orbit_class": classify_orbit(mean_altitude, eccentricity),
        "altitude_km": round(mean_altitude, 3),
        "inclination_deg": round(_as_float(gp.get("INCLINATION")), 4),
        "tle_line1": tle[0] if tle else None,
        "tle_line2": tle[1] if tle else None,
        "epoch_utc": epoch.isoformat(),
        "lat": latitude,
        "lon": longitude,
        "alt_km_now": altitude_now,
    }

    if is_debris:
        doc["parent_object"] = derive_parent_object(name, group)
        doc["rcs_m2"] = _as_float(gp.get("RCS_M2"), 0.0) or None
        doc["group"] = group

    doc["text_blob"] = build_text_blob({**doc, "group": group})
    return doc


# --------------------------------------------------------------------------
# Ingest pipeline
# --------------------------------------------------------------------------


def _chunks(items: Sequence[Any], size: int) -> Iterable[Sequence[Any]]:
    """Yield consecutive slices of `items` of at most `size` elements."""
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _save_json(path: Path, payload: Any) -> None:
    """Write `payload` as pretty JSON, creating parent directories as needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


async def ingest_group(
    group: str,
    target_index: str,
    limit: int = 1000,
    *,
    is_debris: bool | None = None,
    save_snapshots: bool = True,
    progress: ProgressFn | None = None,
) -> dict[str, Any]:
    """Fetch, normalize, embed and bulk-index one CelesTrak group.

    Embeddings are produced in batches of `EMBED_BATCH_SIZE` (50) and documents
    are written in bulk chunks of 500. Returns a stats dict with the number of
    records fetched, embedded and indexed plus the elapsed time.
    """
    settings = get_settings()
    emit: ProgressFn = progress or (lambda message: logger.info("%s", message))
    started = time.perf_counter()
    if is_debris is None:
        is_debris = "debris" in group.lower() or target_index.endswith("-debris")

    emit(f"[{group}] fetching GP JSON from CelesTrak...")
    records = await fetch_group(group)
    emit(f"[{group}] {len(records)} GP records returned")
    if save_snapshots:
        _save_json(RAW_DIR / f"{group}.json", records)

    try:
        tles = await fetch_group_tles(group)
        emit(f"[{group}] {len(tles)} TLE pairs returned")
    except Exception as exc:  # noqa: BLE001 - TLE lines are optional for the MVP
        logger.warning("[%s] TLE fetch failed (%s); indexing without TLE lines", group, exc)
        tles = {}

    selected = records[:limit] if limit and limit > 0 else records
    now = datetime.now(timezone.utc)
    docs: list[dict[str, Any]] = []
    for record in selected:
        norad = str(record.get("NORAD_CAT_ID") or "").lstrip("0")
        docs.append(
            normalize_gp_to_doc(
                record,
                tles.get(norad),
                group=group,
                is_debris=is_debris,
                now=now,
            )
        )
    emit(f"[{group}] normalized {len(docs)} docs (limit={limit})")
    if save_snapshots:
        _save_json(NORMALIZED_DIR / f"{group}.json", docs)

    emit(f"[{group}] embedding {len(docs)} text blobs via {active_provider()}...")
    embedded = 0
    for batch in _chunks(docs, settings.embed_batch_size):
        vectors = await embed_batch([doc["text_blob"] for doc in batch])
        for doc, vector in zip(batch, vectors, strict=True):
            doc["embedding"] = vector
        embedded += len(batch)
        emit(f"[{group}] embedded {embedded}/{len(docs)}")

    emit(f"[{group}] indexing into {target_index}...")
    indexed = 0
    for batch in _chunks(docs, 500):
        indexed += await bulk_index_async(target_index, batch)
        emit(f"[{group}] indexed {indexed}/{len(docs)}")

    elapsed = round(time.perf_counter() - started, 2)
    emit(f"[{group}] done in {elapsed}s -> {target_index} ({indexed} docs)")
    return {
        "group": group,
        "index": target_index,
        "fetched": len(records),
        "normalized": len(docs),
        "embedded": embedded,
        "indexed": indexed,
        "with_tle": sum(1 for doc in docs if doc.get("tle_line1")),
        "embed_provider": active_provider(),
        "elapsed_s": elapsed,
    }
