import type {
  Conjunction,
  ConstraintsDoc,
  DebrisObject,
  SatelliteObject,
} from "@/lib/types/orbital";
import type { SearchRequest, SearchResponse } from "@contracts";
import type { ThreatExplanation } from "@/lib/types/ui";
import { isLiveApiEnabled } from "@/lib/config/env";
import { httpDataService } from "./httpDataService";
import { mockDataService } from "./mockDataService";

export interface SearchInit {
  signal?: AbortSignal;
}

/**
 * The single seam between the UI and its data.
 *
 * `search()` is live when the public API base URL is set; catalogue lists
 * remain seeded until the backend grows bulk-read endpoints.
 */
export interface ScutarisDataService {
  readonly name: "mock" | "http";

  listSatellites(): Promise<SatelliteObject[]>;
  listDebris(): Promise<DebrisObject[]>;
  listConjunctions(): Promise<Conjunction[]>;
  getConstraints(noradId: string): Promise<ConstraintsDoc | null>;

  search(request: SearchRequest, init?: SearchInit): Promise<SearchResponse>;

  /** Grok Imagine seam. Still mock — not wired in this search-only change. */
  explainThreat(conjunction: Conjunction): Promise<ThreatExplanation>;
}

export function getDataService(): ScutarisDataService {
  if (isLiveApiEnabled) {
    return httpDataService;
  }
  return mockDataService;
}
