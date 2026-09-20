/**
 * Frontend mirrors of the Scutaris Elasticsearch documents.
 *
 * Field names and types track `scripts/setup_elastic.py` exactly so that when
 * Phase 2 swaps the mock service for a real FastAPI client, no remapping layer
 * is needed. Do not rename a field here without changing the index mapping.
 */

import { z } from "zod";

export const ORBIT_CLASSES = ["LEO", "MEO", "GEO", "HEO"] as const;
export type OrbitClass = (typeof ORBIT_CLASSES)[number];

export const RISK_LEVELS = ["critical", "high", "medium", "low"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const OBJECT_KINDS = ["satellite", "debris"] as const;
/**
 * Frontend-only discriminant. Elasticsearch encodes this as the *source index*
 * (`scutaris-satellites` vs `scutaris-debris`), not as a document field, so the
 * Phase 2 HTTP client must set it from the `index` on each hit.
 */
export type ObjectKind = (typeof OBJECT_KINDS)[number];

const orbitalObjectBase = z.object({
  norad_id: z.string(),
  name: z.string(),
  orbit_class: z.enum(ORBIT_CLASSES),
  altitude_km: z.number(),
  inclination_deg: z.number(),
  tle_line1: z.string().nullable(),
  tle_line2: z.string().nullable(),
  epoch_utc: z.string(),
  lat: z.number(),
  lon: z.number(),
  alt_km_now: z.number(),
  text_blob: z.string().optional(),
});

export const satelliteObjectSchema = orbitalObjectBase.extend({
  kind: z.literal("satellite"),
  /** Operator / mission owner. Display-only; not an Elasticsearch field yet. */
  operator: z.string().optional(),
});

export const debrisObjectSchema = orbitalObjectBase.extend({
  kind: z.literal("debris"),
  parent_object: z.string().nullable(),
  rcs_m2: z.number().nullable(),
  group: z.string().nullable(),
});

export const orbitalObjectSchema = z.discriminatedUnion("kind", [
  satelliteObjectSchema,
  debrisObjectSchema,
]);

export type SatelliteObject = z.infer<typeof satelliteObjectSchema>;
export type DebrisObject = z.infer<typeof debrisObjectSchema>;
export type OrbitalObject = z.infer<typeof orbitalObjectSchema>;

export const conjunctionSchema = z.object({
  id: z.string(),
  primary_norad: z.string(),
  secondary_norad: z.string(),
  tca_utc: z.string(),
  miss_km: z.number(),
  pc: z.number(),
  risk_level: z.enum(RISK_LEVELS),
  text_blob: z.string().optional(),
});

export type Conjunction = z.infer<typeof conjunctionSchema>;

export const blackoutWindowSchema = z.object({
  start_utc: z.string(),
  end_utc: z.string(),
  reason: z.string(),
});

export const constraintsDocSchema = z.object({
  norad_id: z.string(),
  fuel_kg: z.number(),
  max_dv_ms: z.number(),
  min_perigee_km: z.number(),
  blackout_windows: z.array(blackoutWindowSchema),
  notes: z.string(),
});

export type BlackoutWindow = z.infer<typeof blackoutWindowSchema>;
export type ConstraintsDoc = z.infer<typeof constraintsDocSchema>;

/**
 * A conjunction joined to its two resolved participants. Built client-side;
 * the API returns the flat `Conjunction` and the objects separately.
 */
export interface ResolvedConjunction {
  conjunction: Conjunction;
  primary: OrbitalObject | null;
  secondary: OrbitalObject | null;
}

/** Narrowing helpers, used in place of scattered `kind === "debris"` checks. */
export function isDebris(object: OrbitalObject): object is DebrisObject {
  return object.kind === "debris";
}

export function isSatellite(object: OrbitalObject): object is SatelliteObject {
  return object.kind === "satellite";
}
