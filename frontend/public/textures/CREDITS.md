# Texture credits and provenance

**Current status: this directory contains no image files.**

Scutaris Phase 1 ships with **zero downloaded texture assets**. Every Earth map
(day surface, night lights, relief/bump, ocean mask), the cloud layer, the
atmosphere and the star field are generated procedurally at runtime. There is
therefore nothing in this directory to attribute, and the application carries
no third-party image licensing obligations.

This file exists to record that decision, the verification that led to it, and
the exact process required before any image file may be added here.

---

## Why procedural

The Phase 1 rule was: *use only textures whose official source and usage rights
have been individually verified, and record the exact URL and terms for every
asset. If a verified asset is unavailable, create a procedural replacement
rather than downloading from an unknown source.*

A verification pass was run against NASA's imagery sources. It did not produce
a specific downloadable file at a stable URL accompanied by terms that could be
read and quoted, so the procedural path was kept.

### Verification attempts and their outcomes

| Date | URL | Outcome |
| --- | --- | --- |
| 2026-09-19 | `https://visibleearth.nasa.gov/images/57752/blue-marble-land-surface-shallow-water-and-shaded-topography` | Did **not** resolve to an asset page. Redirected to the general NASA Earth Observatory landing page. No image file and no terms were presented. |
| 2026-09-19 | `https://visibleearth.nasa.gov/collection/1484/blue-marble` | Resolved to a collection index listing Blue Marble articles. It links to articles, not to a specific raster file with stated licence terms. No direct asset URL or terms could be captured from it. |
| 2026-09-19 | `https://www.nasa.gov/nasa-brand-center/images-and-media/` | Request timed out; page could not be read. |
| 2026-09-19 | `https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-policy` | Request timed out; page could not be read. |

Because no attempt yielded **(a)** a specific image file URL **and** **(b)**
licence text that could be read and quoted verbatim, no asset was downloaded.

### Two further cautions that informed the decision

- "NASA imagery is public domain" is a useful rule of thumb but is **not**
  universally true. NASA distributes third-party and partner-derived products.
  The Blue Marble bathymetry layers, for example, incorporate GEBCO/BODC
  data, which carries its own attribution requirements. Assuming blanket
  public-domain status across day, night, cloud, normal and specular maps
  would have been wrong.
- Widely circulated "Earth texture" packs found on tutorial sites, asset
  aggregators and CDNs frequently restate NASA imagery without preserving
  provenance, and some add their own terms. None of these qualify as an
  official source.

---

## What generates the maps instead

| Map | Generator | Notes |
| --- | --- | --- |
| Day surface | `src/lib/textures/proceduralEarth.ts` → `createDayMap` | Ocean gradient with fractal bathymetric mottling; landmasses filled from coastline rings, then tinted by a noise-warped climate model (tropical / arid / temperate / boreal / ice). |
| Night lights | `createNightMap` | Radial glows at ~110 hand-placed metropolitan coordinates, plus deterministic satellite towns around each. |
| Relief (bump) | `createReliefMap` | Grayscale; land raised by fractal noise. Not real topography and not presented as such. |
| Ocean mask | `createOceanMask` | Binary land/water mask driving the roughness split so oceans glint and land stays matte. |
| Clouds | `src/components/globe/cloudShader.ts` | 3D simplex noise evaluated in the fragment shader, animated in time. |
| Atmosphere | `src/components/globe/atmosphereShader.ts` | Original Fresnel rim-glow shader. |
| Stars | `@react-three/drei` `<Stars>` | Procedurally generated point field. |

### Coastline geometry

`src/lib/textures/coastlines.ts` contains simplified world coastlines and city
coordinates that were **hand-authored for this project** from general
geographic knowledge, at roughly 1–2 degree fidelity. They are deliberately
**not** derived from Natural Earth, GSHHG, OpenStreetMap or any other dataset,
so no attribution or share-alike obligation attaches to them. They are accurate
enough for continents to be recognisable and nothing depends on their precision.

### Third-party code embedded in shaders

`cloudShader.ts` includes the Ashima Arts / Stefan Gustavson 3D simplex noise
function (`snoise`). This is source code, not an image asset. It is published
under the MIT licence and is attributed inline in that file.

---

## Adding a verified raster later

The procedural maps are the fallback, not a placeholder — the globe is complete
without them. If a verified raster is later adopted as an enhancement:

1. Load the **official** asset page and confirm it serves the specific file.
2. Read the licence/usage terms **on that page** and copy them verbatim into
   the table below, together with the exact file URL and the retrieval date.
3. If the terms require attribution, add the required credit line.
4. Place the file in this directory.
5. Point the matching key in `src/lib/textures/textureManifest.ts`
   (`VERIFIED_RASTERS`) at the public path.

`textureManifest.ts` prefers a declared raster and otherwise falls back to the
generator, so no component code changes.

Do not skip steps 1–3. An asset whose terms were not read is not verified.

### Verified assets in use

_None._

| File | Source page | Direct file URL | Retrieved | Terms (verbatim) |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |
