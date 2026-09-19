"""Embedding client: Jina v3 (1024-dim) with a local MiniLM (384-dim) fallback.

Network calls go through async `httpx`. Results are cached in-process by the
sha256 of the text so repeated ingests / queries never pay twice.

Both public entry points are coroutines:

    vec = await embed_text("ISS (ZARYA)")
    vecs = await embed_batch(["...", "..."])

Synchronous callers (plain CLI scripts) can use `embed_text_sync` /
`embed_batch_sync`.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any, Final, Literal

import httpx

from backend.config import MINILM_DIMS, Settings, get_settings

logger = logging.getLogger(__name__)

JinaTask = Literal["retrieval.passage", "retrieval.query", "separation", "classification"]

#: sha256(provider|model|task|text) -> vector
_CACHE: dict[str, list[float]] = {}

_MAX_ATTEMPTS: Final[int] = 3
_RETRY_STATUS: Final[frozenset[int]] = frozenset({408, 429, 500, 502, 503, 504})

_fallback_model: Any | None = None
_fallback_lock: asyncio.Lock | None = None
_jina_disabled: bool = False
_warned_padding: bool = False


class EmbeddingError(RuntimeError):
    """Raised when neither Jina nor the local fallback can produce vectors."""


def _cache_key(provider: str, model: str, task: str, text: str) -> str:
    """Build the sha256 cache key for one (provider, model, task, text) tuple."""
    digest = hashlib.sha256(f"{provider}|{model}|{task}|{text}".encode("utf-8"))
    return digest.hexdigest()


def cache_stats() -> dict[str, int]:
    """Return the number of vectors currently memoized in-process."""
    return {"entries": len(_CACHE)}


def clear_cache() -> None:
    """Drop every memoized vector (used by tests and re-embedding runs)."""
    _CACHE.clear()


def active_provider() -> str:
    """Report which provider the next call will try: `jina` or `minilm`."""
    settings = get_settings()
    return "jina" if settings.has_jina and not _jina_disabled else "minilm"


def _fit_dims(vector: list[float], target_dims: int) -> list[float]:
    """Pad with zeros or truncate `vector` so it matches the index mapping.

    Zero-padding is cosine-safe: the dot product and both norms are unchanged,
    so a 384-dim MiniLM vector padded to 1024 ranks identically against other
    padded vectors. This keeps ingestion working when `EMBED_DIMS` was left at
    1024 but the Jina call fell back to MiniLM.
    """
    global _warned_padding

    if len(vector) == target_dims:
        return vector
    if not _warned_padding:
        logger.warning(
            "Embedding dimensionality mismatch: got %d, index expects %d. "
            "Zero-padding/truncating to fit (cosine similarity is preserved). "
            "Set EMBED_DIMS=%d and re-run scripts/setup_elastic.py for a clean index.",
            len(vector),
            target_dims,
            len(vector),
        )
        _warned_padding = True
    if len(vector) > target_dims:
        return vector[:target_dims]
    return vector + [0.0] * (target_dims - len(vector))


async def _jina_embed(
    texts: list[str], task: JinaTask, settings: Settings
) -> list[list[float]]:
    """Call the Jina embeddings API for one chunk of texts.

    Raises `httpx.HTTPError` / `EmbeddingError` so the caller can fall back.
    """
    payload: dict[str, Any] = {
        "model": settings.jina_model,
        "task": task,
        "dimensions": settings.embed_dims,
        "embedding_type": "float",
        "input": texts,
    }
    headers = {
        "Authorization": f"Bearer {settings.jina_api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=settings.http_timeout) as client:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = await client.post(
                    settings.jina_api_url, json=payload, headers=headers
                )
                if response.status_code in _RETRY_STATUS and attempt < _MAX_ATTEMPTS:
                    await asyncio.sleep(0.75 * attempt)
                    continue
                response.raise_for_status()
                body = response.json()
                break
            except httpx.HTTPError as exc:  # network error or non-retryable status
                last_error = exc
                if attempt >= _MAX_ATTEMPTS:
                    raise
                await asyncio.sleep(0.75 * attempt)
        else:  # pragma: no cover - loop always breaks or raises
            raise EmbeddingError(f"Jina request exhausted retries: {last_error}")

    data = body.get("data")
    if not isinstance(data, list) or len(data) != len(texts):
        raise EmbeddingError(
            f"Jina returned {len(data) if isinstance(data, list) else 'no'} "
            f"embeddings for {len(texts)} inputs"
        )
    ordered = sorted(data, key=lambda item: item.get("index", 0))
    return [[float(x) for x in item["embedding"]] for item in ordered]


async def _get_fallback_model() -> Any:
    """Lazily load the MiniLM sentence-transformers model (off the event loop)."""
    global _fallback_model, _fallback_lock

    if _fallback_model is not None:
        return _fallback_model
    if _fallback_lock is None:
        _fallback_lock = asyncio.Lock()

    async with _fallback_lock:
        if _fallback_model is not None:
            return _fallback_model
        settings = get_settings()
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:  # pragma: no cover - depends on local env
            raise EmbeddingError(
                "No embedding backend available: set JINA_API_KEY or "
                "`pip install sentence-transformers` for the MiniLM fallback"
            ) from exc
        logger.warning(
            "Loading local fallback embedding model %s (%d-dim); first run downloads weights",
            settings.embed_fallback_model,
            MINILM_DIMS,
        )
        _fallback_model = await asyncio.to_thread(
            SentenceTransformer, settings.embed_fallback_model
        )
        return _fallback_model


async def _minilm_embed(texts: list[str]) -> list[list[float]]:
    """Embed texts locally with MiniLM, normalized for cosine similarity."""
    model = await _get_fallback_model()
    vectors = await asyncio.to_thread(
        model.encode,
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [[float(x) for x in vector] for vector in vectors]


async def _embed_uncached(
    texts: list[str], task: JinaTask, settings: Settings
) -> tuple[list[list[float]], str, str]:
    """Embed texts with Jina, falling back to MiniLM. Returns (vectors, provider, model)."""
    global _jina_disabled

    if settings.has_jina and not _jina_disabled:
        try:
            vectors = await _jina_embed(texts, task, settings)
            return vectors, "jina", settings.jina_model
        except Exception as exc:  # noqa: BLE001 - any failure must degrade gracefully
            logger.warning(
                "Jina embeddings unavailable (%s: %s); switching to MiniLM fallback for "
                "the rest of this process",
                type(exc).__name__,
                exc,
            )
            _jina_disabled = True
    elif not settings.has_jina:
        logger.debug("JINA_API_KEY not set; using MiniLM fallback")

    vectors = await _minilm_embed(texts)
    return vectors, "minilm", settings.embed_fallback_model


async def embed_batch(
    texts: list[str], *, task: JinaTask = "retrieval.passage"
) -> list[list[float]]:
    """Embed a list of texts, returning one vector per input in the same order.

    Cached inputs are served from memory; the remainder is sent to the provider
    in chunks of `EMBED_BATCH_SIZE` (default 50). Vectors are padded/truncated
    to `EMBED_DIMS` so they always match the Elasticsearch mapping.
    """
    if not texts:
        return []

    settings = get_settings()
    provider = active_provider()
    model = settings.jina_model if provider == "jina" else settings.embed_fallback_model

    results: list[list[float] | None] = [None] * len(texts)
    pending: list[tuple[int, str]] = []
    for position, text in enumerate(texts):
        cached = _CACHE.get(_cache_key(provider, model, task, text))
        if cached is not None:
            results[position] = cached
        else:
            pending.append((position, text))

    chunk_size = max(1, settings.embed_batch_size)
    for start in range(0, len(pending), chunk_size):
        chunk = pending[start : start + chunk_size]
        vectors, used_provider, used_model = await _embed_uncached(
            [text for _, text in chunk], task, settings
        )
        for (position, text), vector in zip(chunk, vectors, strict=True):
            fitted = _fit_dims(vector, settings.embed_dims)
            _CACHE[_cache_key(used_provider, used_model, task, text)] = fitted
            results[position] = fitted

    missing = [index for index, vector in enumerate(results) if vector is None]
    if missing:  # pragma: no cover - defensive
        raise EmbeddingError(f"Embedding provider skipped inputs at {missing}")
    return [vector for vector in results if vector is not None]


async def embed_text(text: str, *, task: JinaTask = "retrieval.passage") -> list[float]:
    """Embed a single string and return its vector."""
    vectors = await embed_batch([text], task=task)
    return vectors[0]


async def embed_query(text: str) -> list[float]:
    """Embed a search query (uses Jina's `retrieval.query` task asymmetry)."""
    return await embed_text(text, task="retrieval.query")


def embed_text_sync(text: str, *, task: JinaTask = "retrieval.passage") -> list[float]:
    """Blocking wrapper around `embed_text` for non-async callers."""
    return asyncio.run(embed_text(text, task=task))


def embed_batch_sync(
    texts: list[str], *, task: JinaTask = "retrieval.passage"
) -> list[list[float]]:
    """Blocking wrapper around `embed_batch` for non-async callers."""
    return asyncio.run(embed_batch(texts, task=task))
