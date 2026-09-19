# Scutaris — HackMIT Battle Plan v3 (FINAL)

**Team:** 2 · **Budget:** 10 hours · **Tracks:** SpaceXAI + Elastic  
**Roles:** **B** = backend/data · **F** = frontend/UI  
**Stack (locked):**
- **Frontend:** Next.js 15 + React Three Fiber + Tailwind v4 · **Globe:** existing R3F component (not globe.gl, not Cesium)
- **Backend:** FastAPI + LangGraph (`backend/agents/`)
- **Search:** Elasticsearch · embeddings Jina v3 (1024-dim) · MiniLM fallback
- **Deploy:** Vercel (`frontend/`) + Railway (`backend/`) · Elastic Cloud (or Compose local)

**Hard MVP:** NL query → hybrid search → R3F globe → Imagine card → **sequential** LangGraph agents (SSE) → operator brief + maneuver.

**Golden query:** `show me high-risk debris near the ISS`

---

## FIX 1 + FIX 7 — Sequential agents & tool signatures (LOCKED)

**5 sequential agents** (LangGraph). Agents are **not** parallel. **Tool calls inside each agent may run in parallel.** Per-agent hard timeout: **10s** (pipeline budget ~50–60s).

### Risk thresholds (FIX 6 — used by conjunction builder, ES filters, ANALYST, OPS_BRIEF)

```text
miss_km <  0.5  → CRITICAL
miss_km < 10    → HIGH
miss_km < 40    → MEDIUM
miss_km >= 40   → LOW

If Pc > 1e-4 → escalate to CRITICAL (regardless of miss_km)
```

Store on each conjunction doc as `risk_level`: `critical` | `high` | `medium` | `low` (lowercase keywords).

### Locked tools

```python
def search_satellites(query: str, filters: dict) -> list[SatelliteHit]: ...
def find_conjunctions(norad_id: str, horizon_hours: int) -> list[Conjunction]: ...
def search_debris(orbit_class: str, limit: int) -> list[DebrisHit]: ...
def query_constraints(norad_id: str) -> ConstraintsDoc: ...
def assess_risk(primary_norad: str, secondary_norad: str) -> RiskAssessment: ...
```

| Order | Agent | Job | Tools (parallel OK within agent) | Consumes | Produces |
|------:|-------|-----|----------------------------------|----------|----------|
| 1 | **SCOUT** | Find candidate threats for the query/asset | `search_satellites`, `find_conjunctions` | user query (+ optional `asset_norad`) | `ThreatCandidates[]` |
| 2 | **ANALYST** | Score geometry & risk with locked thresholds | `find_conjunctions`, `search_debris`, `assess_risk` | SCOUT output | `RiskAssessment` (+ ranked conjunctions) |
| 3 | **PLANNER** | Propose Δv / timing options | `query_constraints` | ANALYST output | `ManeuverOptions[]` |
| 4 | **SAFETY** | Validate fuel, blackout, min perigee | `query_constraints` | PLANNER options | `ValidatedPlan` |
| 5 | **OPS_BRIEF** | Operator-facing report | `assess_risk` (refresh/summarize top pair) | full chain | `OperatorBrief` |

SSE: `agent_start` → `tool_start` / `tool_end` → `agent_done` → … → `pipeline_done` | `pipeline_error`.

---

## FIX 2 — Elasticsearch indices

### `scutaris-satellites`
`norad_id`, `name`, `orbit_class`, `altitude_km`, `inclination_deg`, `tle_line1`, `tle_line2`, `epoch_utc`, `lat`, `lon`, `alt_km_now`, `text_blob`, `embedding` (1024).

### `scutaris-debris`
`norad_id`, `name`, `parent_object`, `rcs_m2` (nullable), `orbit_class`, `altitude_km`, `inclination_deg`, `tle_line1`, `tle_line2`, `group`, `lat`, `lon`, `alt_km_now`, `text_blob`, `embedding`.

### `scutaris-conjunctions`
`primary_norad`, `secondary_norad`, `tca_utc`, `miss_km`, `pc`, `risk_level`, `text_blob`, `embedding`.

