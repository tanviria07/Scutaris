import { CITY_LIGHTS, COASTLINES, type Ring } from "./coastlines";
import { mulberry32 } from "@/lib/data/fixtures/rng";

/**
 * Procedurally generated Earth maps.
 *
 * This is the guaranteed baseline: the globe renders correctly with no
 * downloaded imagery at all. Every map here is drawn at runtime onto an
 * offscreen canvas from the hand-authored coastline rings, so the app carries
 * no binary assets and no attribution obligations.
 *
 * If a verified raster is later placed in `public/textures/`, the manifest in
 * `textureManifest.ts` prefers it and these become the fallback. The shader
 * consumes both identically.
 */

const DEG_TO_X = (lon: number, width: number) => ((lon + 180) / 360) * width;
const DEG_TO_Y = (lat: number, height: number) => ((90 - lat) / 180) * height;

/** Deterministic 2D value noise, smoothed with a cubic falloff. */
function makeNoise(seed: number) {
  const random = mulberry32(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i += 1) table[i] = random();

  const at = (x: number, y: number) =>
    table[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  return function noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);

    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);

    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

/** Sum several octaves of value noise into fractal detail. */
function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves = 4,
): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;

  for (let i = 0; i < octaves; i += 1) {
    value += noise(x * frequency, y * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

type RGB = [number, number, number];

/** GLSL-style smoothstep, used to blend climate bands without hard seams. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mixChannel(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, value));
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function tracePath(
  context: CanvasRenderingContext2D,
  ring: Ring,
  width: number,
  height: number,
): void {
  context.beginPath();
  ring.forEach(([lon, lat], index) => {
    const x = DEG_TO_X(lon, width);
    const y = DEG_TO_Y(lat, height);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

/**
 * Daytime surface colour.
 *
 * Ocean is a depth-varying blue, land is filled then tinted by latitude so
 * deserts, temperate belts, boreal forest and ice read differently, with
 * fractal noise breaking up the flat fills.
 */
export function createDayMap(width = 2048, height = 1024): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const noise = makeNoise(0x0cea7);

  // --- Ocean base ---
  const ocean = context.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, "#0a2540");
  ocean.addColorStop(0.28, "#0d3b63");
  ocean.addColorStop(0.5, "#11507f");
  ocean.addColorStop(0.72, "#0d3b63");
  ocean.addColorStop(1, "#0a2540");
  context.fillStyle = ocean;
  context.fillRect(0, 0, width, height);

  // Subtle bathymetric mottling so the sea is not a flat sweep.
  const oceanNoise = context.getImageData(0, 0, width, height);
  const oceanPixels = oceanNoise.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n = fbm(noise, (x / width) * 24, (y / height) * 12, 3) - 0.5;
      const index = (y * width + x) * 4;
      oceanPixels[index] += n * 18;
      oceanPixels[index + 1] += n * 22;
      oceanPixels[index + 2] += n * 26;
    }
  }
  context.putImageData(oceanNoise, 0, 0);

  // --- Landmasses ---
  context.save();
  context.fillStyle = "#3f6b3a";
  for (const ring of COASTLINES) {
    tracePath(context, ring, width, height);
    context.fill("nonzero");
  }
  context.restore();

  // Tint land by latitude and noise; leave ocean pixels untouched.
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;

  for (let y = 0; y < height; y += 1) {
    const lat = 90 - (y / height) * 180;
    const absLat = Math.abs(lat);

    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      // Identify land by the flat fill colour laid down above.
      const isLand =
        pixels[index] === 0x3f &&
        pixels[index + 1] === 0x6b &&
        pixels[index + 2] === 0x3a;
      if (!isLand) continue;

      const n = fbm(noise, (x / width) * 40, (y / height) * 20, 5);

      // Perturb the latitude used for the climate lookup, otherwise the zone
      // boundaries render as ruler-straight horizontal stripes.
      const warp = fbm(noise, (x / width) * 7 + 31, (y / height) * 4 + 17, 3);
      const climateLat = absLat + (warp - 0.5) * 26;

      // Blend continuously between climate bands rather than stepping.
      const tropical = 1 - smoothstep(18, 32, climateLat);
      const arid =
        smoothstep(20, 31, climateLat) * (1 - smoothstep(36, 48, climateLat));
      const temperate =
        smoothstep(36, 46, climateLat) * (1 - smoothstep(54, 64, climateLat));
      const boreal =
        smoothstep(54, 63, climateLat) * (1 - smoothstep(66, 74, climateLat));
      const ice = smoothstep(66, 76, climateLat);

      // Within the arid band, only part of it is actually desert.
      const desertness = Math.min(1, Math.max(0, n * 1.8 - 0.35));
      const aridColor: RGB = [
        mixChannel(104, 196, desertness),
        mixChannel(112, 168, desertness),
        mixChannel(66, 104, desertness),
      ];

      let r =
        tropical * 54 + arid * aridColor[0] + temperate * 74 + boreal * 96 + ice * 220;
      let g =
        tropical * 92 + arid * aridColor[1] + temperate * 102 + boreal * 108 + ice * 228;
      let b =
        tropical * 44 + arid * aridColor[2] + temperate * 56 + boreal * 86 + ice * 234;

      // Normalise: the bands overlap, so the weights do not sum to exactly 1.
      const weight = tropical + arid + temperate + boreal + ice || 1;
      r = r / weight + (n - 0.5) * 42;
      g = g / weight + (n - 0.5) * 46;
      b = b / weight + (n - 0.5) * 30;

      pixels[index] = clamp255(r);
      pixels[index + 1] = clamp255(g);
      pixels[index + 2] = clamp255(b);
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Night-side emissive map: city lights on black.
 *
 * Each seed city is a radial glow; a few dimmer satellites are scattered
 * around the big ones so coastlines and conurbations are suggested rather
 * than reduced to isolated dots.
 */
export function createNightMap(width = 2048, height = 1024): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "lighter";

  const random = mulberry32(0x1117);

  for (const [lon, lat, intensity] of CITY_LIGHTS) {
    const x = DEG_TO_X(lon, width);
    const y = DEG_TO_Y(lat, height);
    // Kept small: a metro should read as a tight cluster of light, not a
    // continent-sized bloom once it is stretched over the sphere.
    const radius = 3 + intensity * 6;

    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, 228, 168, ${0.5 * intensity})`);
    glow.addColorStop(0.3, `rgba(255, 186, 96, ${0.16 * intensity})`);
    glow.addColorStop(1, "rgba(255, 150, 60, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    // Satellite towns around each metro.
    const satellites = Math.floor(3 + intensity * 9);
    for (let i = 0; i < satellites; i += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * (0.5 + random() * 2.2);
      const sx = x + Math.cos(angle) * distance;
      const sy = y + Math.sin(angle) * distance * 0.6;
      const sr = 0.8 + random() * 1.8;

      const spark = context.createRadialGradient(sx, sy, 0, sx, sy, sr);
      spark.addColorStop(0, `rgba(255, 214, 150, ${0.34 * intensity})`);
      spark.addColorStop(1, "rgba(255, 170, 80, 0)");
      context.fillStyle = spark;
      context.beginPath();
      context.arc(sx, sy, sr, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.globalCompositeOperation = "source-over";
  return canvas;
}

/**
 * Grayscale relief, used as a bump map.
 *
 * Mid grey is sea level; land is raised by fractal noise so mountain belts
 * catch the terminator. Not real topography, and not presented as such.
 */
export function createReliefMap(width = 1024, height = 512): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.fillStyle = "#3a3a3a";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffffff";
  for (const ring of COASTLINES) {
    tracePath(context, ring, width, height);
    context.fill("nonzero");
  }

  const noise = makeNoise(0x7e44a1);
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const isLand = pixels[index] > 200;
      const n = fbm(noise, (x / width) * 60, (y / height) * 30, 5);
      const value = isLand ? 110 + n * 145 : 44 + n * 26;

      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
    }
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Ocean mask: white where there is water, black over land.
 *
 * Drives roughness so the sea glints under the sun and land stays matte,
 * which is most of what sells a realistic Earth at this scale.
 */
export function createOceanMask(width = 1024, height = 512): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#000000";
  for (const ring of COASTLINES) {
    tracePath(context, ring, width, height);
    context.fill("nonzero");
  }

  return canvas;
}
