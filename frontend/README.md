# Scutaris — frontend

Cinematic orbital mission-control interface for the Scutaris orbital-safety
platform: a realistic interactive 3D Earth surrounded by tracked satellites,
debris and conjunction warnings.

**Phase 1 is fully offline.** It makes no network requests, reads no secrets,
and ships no downloaded image assets. All data comes from deterministic
fixtures and all Earth textures are generated procedurally at runtime.

## Getting started

```powershell
cd frontend
npm install
npm run dev
```

Then open <http://localhost:3000>.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5.9 · Tailwind CSS v4 ·
three.js · React Three Fiber · drei · zustand · zod

## What you can do

- Drag to rotate the globe, scroll or pinch to zoom. Rotation is damped.
- The globe rotates gently on its own, pauses the instant you grab it, and
  resumes about three seconds after you let go.
- Click any satellite or debris fragment to select it, or use the threat feed.
- The threat feed is a real listbox: focus it and use arrow keys, Home/End,
  and Enter or Space.
- Filter by orbit class, risk level and object type; search by name, NORAD id,
  breakup parent or CelesTrak group.
- Scrub the 48-hour timeline or play it back at 1×, 10× or 60×. Objects
  propagate and the sun terminator moves with it.

Everything respects `prefers-reduced-motion`: with it enabled, the globe,
clouds and pulse markers are completely static.

## Layout

```
src/
  app/                    App Router entry, design tokens in globals.css
  components/
    globe/                WebGL scene: Earth, atmosphere, clouds, objects,
                          orbit paths, conjunction arcs, camera rig
    hud/                  DOM overlay: top bar, stats, filters, threat feed,
                          selected-threat panel, timeline
    system/               Loader, error boundary, 2D WebGL fallback
    ui/                   Panel, Badge, Stat primitives
  lib/
    config/env.ts         NEXT_PUBLIC_API_BASE_URL only; never secrets
    data/                 dataService seam, mock implementation, fixtures
    hooks/                Catalogue load, timeline playback, media queries
    orbital/              Constants, coordinates, propagation, FIX 6 risk
    store/                zustand store and derived selectors
    textures/             Procedural Earth maps and coastline geometry
    types/                Orbital models, proposed API contract, UI types
public/textures/          No images. CREDITS.md explains why.
```

## Data and the backend

Phase 1 reads everything through `getDataService()` in
`src/lib/data/dataService.ts`. Today that always returns `mockDataService`,
which serves deterministic fixtures from memory.

The TypeScript models in `src/lib/types/orbital.ts` mirror the four
Elasticsearch indices defined in `scripts/setup_elastic.py` field for field, so
Phase 2 can swap in an HTTP client without a translation layer. The one
addition is `kind` (`"satellite" | "debris"`), which is a frontend-only
discriminant: Elasticsearch encodes it as the source index rather than a
document field.

`src/lib/types/api.ts` records the proposed FastAPI contract. Endpoints taken
from `docs/HACKMIT_PLAN_v3.md` are marked as such; the bulk-read endpoints the
globe would need are marked clearly as **proposals for backend review**, not as
endpoints that exist.

To point at a real API later, set `NEXT_PUBLIC_API_BASE_URL` in `.env.local`
and return an HTTP implementation from `getDataService()`. Nothing prefixed
`NEXT_PUBLIC_` is secret — it is inlined into the browser bundle.

### Integration seams

Two places are deliberately built to their final shape and labelled in the UI
as not yet live:

- **Elastic search** — `components/hud/SearchField.tsx`. Currently a local
  substring match, labelled "Local · Elastic P2" with a note explaining that
  Phase 2 routes it to hybrid BM25 + kNN search via `POST /search`.
- **Grok Imagine** — `components/hud/GrokExplainSlot.tsx`. Renders canned prose
  and a correctly sized placeholder frame for the `risk_card` image, badged
  "Grok · P5".

## Honesty notes

- **Altitudes are exaggerated 4×** so orbits are legible. True LEO sits at
  1.06 Earth radii and would be visually flush with the surface. The factor is
  stated in the on-screen legend and defined in `orbital/constants.ts`.
- **Propagation is circular, not SGP4.** `orbital/propagate.ts` is a direct
  port of `propagate_circular` in `backend/ingest.py`, so the frontend and the
  ingest pipeline agree. Real TLE fields ride along on every model for the
  eventual upgrade.
- **The relief map is not real topography** — it is fractal noise over land.
- **Fixtures are synthetic.** NORAD ids and orbital regimes for named
  satellites are real so the scene is recognisable, but element sets are
  representative values, and all debris is generated.
- **Risk levels are never hand-authored.** Every fixture runs through
  `deriveRiskLevel`, the same FIX 6 rule the backend applies.

See `PHASE1_NOTES.md` for deviations from the original plan, and
`public/textures/CREDITS.md` for the texture licensing decision.