**`risk_level` derivation (deterministic):** apply FIX 6 thresholds at write time in `scripts/build_conjunctions.py` and again inside `assess_risk` for live pairs.

### `scutaris-constraints`
`norad_id`, `fuel_kg`, `max_dv_ms`, `min_perigee_km`, `blackout_windows[]`, `notes`.

---

## FIX 3 — API surface

| Method | Path | Role |
|--------|------|------|
| `POST` | `/search` | NL → hybrid search |
| `POST` | `/esql` | Allowlisted ES\|QL on `scutaris-*` |
| `POST` | `/visualize` | Grok Imagine card |
| `GET` | `/agent/stream` | SSE sequential LangGraph pipeline |

#### `POST /search`
```json
// request
{ "query": "show me high-risk debris near the ISS",
  "filters": { "orbit_class": ["LEO"], "risk_level": ["high","critical"],
               "indices": ["scutaris-debris","scutaris-satellites","scutaris-conjunctions"] },
  "size": 20 }
// response
{ "query_expanded": { "asset_norad": "25544", "intent": "debris_near_asset" },
  "hits": [{ "index": "scutaris-debris", "norad_id": "...", "score": 12.4,
             "risk_level": "high", "lat": 0, "lon": 0, "alt_km_now": 400, "snippet": "..." }],
  "took_ms": 42 }
```

#### `POST /esql`
```json
{ "query": "FROM scutaris-conjunctions | WHERE risk_level == \"critical\" | SORT miss_km ASC | LIMIT 10" }
```
Allowlist: `FROM scutaris-satellites|debris|conjunctions|constraints` only.

#### `POST /visualize`
```json
{ "type": "risk_card"|"object_card"|"scenario_card", "context": { "...": "..." } }
// → { "type", "prompt_used", "image_url", "cached", "took_ms" }
```

#### `GET /agent/stream?q=...&asset_norad=25544`
SSE events through SCOUT→OPS_BRIEF; `pipeline_done` includes `brief`, `maneuver`, hit ids, optional visualize payload.

---

## FIX 4 — Grok Imagine card types

| Type | Use | Prompt focus |
|------|-----|----------------|
| `risk_card` | Conjunction | Trajectories + warning colors by `risk_level` |
| `object_card` | Single object | Stylized mission patch |
| `scenario_card` | Search overview | Atmospheric LEO / debris field |

Brand colors in every prompt: teal `#5eead4`, amber `#fbbf24`, red `#ef4444`, dark bg.

**risk_card template**
```text
Cinematic space-ops risk card. Conjunction {primary_name} (NORAD {primary_norad}) vs {secondary_name} (NORAD {secondary_norad}).
TCA {tca_utc}. Miss {miss_km} km. Risk {risk_level}.
Dark HUD poster, teal orbit arcs (#5eead4), amber (#fbbf24) or red (#ef4444) by severity, no gore, square.
```

**object_card template**
```text
Mission-patch emblem for "{name}" (NORAD {norad_id}), {orbit_class}. Dark badge, teal (#5eead4) linework, minimal type, no crash imagery.
```

**scenario_card template**
```text
Atmospheric LEO scene for query "{query}". Earth limb, sparse debris sparks, teal HUD (#5eead4), amber watch highlights (#fbbf24), dark cinematic frame.
```

---

## FIX 5 — Frontend & globe (LOCKED)

- **Next.js 15** App Router + **React Three Fiber** + **Tailwind v4**
- **Reuse existing R3F globe component** (prior art) — do **not** introduce globe.gl or Cesium
- Phase 4 = port/wire that component to Scutaris data (`lat`/`lon`/`alt_km_now` + risk colors), not rebuild a globe

---

## A–F (carried forward, still locked)

