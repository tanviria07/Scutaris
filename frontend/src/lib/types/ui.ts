import type { ObjectKind, OrbitClass, RiskLevel } from "./orbital";

/** Active HUD filters. Empty array means "no constraint on this facet". */
export interface Filters {
  orbitClasses: OrbitClass[];
  riskLevels: RiskLevel[];
  kinds: ObjectKind[];
  /** Free-text query from the search field. */
  query: string;
}

export const EMPTY_FILTERS: Filters = {
  orbitClasses: [],
  riskLevels: [],
  kinds: [],
  query: "",
};

export type PlaybackSpeed = 1 | 10 | 60;

export interface TimelineState {
  /** Offset from the simulation epoch, in minutes. Scrubbed by the UI. */
  offsetMinutes: number;
  playing: boolean;
  speed: PlaybackSpeed;
}

/** What the user currently has selected, if anything. */
export interface Selection {
  noradId: string | null;
  /** Set when the selection came from a conjunction rather than an object. */
  conjunctionId: string | null;
}

export type QualityTier = "high" | "medium" | "low";

/**
 * Natural-language explanation of a single threat, rendered by GrokExplainSlot.
 * Frontend-only — not part of the FastAPI contract in contracts/types.ts.
 */
export interface ThreatExplanation {
  conjunctionId: string;
  headline: string;
  paragraphs: string[];
  recommendation: string;
  /** Populated only once Grok Imagine is wired up. */
  imageUrl: string | null;
  source: "mock" | "grok";
}
