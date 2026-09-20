# Phase 1 notes — deviations, decisions and verification

Everything created or modified for Frontend Phase 1 lives inside `frontend/`.
No file outside this directory was touched: not the root `.gitignore`, not
`docs/HACKMIT_PLAN_v3.md`, not `backend/`, `scripts/`, or the root
`.env.example`. This file is where the deviation notes live instead.

---

## 1. Deviations from `docs/HACKMIT_PLAN_v3.md`

That document is **not modified**. These are the points where the built
frontend differs from it, and why.

### 1.1 Next.js 16, not Next.js 15

The plan locks "Next.js 15". Current stable at build time is **16.3.5**, which
is what was scaffolded. Nothing in the plan depends on a Next 15 API, and
starting a new app on a superseded major would mean an immediate upgrade.

### 1.2 The globe was built, not reused

The plan says to *"reuse existing R3F globe component (prior art) — do not
rebuild a globe"*. **No globe component exists anywhere in this repository.**
Before Phase 1, the repo contained only `backend/`, `scripts/`, `docs/`,
`docker-compose.yml`, `requirements.txt` and `README.md`. There was no
frontend directory and no prior art to reuse, so the globe is original work
written for this project.

### 1.3 Duplicate plan document

`HACKMIT_PLAN_v3.md` exists at both the repository root and `docs/`. Noted
only; both were left untouched.

---

## 2. Dependency decisions

### 2.1 React and TypeScript pinning turned out to be unnecessary

The plan called for pinning `react`/`react-dom` down to `19.2.8` after
scaffolding, because `@react-three/fiber@9.7.0` declares a peer range of
`react@">=19 <19.3"` and React 19.3.0 had been released.

In practice `create-next-app@16.3.5` **already pins `react` and `react-dom` to
exactly `19.2.8`**, and resolved `typescript@^5` to `5.9.3` rather than the 7.x
line. Both desired versions were therefore already in place and no downgrade
step was needed. The installs completed with no `ERESOLVE` conflict.

Verified versions:

| Package | Version |
| --- | --- |
| `next` | 16.3.5 |
| `react` / `react-dom` | 19.2.8 |
| `typescript` | 5.9.3 |
| `three` | 0.186.0 |
| `@react-three/fiber` | 9.7.0 |
| `@react-three/drei` | 10.7.8 |
| `tailwindcss` | 4.x |

### 2.2 `@types/three` — verified, and the answer is subtle

The instruction was to add `@types/three` **only if the compiler requires it**.

Running `tsc --noEmit` against a file importing `three` **passed without it**.
That is not, however, evidence that it is unnecessary. Investigation showed:

- `three@0.186.0` ships **no** TypeScript declarations of its own.
- `@types/three@0.186.0` was nevertheless present in `node_modules`, pulled in
  **transitively** as a dependency of `maath` and `stats-gl`, which are
  themselves dependencies of `@react-three/drei`, and hoisted to the top level
  where TypeScript could resolve it.

Our own source imports `three` directly, so its types are genuinely required.
Relying on an undeclared transitive package for them is fragile: any change to
drei's dependency tree, or a flatter/stricter install layout, silently breaks
type checking. `@types/three@0.186.0` is therefore declared explicitly as a
`devDependency`, matching the `three` version exactly.

### 2.3 Scaffolding artifacts left in place

`create-next-app`/`next dev` generate `frontend/AGENTS.md` and
`frontend/CLAUDE.md`. They are kept: `AGENTS.md` states that `next dev`
re-adds the block on every run, so deleting it only reproduces an uncommitted
change. Both are inside `frontend/`, so containment is unaffected.

The default `public/*.svg` files (`next.svg`, `vercel.svg`, `file.svg`,
`globe.svg`, `window.svg`) were **removed** — they are unused third-party
branding, and `public/` is asserted elsewhere to contain no images.
`public/` now holds only `textures/CREDITS.md`.

### 2.4 Additional packages

`zustand` (shared state between the WebGL scene and the DOM HUD), `zod`
(runtime validation at the future API boundary), `clsx` + `tailwind-merge`
(class composition), `lucide-react` (icons). `three-stdlib` is used only for
the `OrbitControls` *type*; it arrives transitively with drei.

---

## 3. Textures: procedural, and why

Full detail is in `public/textures/CREDITS.md`, including the exact URLs
attempted and what each returned.

Summary: the verification gate required a specific image file at a stable
official URL **plus** licence terms that could be read and quoted. The NASA
Visible Earth asset page for Blue Marble redirected to a general landing page,
the Blue Marble collection page lists articles rather than assets with terms,
and two NASA usage-policy pages timed out. No asset passed the gate, so
**nothing was downloaded** and the procedural generators are the shipped
implementation rather than a fallback.

