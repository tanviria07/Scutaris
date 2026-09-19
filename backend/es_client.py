"""Elasticsearch access layer: connection, hybrid (BM25 + kNN / RRF) search, ES|QL.

`hybrid_search` is a coroutine because it embeds the query first; the
Elasticsearch calls themselves use the synchronous client and are pushed onto a
worker thread so they never block an event loop.
"""

from __future__ import annotations

import asyncio
import logging
import re
from functools import lru_cache
from typing import Any, Iterable, Mapping, Sequence

from elasticsearch import Elasticsearch
from elasticsearch import helpers as es_helpers

from backend.config import ALL_INDICES, Settings, get_settings
from backend.embeddings import embed_query

logger = logging.getLogger(__name__)

#: Keys that describe routing rather than document fields.
RESERVED_FILTER_KEYS: frozenset[str] = frozenset({"indices", "index", "size"})

#: Range operators accepted inside a filter value dict.
RANGE_OPS: frozenset[str] = frozenset({"gte", "gt", "lte", "lt"})

_RRF_RANK_CONSTANT = 60
#: `FROM scutaris-x` must be followed by end-of-query, whitespace, a comma
#: (multi-index) or a pipe — so `scutaris-satellites_secret` is not allowed.
_ESQL_ALLOWED = re.compile(
    r"^FROM\s+(" + "|".join(re.escape(name) for name in ALL_INDICES) + r")(\s|,|\||$)",
    re.IGNORECASE,
)
# `DROP` is deliberately absent: in ES|QL it removes result columns and is safe.
_ESQL_FORBIDDEN = re.compile(
    r"\b(DELETE|UPDATE|INSERT|CREATE|ALTER|GRANT|REVOKE)\b", re.IGNORECASE
)

#: None = untested, True/False = whether this cluster supports RRF retrievers.
_native_rrf_supported: bool | None = None


class ESQLValidationError(ValueError):
    """Raised when an ES|QL query fails the `scutaris-*` allowlist."""


@lru_cache(maxsize=1)
def get_es_client() -> Elasticsearch:
    """Build (and cache) an Elasticsearch client from environment configuration.

    Prefers `ELASTIC_CLOUD_ID` + `ELASTIC_API_KEY`; falls back to `ELASTIC_URL`
    with either an API key or basic auth.
    """
    settings = get_settings()
    kwargs: dict[str, Any] = {"request_timeout": settings.elastic_request_timeout}

    if settings.elastic_cloud_id:
        kwargs["cloud_id"] = settings.elastic_cloud_id
    elif settings.elastic_url:
        kwargs["hosts"] = [settings.elastic_url]
    else:
        raise RuntimeError(
            "No Elasticsearch target configured: set ELASTIC_CLOUD_ID (Elastic Cloud) "
            "or ELASTIC_URL (local/docker) in your .env"
        )

    if settings.elastic_api_key:
        kwargs["api_key"] = settings.elastic_api_key
    elif settings.elastic_username and settings.elastic_password:
        kwargs["basic_auth"] = (settings.elastic_username, settings.elastic_password)
    elif settings.elastic_cloud_id:
        raise RuntimeError("ELASTIC_CLOUD_ID is set but ELASTIC_API_KEY is missing")

    return Elasticsearch(**kwargs)


def ping() -> bool:
    """Return True when the configured cluster answers."""
    return bool(get_es_client().ping())


def cluster_banner() -> str:
    """One-line cluster description for CLI output (no secrets)."""
    info = get_es_client().info()
    return f"{info.get('cluster_name', '?')} / Elasticsearch {info['version']['number']}"


def count_docs(index: str) -> int:
    """Return the document count for `index` (0 when it does not exist)."""
    client = get_es_client()
    if not client.indices.exists(index=index):
        return 0
    client.indices.refresh(index=index)
    return int(client.count(index=index)["count"])


def bulk_index(index: str, docs: Sequence[Mapping[str, Any]], id_field: str = "norad_id") -> int:
    """Bulk-index `docs` into `index`, using `id_field` as the document `_id`.

    Returns the number of successfully written documents.
    """
    if not docs:
        return 0
    actions: list[dict[str, Any]] = []
    for doc in docs:
        action: dict[str, Any] = {"_index": index, "_source": dict(doc)}
        doc_id = doc.get(id_field)
        if doc_id is not None:
            action["_id"] = str(doc_id)
        actions.append(action)
    success, errors = es_helpers.bulk(
        get_es_client(), actions, raise_on_error=False, stats_only=False
    )
    for error in list(errors)[:3]:
        logger.error("Bulk index error: %s", error)
    return int(success)


