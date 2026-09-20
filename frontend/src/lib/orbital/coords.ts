import { Vector3 } from "three";
import {
  ALTITUDE_EXAGGERATION,
  EARTH_RADIUS_KM,
  EARTH_RADIUS_SCENE,
} from "./constants";

/**
 * Geographic-to-scene conversion.
 *
 * Scene convention: +Y is the north pole, and lon 0 faces +Z. This matches the
 * default UV layout of an equirectangular texture on a three.js SphereGeometry,
 * so continents land where they should without a texture offset.
 */

/** Scene-space radius for an altitude in km, including display exaggeration. */
export function altitudeToRadius(altitudeKm: number): number {
  const trueRadii = (EARTH_RADIUS_KM + altitudeKm) / EARTH_RADIUS_KM;
  const excess = trueRadii - EARTH_RADIUS_SCENE;
  return EARTH_RADIUS_SCENE + excess * ALTITUDE_EXAGGERATION;
}

/** Inverse of `altitudeToRadius`, for reading a picked point back to km. */
export function radiusToAltitude(radius: number): number {
  const excess = (radius - EARTH_RADIUS_SCENE) / ALTITUDE_EXAGGERATION;
  return (EARTH_RADIUS_SCENE + excess) * EARTH_RADIUS_KM - EARTH_RADIUS_KM;
}

/**
 * `(lat, lon, alt_km_now)` -> scene position. These are exactly the three
 * fields the backend already stores on every document.
 *
 * Pass `target` to write in place and avoid allocating inside a frame loop.
 */
export function latLonAltToVec3(
  latDeg: number,
  lonDeg: number,
  altitudeKm: number,
  target = new Vector3(),
): Vector3 {
  const radius = altitudeToRadius(altitudeKm);
  return latLonRadiusToVec3(latDeg, lonDeg, radius, target);
}

/** Same mapping but with an explicit scene radius, used for orbit sampling. */
export function latLonRadiusToVec3(
  latDeg: number,
  lonDeg: number,
  radius: number,
  target = new Vector3(),
): Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);

  return target.set(
    radius * cosLat * Math.sin(lon),
    radius * Math.sin(lat),
    radius * cosLat * Math.cos(lon),
  );
}

/** Scene position -> `{ lat, lon, altitudeKm }`. Inverse of the above. */
export function vec3ToLatLonAlt(position: Vector3): {
  lat: number;
  lon: number;
  altitudeKm: number;
} {
  const radius = position.length();
  if (radius === 0) return { lat: 0, lon: 0, altitudeKm: -EARTH_RADIUS_KM };

  return {
    lat: (Math.asin(position.y / radius) * 180) / Math.PI,
    lon: (Math.atan2(position.x, position.z) * 180) / Math.PI,
    altitudeKm: radiusToAltitude(radius),
  };
}

/** Wrap a longitude into [-180, 180), matching `_wrap_longitude` in the backend. */
export function wrapLongitude(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}
