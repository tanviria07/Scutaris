"""Scutaris FastAPI application.

Wires the four endpoints from HACKMIT_PLAN_v3 FIX 3 plus a health probe. Every
response shape is defined in `contracts/schemas.py` and mirrored in
`contracts/types.ts`.

Run locally from the project root:

    uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.routers import agents, esql, search, visualize
from backend.routers.es_guard import es_available, last_ping_error
from contracts.schemas import CONTRACTS_VERSION, HealthResponse

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

API_VERSION = "0.2.0"

#: Next.js dev server (3000) and a second instance for pair work (3001).
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

STATIC_DIR = Path(__file__).resolve().parent / "static"
GROK_CACHE_DIR = STATIC_DIR / "grok_cache"

app = FastAPI(
    title="Scutaris API",
    description="Orbital conjunction search, ES|QL, Imagine cards, and agent stream.",
    version=API_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR.mkdir(parents=True, exist_ok=True)
GROK_CACHE_DIR.mkdir(parents=True, exist_ok=True)
# More specific mount first so /static/grok_cache is not swallowed by /static.
app.mount(
    "/static/grok_cache",
    StaticFiles(directory=GROK_CACHE_DIR),
    name="grok_cache",
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

app.include_router(search.router)
app.include_router(esql.router)
app.include_router(visualize.router)
app.include_router(agents.router)


@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    """Liveness plus a bounded Elasticsearch reachability probe.

    Always 200: `elasticsearch: "down"` is the signal, not an HTTP error, so the
    frontend can show a degraded banner instead of treating the API as dead.
    The probe is forced, which also refreshes the verdict `/search` and `/esql`
    reuse.
    """
    reachable = await es_available(force=True)
    return HealthResponse(
        status="ok" if reachable else "degraded",
        elasticsearch="up" if reachable else "down",
        api_version=API_VERSION,
        contracts_version=CONTRACTS_VERSION,
        detail=last_ping_error(),
    )
