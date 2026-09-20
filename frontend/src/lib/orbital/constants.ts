/** Physical and scene constants. Physical values match `backend/ingest.py`. */

/** WGS-84 equatorial radius, identical to EARTH_RADIUS_KM in backend/ingest.py. */
export const EARTH_RADIUS_KM = 6378.137;

/** Standard gravitational parameter, identical to MU_EARTH_KM3_S2 in the backend. */
export const MU_EARTH_KM3_S2 = 398600.4418;

export const SECONDS_PER_DAY = 86400;

/** Earth is exactly one scene unit, so all radii are multiples of Earth radii. */
export const EARTH_RADIUS_SCENE = 1;

/**
 * Altitude exaggeration for display.
 *
 * A real 400 km LEO shell sits at 1.063 Earth radii, which is visually flush
 * with the surface and unreadable. Multiplying altitude by this factor lifts
 * LEO to ~1.25 so orbits, paths and conjunctions are legible. The legend states
 * the factor so the view stays honest.
 */
export const ALTITUDE_EXAGGERATION = 4;

/** Shell radii for the cloud and atmosphere layers, in scene units. */
export const CLOUD_RADIUS = 1.006;
export const ATMOSPHERE_RADIUS = 1.02;

/** Camera distance clamps, in scene units. */
export const CAMERA_MIN_DISTANCE = 1.35;
export const CAMERA_MAX_DISTANCE = 8;
export const CAMERA_INITIAL_POSITION: readonly [number, number, number] = [
  2.0, 1.15, 2.6,
];

/** Auto-rotation speed in degrees per second, and idle delay before resuming. */
export const AUTO_ROTATE_DEG_PER_SEC = 0.35;
export const AUTO_ROTATE_RESUME_MS = 3000;

/** Earth's axial tilt, applied to the globe group for a believable sun angle. */
export const EARTH_TILT_RAD = (23.44 * Math.PI) / 180;

/** Max simultaneous orbit paths, and samples per path. */
export const MAX_ORBIT_PATHS = 20;
export const ORBIT_PATH_SAMPLES = 128;
