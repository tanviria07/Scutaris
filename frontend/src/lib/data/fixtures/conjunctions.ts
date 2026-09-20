import type { Conjunction } from "@/lib/types/orbital";
import { deriveRiskLevel } from "@/lib/orbital/risk";
import { MOCK_DEBRIS } from "./debris";
import { MOCK_SATELLITES } from "./satellites";
import { createRng, SIM_EPOCH_MS } from "./rng";

/**
 * Synthetic conjunction screening results.
 *
 * `risk_level` is never authored by hand: it always comes from
 * `deriveRiskLevel`, the same FIX 6 rule the backend applies at write time.
 * The miss distances and Pc values below are chosen to land a deliberate
 * spread across all four severities, including Pc-driven escalation.
 */

interface ConjunctionSeed {
  primaryNorad: string;
  /** Index into the debris cluster ranges, resolved to a real fixture below. */
  secondaryOffset: number;
  missKm: number;
  pc: number;
  /** Minutes from the simulation epoch to time of closest approach. */
  tcaOffsetMinutes: number;
}

const SEEDS: readonly ConjunctionSeed[] = [
  // Critical by miss distance: the golden-query scenario, debris near the ISS.
  { primaryNorad: "25544", secondaryOffset: 17, missKm: 0.312, pc: 4.1e-5, tcaOffsetMinutes: 94 },
  // Critical by Pc escalation: comfortable miss, unacceptable probability.
  { primaryNorad: "40697", secondaryOffset: 655, missKm: 12.4, pc: 2.7e-4, tcaOffsetMinutes: 212 },
  { primaryNorad: "48274", secondaryOffset: 233, missKm: 0.474, pc: 6.8e-5, tcaOffsetMinutes: 331 },

  // High
  { primaryNorad: "25544", secondaryOffset: 402, missKm: 3.86, pc: 1.9e-5, tcaOffsetMinutes: 508 },
  { primaryNorad: "44713", secondaryOffset: 88, missKm: 6.12, pc: 8.4e-6, tcaOffsetMinutes: 147 },
  { primaryNorad: "43013", secondaryOffset: 712, missKm: 8.03, pc: 5.2e-6, tcaOffsetMinutes: 623 },
  { primaryNorad: "39084", secondaryOffset: 601, missKm: 4.47, pc: 1.1e-5, tcaOffsetMinutes: 775 },
  { primaryNorad: "53807", secondaryOffset: 141, missKm: 9.28, pc: 3.6e-6, tcaOffsetMinutes: 268 },

  // Medium
  { primaryNorad: "20580", secondaryOffset: 45, missKm: 18.7, pc: 7.0e-7, tcaOffsetMinutes: 402 },
  { primaryNorad: "27424", secondaryOffset: 820, missKm: 24.1, pc: 4.2e-7, tcaOffsetMinutes: 915 },
  { primaryNorad: "25994", secondaryOffset: 512, missKm: 31.5, pc: 2.8e-7, tcaOffsetMinutes: 1104 },
  { primaryNorad: "40697", secondaryOffset: 305, missKm: 37.2, pc: 1.6e-7, tcaOffsetMinutes: 1288 },

  // Low
  { primaryNorad: "44713", secondaryOffset: 690, missKm: 52.6, pc: 5.0e-8, tcaOffsetMinutes: 690 },
  { primaryNorad: "28474", secondaryOffset: 912, missKm: 88.4, pc: 1.2e-8, tcaOffsetMinutes: 1440 },
  { primaryNorad: "41866", secondaryOffset: 355, missKm: 143.9, pc: 3.0e-9, tcaOffsetMinutes: 1680 },
  { primaryNorad: "20580", secondaryOffset: 777, missKm: 61.3, pc: 4.4e-8, tcaOffsetMinutes: 1012 },
];

function buildConjunctions(): Conjunction[] {
  const rng = createRng(20260919);
  const satelliteById = new Map(MOCK_SATELLITES.map((s) => [s.norad_id, s]));

  return SEEDS.map((seed, index) => {
    const primary = satelliteById.get(seed.primaryNorad);
    const secondary = MOCK_DEBRIS[seed.secondaryOffset % MOCK_DEBRIS.length];

    // Deterministic seconds jitter so TCA timestamps do not all land on :00.
    const jitterSec = Math.floor(rng.range(0, 60));
    const tcaMs = SIM_EPOCH_MS + seed.tcaOffsetMinutes * 60_000 + jitterSec * 1000;
    const tcaIso = new Date(tcaMs).toISOString();

    const riskLevel = deriveRiskLevel(seed.missKm, seed.pc);
    const primaryName = primary?.name ?? seed.primaryNorad;

    return {
      id: `CDM-${String(index + 1).padStart(4, "0")}`,
      primary_norad: seed.primaryNorad,
      secondary_norad: secondary.norad_id,
      tca_utc: tcaIso,
      miss_km: seed.missKm,
      pc: seed.pc,
      risk_level: riskLevel,
      text_blob: `Conjunction between ${primaryName} (NORAD ${seed.primaryNorad}) and ${secondary.name} (NORAD ${secondary.norad_id}). Closest approach ${tcaIso} at ${seed.missKm} km with collision probability ${seed.pc.toExponential(1)}. Risk ${riskLevel}.`,
    } satisfies Conjunction;
  });
}

export const MOCK_CONJUNCTIONS: readonly Conjunction[] = buildConjunctions();
