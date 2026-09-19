"""Central configuration for Scutaris, loaded from environment / `.env`.

Every secret is read from the environment. Nothing is hard-coded here.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent

# Embedding dimensions per provider (decision B in the battle plan).
JINA_DIMS: int = 1024
MINILM_DIMS: int = 384

# The four Scutaris indices. Used by the setup script and the ES|QL allowlist.
INDEX_SATELLITES: str = "scutaris-satellites"
INDEX_DEBRIS: str = "scutaris-debris"
INDEX_CONJUNCTIONS: str = "scutaris-conjunctions"
INDEX_CONSTRAINTS: str = "scutaris-constraints"
ALL_INDICES: tuple[str, ...] = (
    INDEX_SATELLITES,
    INDEX_DEBRIS,
    INDEX_CONJUNCTIONS,
    INDEX_CONSTRAINTS,
)


def _env_str(key: str, default: str = "") -> str:
    """Read `key` from the environment, returning `default` when unset or blank."""
    value = os.getenv(key)
    if value is None:
        return default
    value = value.strip()
    return value or default


def _env_int(key: str, default: int) -> int:
    """Read `key` as an int, falling back to `default` when unset or unparseable."""
    raw = _env_str(key)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    """Read `key` as a float, falling back to `default` when unset or unparseable."""
    raw = _env_str(key)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    """Immutable snapshot of the runtime configuration."""

    # --- Elasticsearch ---
    elastic_cloud_id: str = ""
    elastic_api_key: str = ""
    elastic_url: str = ""
    elastic_username: str = ""
    elastic_password: str = ""
    elastic_request_timeout: float = 60.0

    # --- Embeddings ---
    jina_api_key: str = ""
    jina_api_url: str = "https://api.jina.ai/v1/embeddings"
    jina_model: str = "jina-embeddings-v3"
    embed_dims: int = JINA_DIMS
    embed_fallback_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embed_batch_size: int = 50

    # --- CelesTrak ---
    celestrak_base_url: str = "https://celestrak.org/NORAD/elements/gp.php"
    http_timeout: float = 30.0
    user_agent: str = "scutaris/0.1 (HackMIT 2026 project)"

    # --- Ingest defaults ---
    default_satellite_group: str = "stations"
    default_debris_group: str = "cosmos-2251-debris"
    ingest_limit: int = 1000

    indices: tuple[str, ...] = field(default=ALL_INDICES)

    @property
    def has_jina(self) -> bool:
        """True when a Jina API key is configured."""
        return bool(self.jina_api_key)

    @property
    def uses_fallback_dims(self) -> bool:
        """True when the configured dimensionality matches the MiniLM fallback."""
        return self.embed_dims == MINILM_DIMS

    def describe(self) -> str:
        """Human-readable, secret-free summary used by CLI scripts."""
        target = self.elastic_cloud_id and "cloud_id" or (self.elastic_url or "<unset>")
        provider = "jina-v3" if self.has_jina else "minilm-fallback"
        return (
            f"elastic={target} embed_provider={provider} "
            f"embed_dims={self.embed_dims} celestrak={self.celestrak_base_url}"
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load `.env` (once) and return the cached `Settings` snapshot."""
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    load_dotenv(override=False)

    jina_api_key = _env_str("JINA_API_KEY")
    default_dims = JINA_DIMS if jina_api_key else MINILM_DIMS
    embed_dims = _env_int("EMBED_DIMS", default_dims)

    return Settings(
        elastic_cloud_id=_env_str("ELASTIC_CLOUD_ID"),
        elastic_api_key=_env_str("ELASTIC_API_KEY"),
        elastic_url=_env_str("ELASTIC_URL"),
        elastic_username=_env_str("ELASTIC_USERNAME"),
        elastic_password=_env_str("ELASTIC_PASSWORD"),
        elastic_request_timeout=_env_float("ELASTIC_REQUEST_TIMEOUT", 60.0),
        jina_api_key=jina_api_key,
        jina_api_url=_env_str("JINA_API_URL", "https://api.jina.ai/v1/embeddings"),
        jina_model=_env_str("JINA_MODEL", "jina-embeddings-v3"),
        embed_dims=embed_dims,
        embed_fallback_model=_env_str(
            "EMBED_FALLBACK_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        ),
        embed_batch_size=_env_int("EMBED_BATCH_SIZE", 50),
        celestrak_base_url=_env_str(
            "CELESTRAK_BASE_URL", "https://celestrak.org/NORAD/elements/gp.php"
        ),
        http_timeout=_env_float("HTTP_TIMEOUT", 30.0),
        user_agent=_env_str("USER_AGENT", "scutaris/0.1 (HackMIT 2026 project)"),
        default_satellite_group=_env_str("CELESTRAK_SATELLITE_GROUP", "stations"),
        default_debris_group=_env_str("CELESTRAK_DEBRIS_GROUP", "cosmos-2251-debris"),
        ingest_limit=_env_int("INGEST_LIMIT", 1000),
    )


def reload_settings() -> Settings:
    """Clear the cache and re-read configuration (useful in tests/notebooks)."""
    get_settings.cache_clear()
    return get_settings()