async def bulk_index_async(
    index: str, docs: Sequence[Mapping[str, Any]], id_field: str = "norad_id"
) -> int:
    """Await-friendly `bulk_index`, executed on a worker thread."""
    return await asyncio.to_thread(bulk_index, index, docs, id_field)


def build_filter_clauses(filters: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """Translate a flat filter mapping into Elasticsearch filter clauses.

    Supported value shapes:
      * list/tuple/set -> `terms`
      * dict with gte/gt/lte/lt -> `range`
      * scalar -> `term`
    `None`/empty values and reserved routing keys (`indices`, `size`) are skipped.
    """
    clauses: list[dict[str, Any]] = []
    if not filters:
        return clauses

    for field, value in filters.items():
        if field in RESERVED_FILTER_KEYS or value is None:
            continue
        if isinstance(value, Mapping):
            bounds = {op: bound for op, bound in value.items() if op in RANGE_OPS}
            if bounds:
                clauses.append({"range": {field: bounds}})
            continue
        if isinstance(value, (list, tuple, set)):
            values = [item for item in value if item is not None]
            if values:
                clauses.append({"terms": {field: list(values)}})
            continue
        clauses.append({"term": {field: value}})
    return clauses


def _bm25_query(query_text: str, clauses: list[dict[str, Any]]) -> dict[str, Any]:
    """Compose the lexical half of hybrid search."""
    should: list[dict[str, Any]] = [
        {
            "multi_match": {
                "query": query_text,
                "fields": ["name^3", "text_blob", "orbit_class", "group", "parent_object"],
                "type": "best_fields",
                "fuzziness": "AUTO",
            }
        },
        {"term": {"norad_id": {"value": query_text, "boost": 8.0}}},
    ]
    return {
        "bool": {
            "should": should,
            "minimum_should_match": 1,
            "filter": clauses,
        }
    }


def _knn_clause(
    vector: list[float], size: int, clauses: list[dict[str, Any]]
) -> dict[str, Any]:
    """Compose the vector half of hybrid search."""
    knn: dict[str, Any] = {
        "field": "embedding",
        "query_vector": vector,
        "k": size,
        "num_candidates": max(50, size * 10),
    }
    if clauses:
        knn["filter"] = clauses
    return knn


def _format_hit(hit: Mapping[str, Any], score: float) -> dict[str, Any]:
    """Normalize a raw ES hit into the API-facing shape (drops the raw vector)."""
    source = dict(hit.get("_source") or {})
    source.pop("embedding", None)
    text_blob = source.get("text_blob") or ""
    snippet = text_blob if len(text_blob) <= 240 else f"{text_blob[:237]}..."
    return {
        "index": hit.get("_index"),
        "id": hit.get("_id"),
        "score": round(float(score), 6),
        "snippet": snippet,
        **source,
    }


def _rrf_fuse(
    ranked_lists: Iterable[Sequence[Mapping[str, Any]]], size: int
) -> list[dict[str, Any]]:
    """Client-side Reciprocal Rank Fusion over several ranked hit lists."""
    scores: dict[tuple[str, str], float] = {}
    seen: dict[tuple[str, str], Mapping[str, Any]] = {}
    for hits in ranked_lists:
        for rank, hit in enumerate(hits, start=1):
            key = (str(hit.get("_index")), str(hit.get("_id")))
            scores[key] = scores.get(key, 0.0) + 1.0 / (_RRF_RANK_CONSTANT + rank)
            seen.setdefault(key, hit)
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:size]
    return [_format_hit(seen[key], score) for key, score in ordered]


def _search_native_rrf(
    index: str, query: dict[str, Any], knn: dict[str, Any], size: int
) -> list[dict[str, Any]]:
    """Run server-side RRF via the `retriever` API (Elasticsearch 8.14+)."""
    response = get_es_client().search(
        index=index,
        size=size,
        retriever={
            "rrf": {
                "retrievers": [
                    {"standard": {"query": query}},
                    {"knn": knn},
                ],
                "rank_window_size": max(size * 5, 50),
                "rank_constant": _RRF_RANK_CONSTANT,
            }
        },
        source_excludes=["embedding"],
    )
    return [_format_hit(hit, hit.get("_score") or 0.0) for hit in response["hits"]["hits"]]


