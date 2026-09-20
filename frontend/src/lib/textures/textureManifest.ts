import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";
import {
  createDayMap,
  createNightMap,
  createOceanMask,
  createReliefMap,
} from "./proceduralEarth";

/**
 * Resolves the four Earth maps.
 *
 * Phase 1 ships zero binary assets, so every map is generated procedurally.
 * `VERIFIED_RASTERS` is the single place to opt one in: put a file under
 * `public/textures/`, record its source and terms in
 * `public/textures/CREDITS.md`, and set the path here. Nothing else changes —
 * `Earth.tsx` consumes the result identically either way.
 *
 * Leaving an entry `null` is not a stub or a TODO; it is the shipped state.
 */
export const VERIFIED_RASTERS: Record<EarthMapKind, string | null> = {
  day: null,
  night: null,
  relief: null,
  oceanMask: null,
};

export type EarthMapKind = "day" | "night" | "relief" | "oceanMask";

export interface EarthTextures {
  day: Texture;
  night: Texture;
  relief: Texture;
  oceanMask: Texture;
  /** True when every map came from the procedural generator. */
  allProcedural: boolean;
}

function toTexture(
  canvas: HTMLCanvasElement,
  { srgb }: { srgb: boolean },
): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  // Equirectangular maps must wrap in longitude or the seam tears.
  texture.wrapS = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds every Earth map. Call once and memoize: the generators rasterise a
 * 2048x1024 canvas and run per-pixel noise, which costs a few hundred ms.
 */
export function createEarthTextures(): EarthTextures {
  const day = toTexture(createDayMap(), { srgb: true });
  const night = toTexture(createNightMap(), { srgb: true });
  // Relief and the ocean mask are data, not colour: keep them linear.
  const relief = toTexture(createReliefMap(), { srgb: false });
  const oceanMask = toTexture(createOceanMask(), { srgb: false });

  const allProcedural = Object.values(VERIFIED_RASTERS).every(
    (path) => path === null,
  );

  return { day, night, relief, oceanMask, allProcedural };
}

export function disposeEarthTextures(textures: EarthTextures): void {
  textures.day.dispose();
  textures.night.dispose();
  textures.relief.dispose();
  textures.oceanMask.dispose();
}
