"""Guards the routers against a slow, missing, or wedged Elasticsearch.

Two problems this solves:

* An unconfigured cluster should cost microseconds per request, not a failed
  round trip, so `es_available` caches a bounded ping for a few seconds.
* `hybrid_search` embeds the query before it searches, and the MiniLM fallback
  downloads model weights on first use inside a worker thread. `asyncio.wait_for`
  awaits the task it cancelled, which never returns while that thread is stuck,
  so a deadline has to abandon the task instead of waiting on its cleanup.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, TypeVar

from backend import es_client

logger = logging.getLogger(__name__)

T = TypeVar("T")

PING_TIMEOUT_S = 3.0
#: How long a successful reachability verdict stays good for.
#: Failures are not cached — a slow Serverless ping must not poison /search.
PING_TTL_S = 5.0

_cached_verdict: tuple[float, bool] | None = None
_last_error: str | None = None
_probe_lock = asyncio.Lock()


class DeadlineExceeded(TimeoutError):
    """Raised when an Elasticsearch call outruns its deadline."""


async def es_available(force: bool = False) -> bool:
    """Return whether the cluster answered recently, pinging at most every TTL."""
    global _cached_verdict

    if not force and _fresh_verdict() is not None:
        return bool(_fresh_verdict())

    async with _probe_lock:
        # Another request may have refreshed the verdict while we queued.
        if not force:
            cached = _fresh_verdict()
            if cached is not None:
                return cached
        verdict = await _ping()
        if verdict:
            _cached_verdict = (time.monotonic(), True)
        else:
            _cached_verdict = None
        return verdict


def _fresh_verdict() -> bool | None:
    if _cached_verdict is None:
        return None
    checked_at, verdict = _cached_verdict
    return verdict if time.monotonic() - checked_at < PING_TTL_S else None


def last_ping_error() -> str | None:
    """Why the most recent ping failed — surfaced by `/health` as `detail`."""
    return _last_error


async def _ping() -> bool:
    global _last_error
    try:
        reachable = await wait_or_abandon(
            asyncio.to_thread(es_client.ping), PING_TIMEOUT_S
        )
    except Exception as exc:  # noqa: BLE001 - unconfigured ES is a normal dev state
        logger.debug("Elasticsearch ping failed (%s: %s)", type(exc).__name__, exc)
        _last_error = f"{type(exc).__name__}: {exc}"
        return False

    _last_error = None if reachable else "Elasticsearch did not answer the ping."
    return reachable


async def wait_or_abandon(awaitable: Awaitable[T], timeout: float) -> T:
    """Await `awaitable`, giving up after `timeout` without blocking on cleanup.

    Raises `DeadlineExceeded` on timeout. The abandoned task keeps running to
    completion in the background; its result is discarded.
    """
    task = asyncio.ensure_future(awaitable)
    done, _ = await asyncio.wait({task}, timeout=timeout)
    if task in done:
        return task.result()

    task.add_done_callback(_discard)
    task.cancel()
    raise DeadlineExceeded(f"Elasticsearch call exceeded {timeout:.1f}s")


def _discard(task: "asyncio.Future[Any]") -> None:
    """Consume an abandoned task's outcome so asyncio stops warning about it."""
    if task.cancelled():
        return
    error = task.exception()
    if error is not None:
        logger.debug("Abandoned Elasticsearch task finished with %r", error)
