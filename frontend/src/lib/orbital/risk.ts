import type { RiskLevel } from "@/lib/types/orbital";

/**
 * FIX 6 risk thresholds, locked in docs/HACKMIT_PLAN_v3.md.
 *
 *   miss_km <  0.5  -> CRITICAL
 *   miss_km < 10    -> HIGH
 *   miss_km < 40    -> MEDIUM
 *   miss_km >= 40   -> LOW
 *   Pc > 1e-4       -> escalate to CRITICAL regardless of miss distance
 *
 * The backend applies the same rule at write time in `build_conjunctions.py`
 * and again inside `assess_risk`. Keep all three in step.
 */
export const PC_CRITICAL_THRESHOLD = 1e-4;
export const MISS_KM_CRITICAL = 0.5;
export const MISS_KM_HIGH = 10;
export const MISS_KM_MEDIUM = 40;

export function deriveRiskLevel(missKm: number, pc: number): RiskLevel {
  if (pc > PC_CRITICAL_THRESHOLD) return "critical";
  if (missKm < MISS_KM_CRITICAL) return "critical";
  if (missKm < MISS_KM_HIGH) return "high";
  if (missKm < MISS_KM_MEDIUM) return "medium";
  return "low";
}

/** Ordering for sorts and for "most severe wins" reductions. */
export const RISK_SEVERITY: Record<RiskLevel, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Hex colors shared by the DOM HUD and the WebGL scene, from FIX F. */
export const RISK_COLOR: Record<RiskLevel, string> = {
  critical: "#ef4444",
  high: "#fbbf24",
  medium: "#5eead4",
  low: "#64748b",
};

export function compareRiskDescending(a: RiskLevel, b: RiskLevel): number {
  return RISK_SEVERITY[b] - RISK_SEVERITY[a];
}

export function mostSevere(levels: readonly RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (worst, level) => (RISK_SEVERITY[level] > RISK_SEVERITY[worst] ? level : worst),
    "low",
  );
}
