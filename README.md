# Scutaris — Part 1: Elasticsearch + CelesTrak ingest

Space-situational-awareness search for HackMIT 2026 (SpaceXAI + Elastic tracks).
This part covers **only** the data layer: Elasticsearch indices and the
CelesTrak ingestion pipeline. No API, frontend, or agents yet — those are
Parts 2–6 (see `docs/HACKMIT_PLAN_v3.md`).

## What exists after Part 1

| Path | Role |
|------|------|
| `backend/config.py` | Environment/`.env` configuration |
| `backend/embeddings.py` | Jina v3 (1024-dim) with MiniLM (384-dim) fallback, sha256-cached |
| `backend/es_client.py` | ES client, hybrid BM25 + kNN search fused with RRF, allowlisted ES\|QL |
| `backend/ingest.py` | CelesTrak GP JSON + TLE → normalized docs → embeddings → bulk index |
| `scripts/setup_elastic.py` | Creates the four `scutaris-*` indices |
| `scripts/ingest_tles.py` | CLI ingest runner |

## Quick start

### 1. Install

```bash
cd Scutaris
python -m venv .venv
.venv\Scripts\activate      # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

`sentence-transformers` is only needed for the offline embedding fallback. If
you have a `JINA_API_KEY`, you can skip it (`pip install elasticsearch httpx python-dotenv numpy`).

### 2. Configure `.env`

```bash
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
```

Fill in:

- `ELASTIC_CLOUD_ID` and `ELASTIC_API_KEY` — from your Elastic Cloud deployment
  (**Manage deployment → Copy Cloud ID**, then **Security → API keys**).
  For a local cluster instead, leave those blank and set `ELASTIC_URL`
  (plus `ELASTIC_USERNAME` / `ELASTIC_PASSWORD`).
- `JINA_API_KEY` — from [jina.ai](https://jina.ai/embeddings). Optional.
- `EMBED_DIMS` — `1024` with Jina, `384` if you plan to run MiniLM-only.
  Set this **before** creating the indices; it defines the `dense_vector` mapping.
- `CELESTRAK_BASE_URL` — already defaults to the public GP endpoint.

No Elastic Cloud deployment? Run a local cluster instead:

```bash
docker compose up -d          # Elasticsearch 8.15 on :9200, security off
# .env: ELASTIC_URL=http://localhost:9200  (leave ELASTIC_CLOUD_ID blank)
```

### 3. Create the indices

```bash
python scripts/setup_elastic.py
```

Add `--recreate` to drop and rebuild them (destructive), or `--dry-run` to print
the mappings without touching the cluster.

### 4. Ingest CelesTrak data

```bash
python scripts/ingest_tles.py
```

Useful flags: `--limit 200` (cap objects per group), `--satellites-only`,
`--debris-only`, `--group active --index scutaris-satellites`.

### Expected result

Two populated indices:

| Index | Source group | Typical count |
|-------|--------------|---------------|
| `scutaris-satellites` | `stations` | ~10–15 docs (includes ISS, NORAD 25544) |
| `scutaris-debris` | `cosmos-2251-debris` | ~1000 docs (capped by `--limit`, default 1000) |

`scutaris-conjunctions` and `scutaris-constraints` are created but stay empty
until Part 3 (`build_conjunctions.py` + constraint seeding).

The runner prints per-group progress, a summary table, final index counts, and
confirms that the ISS document is present.

## Index mappings

| Index | Fields |
|-------|--------|
| `scutaris-satellites` | `norad_id`, `name` (text + `.keyword`), `orbit_class`, `altitude_km`, `inclination_deg`, `tle_line1`/`tle_line2` (not indexed), `epoch_utc`, `lat`, `lon`, `alt_km_now`, `text_blob`, `embedding` (dense_vector, cosine) |
| `scutaris-debris` | everything above plus `parent_object`, `rcs_m2` (nullable), `group` |
| `scutaris-conjunctions` | `primary_norad`, `secondary_norad`, `tca_utc`, `miss_km`, `pc`, `risk_level`, `text_blob`, `embedding` |
| `scutaris-constraints` | `norad_id`, `fuel_kg`, `max_dv_ms`, `min_perigee_km`, `blackout_windows` (nested: `start_utc`, `end_utc`, `reason`), `notes` |

## Notes and known MVP shortcuts

- **Positions are approximate.** `alt_km_now` / `lat` / `lon` come from a
  circular-orbit approximation (mean anomaly advanced linearly from the element
  epoch, true anomaly ≈ mean anomaly). Real TLE lines are stored on every doc so
  a later phase can swap in SGP4 without re-ingesting.
- **Embedding fallback is automatic.** A missing or failing `JINA_API_KEY`
  logs a warning and switches the whole process to MiniLM. MiniLM's 384-dim
  vectors are zero-padded to `EMBED_DIMS` so they still fit a 1024-dim mapping
  (cosine similarity is unchanged by zero padding), but the cleanest setup is
  `EMBED_DIMS=384` + `--recreate`.
- **RRF has two paths.** `hybrid_search` first tries the server-side `rrf`
  retriever (Elasticsearch 8.14+); if the cluster rejects it, it runs BM25 and
  kNN separately and fuses them client-side with the same rank constant (60).
- **ES\|QL is allowlisted.** `esql_query` rejects anything that does not start
  with `FROM scutaris-{satellites,debris,conjunctions,constraints}`.
- Raw and normalized snapshots are written to `data/raw/` and
  `data/normalized/` for fixtures; pass `--no-snapshots` to skip.

## Smoke test (optional)

```bash
python scripts/smoke_test.py            # offline: math + normalization + ES|QL validation
python scripts/smoke_test.py --live     # also hits CelesTrak, Jina, and Elasticsearch
```
