import type { ConstraintsDoc } from "@/lib/types/orbital";
import { MOCK_SATELLITES } from "./satellites";
import { createRng, SIM_EPOCH_MS } from "./rng";

/**
 * Maneuver constraints, one document per named satellite.
 *
 * Mirrors the `scutaris-constraints` mapping: fuel budget, max delta-v, a
 * minimum perigee floor and nested blackout windows. Phase 5's SAFETY agent
 * validates proposed maneuvers against exactly these fields.
 */

const BLACKOUT_REASONS = [
  "ground-station handover",
  "eclipse thermal limit",
  "payload calibration pass",
  "downlink window",
  "attitude reconfiguration",
] as const;

function buildConstraints(): ConstraintsDoc[] {
  const rng = createRng(0xc025);

  return MOCK_SATELLITES.map((satellite) => {
    const windowCount = rng.int(1, 3);
    const blackouts = Array.from({ length: windowCount }, (_, index) => {
      const startMs =
        SIM_EPOCH_MS + (index * 8 + rng.range(2, 6)) * 3_600_000;
      const durationMs = rng.range(0.5, 2.5) * 3_600_000;

      return {
        start_utc: new Date(startMs).toISOString(),
        end_utc: new Date(startMs + durationMs).toISOString(),
        reason: rng.pick(BLACKOUT_REASONS),
      };
    });

    // Crewed platforms carry far more propellant than a smallsat.
    const crewed = satellite.norad_id === "25544" || satellite.norad_id === "48274";
    const fuel = crewed ? rng.range(1800, 3200) : rng.range(12, 180);
    const maxDv = crewed ? rng.range(12, 40) : rng.range(1.5, 14);

    return {
      norad_id: satellite.norad_id,
      fuel_kg: Number(fuel.toFixed(1)),
      max_dv_ms: Number(maxDv.toFixed(2)),
      min_perigee_km: Number(
        Math.max(180, satellite.altitude_km - rng.range(40, 120)).toFixed(1),
      ),
      blackout_windows: blackouts,
      notes: crewed
        ? "Crewed platform. Any maneuver requires flight-control concurrence and a debris-avoidance conjunction assessment at least 24 h before TCA."
        : "Automated station-keeping permitted within the delta-v budget. Escalate to operator review if the maneuver breaches the perigee floor.",
    } satisfies ConstraintsDoc;
  });
}

export const MOCK_CONSTRAINTS: readonly ConstraintsDoc[] = buildConstraints();
