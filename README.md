# Scutaris

**Protective intelligence for the orbital commons.**

Scutaris is a protective intelligence platform for orbital operations. It ingests real CelesTrak data into Elasticsearch, lets operators ask questions in plain English, and returns ranked collision threats — visualized on a 3D globe with AI-generated risk cards from Grok Imagine. A 5-agent LangGraph pipeline (SCOUT → ANALYST → PLANNER → SAFETY → OPS_BRIEF) reasons over live Elasticsearch data to produce a validated avoidance maneuver and operator brief.

**Built in Cursor · Planned with Grok Bot · Visualized with Grok Imagine · Powered by Elasticsearch + xAI**

## Demo Video

[Watch the 3-minute demo](<YOUTUBE_URL>)

## Live Demo

- **Frontend:** <FRONTEND_URL>
- **Backend API:** https://scutaris-api-613545175204.us-central1.run.app
- **Health:** https://scutaris-api-613545175204.us-central1.run.app/health
- **Deployed on:** Google Cloud Run (backend) · Vercel (frontend)

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

**Backend:** FastAPI + Python 3.12, containerized with Docker, deployed on Google Cloud Run (`us-central1`).

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
