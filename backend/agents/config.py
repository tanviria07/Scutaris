"""LLM configuration for the agent pipeline, read from the environment.

The pipeline talks to any OpenAI-compatible chat-completions endpoint, so the
same code runs against xAI (`https://api.x.ai/v1`), OpenAI, or Groq. Keys are
never logged: only `is_configured` is ever reported.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from backend.config import get_settings

#: Used when `LLM_BASE_URL` is unset.
DEFAULT_BASE_URL = "https://api.openai.com/v1"
#: Used when `LLM_MODEL` is unset.
DEFAULT_MODEL = "gpt-4o-mini"
#: Low but non-zero: operators want stable wording, not creative prose.
DEFAULT_TEMPERATURE = 0.3
#: Hard cap on llm_call -> tool_calls rounds inside a single agent.
DEFAULT_MAX_ITERATIONS = 10


@dataclass(frozen=True)
class LLMConfig:
    """Immutable snapshot of the chat-completions configuration."""

    base_url: str = DEFAULT_BASE_URL
    api_key: str = ""
    model: str = DEFAULT_MODEL
    temperature: float = DEFAULT_TEMPERATURE
    max_iterations: int = DEFAULT_MAX_ITERATIONS

    @property
    def is_configured(self) -> bool:
        """True when an API key is present, so the real pipeline can run."""
        return bool(self.api_key)

    def to_llm_kwargs(self) -> dict[str, Any]:
        """Keyword arguments for `ChatOpenAI`."""
        return {
            "model": self.model,
            "api_key": self.api_key,
            "base_url": self.base_url,
            "temperature": self.temperature,
        }

    def describe(self) -> str:
        """Secret-free summary for logs and the `pipeline_done` note."""
        return (
            f"model={self.model} base_url={self.base_url} "
            f"key={'set' if self.is_configured else 'unset'}"
        )

    @classmethod
    def from_env(cls) -> "LLMConfig":
        """Build a config from `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`."""
        # get_settings() loads `.env` into os.environ; the LLM keys are not on
        # the Settings dataclass, so they are read with os.getenv here.
        get_settings()
        return cls(
            base_url=os.getenv("LLM_BASE_URL", "").strip() or DEFAULT_BASE_URL,
            api_key=os.getenv("LLM_API_KEY", "").strip(),
            model=os.getenv("LLM_MODEL", "").strip() or DEFAULT_MODEL,
        )
