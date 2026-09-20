# Contracts changelog

`contracts/schemas.py` (Pydantic v2) and `contracts/types.ts` are mirrors of each
other. Every change lands in both files and gets an entry here.

## v1 — initial contracts

Derived from `docs/HACKMIT_PLAN_v3.md` FIX 3 (API surface), FIX 4 (card types),
and FIX 6 (risk thresholds).

**Models**

| Model | Used by |
|-------|---------|
| `HealthResponse` | `GET /health` |
| `SearchFilters`, `SearchRequest`, `QueryExpanded`, `SearchHit`, `SearchResponse` | `POST /search` |
| `EsqlRequest`, `EsqlColumn`, `EsqlResponse` | `POST /esql` |
| `VisualizeRequest`, `VisualizeResponse` | `POST /visualize` |

**Shared vocabularies**

`RiskLevel`, `CardType`, `QueryIntent`, `ScutarisIndex`, `AgentName`,
`SseEventName`, plus the `AGENT_SEQUENCE` and index-name constants.

**FIX 6 thresholds** are exported as constants with a `classify_risk` /
`classifyRisk` helper so the ingest pipeline, the agents, and the UI all derive
`risk_level` the same way.

### Notes for consumers

- `mock: true` on `SearchResponse`, `EsqlResponse`, and `VisualizeResponse` means
  the payload is fixture data because the upstream dependency was unreachable.
  `note` carries the reason. Render it, don't hide it.
- `SearchHit` fields beyond `index`, `score`, and `snippet` are nullable: a
  `scutaris-constraints` document has no `lat`/`lon`, and only
  `scutaris-conjunctions` documents carry `risk_level` (see
  `RISK_BEARING_INDICES`). Filtering by `risk_level` across satellite or debris
  indices will therefore match nothing in those indices.
- `/visualize` is stubbed in Part 2 and returns a static asset under `/static/mocks/`.
  Part 4 swaps in the real Grok Imagine call; the response shape does not change.
- SSE event names are fixed by `SseEventName`. The Part 2 stub emits the same
  names as the real Part 5 pipeline.
