# Scutaris

**Protective intelligence for the orbital commons.**

Scutaris is a protective intelligence platform for orbital operations. It ingests real CelesTrak data into Elasticsearch, lets operators ask questions in plain English, and returns ranked collision threats — visualized on a 3D globe with AI-generated risk cards from Grok Imagine. A 5-agent LangGraph pipeline (SCOUT → ANALYST → PLANNER → SAFETY → OPS_BRIEF) reasons over live Elasticsearch data to produce a validated avoidance maneuver and operator brief.

**Built in Cursor · Planned with Grok Bot · Visualized with Grok Imagine · Powered by Elasticsearch + xAI**

## Demo Video

[Watch the 3-minute demo](<YOUTUBE_URL_HERE — leave placeholder if not recorded yet>)

## Live Demo

- **Frontend:** <VERCEL_URL — leave placeholder>
- **Backend:** <RAILWAY_URL — leave placeholder>

## The Problem

Earth's orbit is crowded. 11,000 active satellites. 40,000 pieces of tracked debris. 1.7 million untracked fragments. All moving at 17,000 mph. A single collision can destroy a $500 million satellite and create thousands of new pieces of debris — a chain reaction.

Today, operators manually check dozens of government databases, spreadsheets, and feeds to know if their satellite is in danger. It's slow, fragmented, and easy to miss a threat.

## What It Does

1. **Ingests real CelesTrak data** — 6,368 satellites + 2,671 debris objects indexed live
2. **Hybrid search in Elasticsearch** — BM25 + Jina v3 kNN (1024-dim) + RRF fusion
3. **Natural language search** — "show me high-risk debris near the ISS" returns ranked conjunctions
4. **3D globe visualization** — React Three Fiber renders real orbital positions
5. **Grok Imagine risk cards** — every conjunction gets a cinematic visual
6. **5-agent AI pipeline** — SCOUT finds threats, ANALYST assesses risk, PLANNER proposes maneuvers, SAFETY validates constraints, OPS_BRIEF writes the operator report
7. **Validated maneuver** — fuel cost, Δv, constraint check, all in ~12 seconds

## How It Works

**Data layer:** CelesTrak TLEs → normalized → embedded with Jina v3 (1024-dim) → bulk indexed into 4 Elasticsearch indices:
- `scutaris-satellites` — 6,368 active satellites
- `scutaris-debris` — 2,671 debris objects
- `scutaris-conjunctions` — 5,010 indexed close approaches
- `scutaris-constraints` — 7 operational constraint records

**Search layer:** Hybrid search — BM25 text + kNN vector with Reciprocal Rank Fusion (k=60). Intent-aware boost for `debris_near_asset` queries.

**Agent layer:** 5 sequential LangGraph agents on xAI Grok-4.20, each with a locked tool set and 10-second timeout, streaming events over SSE.

**Visual layer:** Grok Imagine generates risk_card / object_card / scenario_card per conjunction, cached by sha256.

**Frontend:** Next.js 15 + React Three Fiber + Tailwind v4, deployed on Vercel.

**Backend:** FastAPI + Python 3.12, deployed on Railway.

## Sponsor Alignment

### SpaceXAI Track
- **Built entirely in Cursor** — `.cursorrules` at project root, all code in Cursor Agent mode
- **Planned with Grok Bot** — 4 documented iterations (v1 → v2 → v3 → v4) in `docs/HACKMIT_PLAN*.md`
- **Visualized with Grok Imagine** — real xAI image generation per conjunction
- **Real space data** — 9,000+ objects from CelesTrak (public, live)
- **LLM:** xAI Grok-4.20 for the agent pipeline

### Elastic Track
- **Elasticsearch as single source of truth** — both the frontend and the AI agents query it
- **Hybrid search** — BM25 + Jina v3 kNN (1024-dim) + RRF fusion
- **ES|QL** — structured queries with allowlist enforcement
- **Messy data → insight → action** — real orbital catalog to validated maneuver recommendation
- **Agent tools** — 5 LangGraph tools query Elasticsearch directly via `es_client.py`