| ID | Decision |
|----|----------|
| A | CelesTrak: **JSON groups + TLE lines** (bulk JSON; TLE for SGP4 / any NORAD) |
| B | Embeddings: **Jina v3 1024-dim**; MiniLM 384 fallback via `EMBED_DIMS` |
| C | Deploy: **Vercel + Railway** in Phase 6 |
| D | Handoffs: **H1@1:30 H2@3:00 H3@4:30 H4@6:30 H5@8:00** (table below) |
| E | Proof: **`docs/GROK_USAGE.md`** (chat links, transcript, screenshots) + this plan |
| F | Palette: dark + `#5eead4` / `#fbbf24` / `#ef4444` |

---

## Hour-by-hour + H1–H5

| Hours | B | F | Handoff |
|------:|---|----|---------|
| 0:00–0:30 | Repo layout, ES mappings, Railway stub | Next.js 15 + Tailwind v4 tokens; drop in R3F globe stub | Shared TypeScript/Pydantic types |
| 0:30–1:30 | CelesTrak JSON+TLE ingest; seed constraints; fixtures | Theme + shell + globe with fixture points | **H1 @ 1:30** — types + `fixtures/search_iss.json` |
| 1:30–3:00 | Index 4 indices; hybrid `POST /search`; `/esql` allowlist | Wire search UI; globe consumes live hit shape | **H2 @ 3:00** — live `/search` |
| 3:00–4:30 | `build_conjunctions` + FIX 6 thresholds; `/visualize` | Risk-colored markers; Demo button (golden query) | **H3 @ 4:30** — golden query on R3F globe |
| 4:30–6:30 | LangGraph sequential agents + tools; `GET /agent/stream` | SSE timeline UI; Imagine panel | **H4 @ 6:30** — full chain in UI |
| 6:30–8:00 | Deploy API→Railway; caches; logging | Deploy→Vercel; CORS/SSE prod test | **H5 @ 8:00** — prod golden path |
| 8:00–9:30 | `GROK_USAGE.md`, Elastic README, provenance | Demo rehearsal | Dry run |
| 9:30–10:00 | Submit scrub | Submit scrub | Submit |

---

## Six phases

1. **Ingest** — JSON+TLE → normalize; constraints seed; FIX 6 ready for conjunction builder  
2. **ES** — four indices; hybrid + RRF; ES\|QL; Jina embeddings  
3. **API** — `/search` `/esql` `/visualize` `/agent/stream`  
4. **Frontend** — Next.js 15 + R3F prior-art globe + Tailwind v4 brand  
5. **Agents** — LangGraph sequential + 5 tools + Imagine cards  
6. **Deploy & proof** — Vercel + Railway + `GROK_USAGE.md` + checklists  

---

## Repo layout (LOCKED)

```text
scutaris/
  backend/              # FastAPI
    agents/             # LangGraph pipeline (SCOUT→OPS_BRIEF)
  frontend/             # Next.js 15 + R3F + Tailwind v4
  scripts/              # ingest, index, build_conjunctions
  docs/
    HACKMIT_PLAN_v3.md
    GROK_USAGE.md
  data/raw/
  data/normalized/
  docker-compose.yml    # local Elasticsearch
  README.md
```

---

## Risks (top 5)

1. Sequential LangGraph latency → 10s/agent caps; partial `pipeline_done`  
2. Embeddings/Jina → MiniLM fallback; BM25-first flag  
3. Conjunction false precision → document heuristic; thresholds still deterministic  
4. SSE through Vercel/Railway → early H5 prod test  
5. R3F prior-art glue time → fixture-first; don’t rewrite globe  

---

## Submission checklists

### SpaceXAI
- [ ] Cursor-built  
- [ ] Grok Imagine (3 card types)  
- [ ] Grok Bot planning (`GROK_USAGE.md` + this v3 plan)  
- [ ] Real CelesTrak (JSON + TLE)  
- [ ] Deployed Vercel + Railway  

### Elastic
- [ ] Four indices documented  
- [ ] Hybrid BM25 + vectors (RRF)  
- [ ] ES\|QL endpoint  
- [ ] Conjunctions + deterministic `risk_level`  
- [ ] Agents act on ES via the five tools  

---

*v3 FINAL — approve and build.*