This was also the safer call on the merits: "NASA imagery is public domain" is
not universally true (Blue Marble bathymetry incorporates GEBCO/BODC data with
its own attribution requirements), so a blanket assumption across day, night,
cloud, normal and specular maps would have been wrong.

Coastline geometry in `src/lib/textures/coastlines.ts` was **hand-authored for
this project** rather than derived from Natural Earth, GSHHG or OpenStreetMap,
so it carries no attribution obligation at all.

One piece of third-party **code** is embedded: the Ashima Arts / Stefan
Gustavson 3D simplex noise function in `components/globe/cloudShader.ts`, which
is MIT-licensed and attributed inline.

`src/lib/textures/textureManifest.ts` exposes `VERIFIED_RASTERS`, where a
verified image can later be opted in per-map without touching component code.

---

## 4. Implementation notes worth knowing

### 4.1 Two real shader bugs found during visual verification

Both were caught by looking at the rendered output, not by the compiler:

- **View-space vs world-space normals.** three's built-in `vNormal` varying in
  `MeshStandardMaterial` is in *view* space. The night-lights term was dotting
  it against a world-space sun vector, so the terminator swung around as the
  camera orbited and city lights never appeared correctly. `Earth.tsx` now
  injects its own `vScutWorldNormal` varying in the vertex shader.
- **Reversed `smoothstep` edges.** `smoothstep(0.12, -0.22, x)` was being used
  to invert a ramp, but GLSL requires `edge0 < edge1` and the result is
  otherwise undefined. Replaced with `1.0 - smoothstep(-0.25, 0.10, x)`.

### 4.2 Instanced colours

`InstancedMesh.instanceColor` is allocated lazily by three on the first
`setColorAt` call. Guarding the colour-writing effect on `if (!mesh.instanceColor) return`
therefore skipped the very first pass and left every object default white. The
guard now only applies to the `needsUpdate` flag afterwards.

### 4.3 Determinism

All fixtures derive from fixed seeds (`mulberry32`) and a frozen simulation
epoch (`SIM_EPOCH_MS`), never `Math.random()` or `Date.now()`. This is a
correctness requirement, not just tidiness: fixtures are evaluated during
server rendering and again on the client, and any drift would produce a React
hydration mismatch.

### 4.4 React Compiler lint rules

Next 16 ships `react-hooks` rules that reject `setState` inside an effect body
and mutation of memoized values. Rather than suppress them, the affected code
was restructured, and two of the four cases were masking real bugs:

- `SelectedThreatPanel` now keys loaded constraints by NORAD id, so a late
  response for a previous selection is discarded instead of being rendered
  against the wrong object.
- `ThreatFeed` clamps its roving focus index during render, so a filter change
  that shrinks the list cannot leave focus past the end for a frame.
- `useReducedMotion` and `useWebGLSupport` were rewritten onto
  `useSyncExternalStore`, which also removes a first-render flash.

---

## 5. Verification performed

### Commands

```powershell
cd frontend
npx tsc --noEmit     # clean
npm run lint         # clean, no warnings
npm run build        # succeeds, / prerendered as static
```

### Behaviour verified in a real browser

| Check | Result |
| --- | --- |
| Globe renders with recognisable continents | Pass |
| Atmosphere rim, clouds, starfield, sun terminator | Pass |
| Night-side city lights | Pass |
| Auto-rotation | Pass — ~113° over 27 s, matching the configured 0.35°/s |
| `prefers-reduced-motion: reduce` | Pass — frames 35 s apart pixel-identical |
| Click selection from the 3D scene and the feed | Pass |
| Detail panel, constraints, Grok placeholder | Pass |
| Search narrowing (`ISS` → 1/944 objects, 2 conjunctions) | Pass |
| Risk ordering incl. Pc escalation (12.4 km but Pc 2.7e-4 → Critical) | Pass |
| WebGL unavailable → 2D equirectangular fallback, HUD still usable | Pass |
| Console errors / warnings | None |

Note: verifying animation via `canvas.toDataURL()` does **not** work — a WebGL
canvas without `preserveDrawingBuffer` returns a blank buffer, which reads as
"nothing changed" regardless of motion. Both motion checks above were done by
comparing composited screenshots instead.

### Containment

`git status` and `git diff` were checked to confirm that nothing outside
`frontend/` was added, modified or deleted, and that the branch and `HEAD` are
unchanged. No commit, push, merge or branch switch was performed, and no
secrets were read.