def _search_manual_rrf(
    index: str, query: dict[str, Any], knn: dict[str, Any], size: int
) -> list[dict[str, Any]]:
    """Run BM25 and kNN separately, then fuse the two rankings client-side."""
    client = get_es_client()
    depth = max(size * 3, 30)
    bm25 = client.search(
        index=index, size=depth, query=query, source_excludes=["embedding"]
    )["hits"]["hits"]
    vector = client.search(
        index=index,
        size=depth,
        knn={**knn, "k": depth, "num_candidates": max(100, depth * 5)},
        source_excludes=["embedding"],
    )["hits"]["hits"]
    return _rrf_fuse([bm25, vector], size)


def _hybrid_search_blocking(
    index: str,
    query_text: str,
    vector: list[float] | None,
    filters: Mapping[str, Any] | None,
    size: int,
) -> list[dict[str, Any]]:
    """Blocking core of `hybrid_search` (runs on a worker thread)."""
    global _native_rrf_supported

    clauses = build_filter_clauses(filters)
    query = _bm25_query(query_text, clauses)

    if vector is None:
        hits = get_es_client().search(
            index=index, size=size, query=query, source_excludes=["embedding"]
        )["hits"]["hits"]
        return [_format_hit(hit, hit.get("_score") or 0.0) for hit in hits]

    knn = _knn_clause(vector, size, clauses)

    if _native_rrf_supported is not False:
        try:
            hits = _search_native_rrf(index, query, knn, size)
            _native_rrf_supported = True
            return hits
        except Exception as exc:  # noqa: BLE001 - older clusters reject `retriever`
            if _native_rrf_supported is None:
                logger.info(
                    "Server-side RRF retriever unavailable (%s); using client-side "
                    "RRF fusion instead",
                    type(exc).__name__,
                )
            _native_rrf_supported = False

    return _search_manual_rrf(index, query, knn, size)


async def hybrid_search(
    index: str,
    query_text: str,
    filters: Mapping[str, Any] | None = None,
    size: int = 20,
) -> list[dict[str, Any]]:
    """Hybrid BM25 + kNN search over `index`, fused with RRF.

    `index` may be a single name or a comma-separated pattern (e.g.
    `"scutaris-debris,scutaris-satellites"`). Filters follow
    `build_filter_clauses`. Returns hits sorted by fused score, vectors stripped.
    Falls back to BM25-only if the query cannot be embedded.
    """
    vector: list[float] | None
    try:
        vector = await embed_query(query_text)
    except Exception as exc:  # noqa: BLE001 - search must survive embedding outages
        logger.warning(
            "Query embedding failed (%s: %s); running BM25-only search",
            type(exc).__name__,
            exc,
        )
        vector = None

    return await asyncio.to_thread(
        _hybrid_search_blocking, index, query_text, vector, filters, size
    )


def validate_esql(query: str) -> str:
    """Validate an ES|QL query against the `scutaris-*` allowlist.

    Returns the trimmed query, or raises `ESQLValidationError`.
    """
    if not query or not query.strip():
        raise ESQLValidationError("Empty ES|QL query")
    trimmed = " ".join(query.strip().split())
    if not trimmed.upper().startswith("FROM SCUTARIS-"):
        raise ESQLValidationError("ES|QL queries must start with 'FROM scutaris-'")
    if not _ESQL_ALLOWED.match(trimmed):
        raise ESQLValidationError(
            f"ES|QL source must be one of: {', '.join(ALL_INDICES)}"
        )
    if _ESQL_FORBIDDEN.search(trimmed):
        raise ESQLValidationError("ES|QL query contains a forbidden write keyword")
    return trimmed


def esql_query(query: str) -> dict[str, Any]:
    """Validate and execute an allowlisted ES|QL query.

    Returns `{"columns": [...], "values": [[...]], "rows": [{col: value}]}`.
    """
    validated = validate_esql(query)
    response = get_es_client().esql.query(query=validated, format="json")
    body = response.body if hasattr(response, "body") else dict(response)
    columns = [column["name"] for column in body.get("columns", [])]
    values = body.get("values", [])
    return {
        "query": validated,
        "columns": body.get("columns", []),
        "values": values,
        "rows": [dict(zip(columns, row, strict=False)) for row in values],
    }


async def esql_query_async(query: str) -> dict[str, Any]:
    """Await-friendly `esql_query`, executed on a worker thread."""
    return await asyncio.to_thread(esql_query, query)


def settings_banner() -> str:
    """Secret-free description of the active configuration."""
    settings: Settings = get_settings()
    return settings.describe()