## Architecture

```
CelesTrak TLEs (live)
       │
       ▼
[Ingest pipeline]  →  normalize  →  Jina v3 embeddings
       │
       ▼
[Elasticsearch Cloud 9.6.0]
  ├─ scutaris-satellites      (6,368 docs)
  ├─ scutaris-debris          (2,671 docs)
  ├─ scutaris-conjunctions    (5,010 docs)
  └─ scutaris-constraints     (7 docs)
       │
       ├──────────────┬───────────────┐
       ▼              ▼               ▼
[Frontend]      [FastAPI]       [Agent tools]
Next.js 15      /search         search_satellites
R3F globe       /esql           find_conjunctions
Grok Imagine    /visualize      search_debris
Risk cards      /agent/stream   query_constraints
                                assess_risk
       │
       ▼
5-agent LangGraph pipeline (xAI Grok-4.20)
SCOUT → ANALYST → PLANNER → SAFETY → OPS_BRIEF
       │
       ▼
Operator brief + validated maneuver
```

## Tech Stack

**Backend:** Python 3.12, FastAPI, uvicorn, elasticsearch-py 8.19, httpx, LangGraph, langchain-openai, pydantic v2
**Frontend:** Next.js 15, React 19, React Three Fiber, Tailwind v4, TypeScript
**Search:** Elastic Cloud Serverless 9.6.0, Jina v3 embeddings (1024-dim), BM25 + kNN + RRF
**LLM:** xAI Grok-4.20 (`grok-4.20-0309-non-reasoning`) via OpenAI-compatible endpoint
**Visual:** xAI Grok Imagine for risk card generation
**Deployment:** Vercel (frontend), Railway (backend)

## Running Locally

### Prerequisites
- Python 3.12
- Node.js 20+
- Elastic Cloud account (free tier works)
- Jina AI API key
- xAI API key

### Backend

```bash
cd backend
python -m venv ../.venv
source ../.venv/bin/activate   # Windows: ..\.venv\Scripts\activate.ps1
pip install -r requirements.txt

# Fill .env with:
#   ELASTIC_CLOUD_ID, ELASTIC_API_KEY
#   JINA_API_KEY, EMBED_DIMS=1024
#   XAI_API_KEY, LLM_API_KEY (same value), LLM_BASE_URL=https://api.x.ai/v1
#   LLM_MODEL=grok-4.20-0309-non-reasoning

python scripts/setup_elastic.py       # create 4 indices
python scripts/ingest_tles.py         # ingest CelesTrak data
python scripts/build_conjunctions.py  # build conjunction index
python scripts/seed_demo_conjunctions.py  # seed demo data

uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000" > .env.local
npm run dev
```

Open `http://localhost:3000`.

Try: `show me high-risk debris near the ISS`

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + ES status |
| POST | `/search` | Hybrid search (BM25 + kNN + RRF) |
| POST | `/esql` | ES\|QL queries (allowlisted to `scutaris-*`) |
| POST | `/visualize` | Grok Imagine risk card generation |
| GET | `/agent/stream` | SSE 5-agent pipeline |

## Project Docs

- `docs/HACKMIT_PLAN.md` — Grok Bot v1 planning
- `docs/HACKMIT_PLAN_v2.md` — Grok Bot v2 corrections
- `docs/HACKMIT_PLAN_v3.md` — Grok Bot v3 final plan
- `docs/HACKMIT_PLAN_v4_team_split.md` — Grok Bot v4 team runbook
- `docs/GROK_USAGE.md` — Grok Bot iteration proof
- `docs/ELASTIC_SETUP.md` — Elasticsearch index details

## Team

- **Md. Tanvir Ibn Alam** — backend, Elasticsearch integration, Grok Imagine, deployment
- **Ashraful Islam Tutul** — frontend, ES ingestion, LangGraph agents

## License

MIT
