import type {
  Conjunction,
  ConstraintsDoc,
  DebrisObject,
  SatelliteObject,
} from "@/lib/types/orbital";
import type { SearchRequest, SearchResponse } from "@contracts";
import type { ThreatExplanation } from "@/lib/types/ui";
import { isLiveApiEnabled } from "@/lib/config/env";
import { mockDataService } from "./mockDataService";

/**
 * The single seam between the UI and its data.
 *
 * Every component reads through `getDataService()`. Phase 2 adds an
 * `httpDataService` that talks to FastAPI and returns it from here when
 * `NEXT_PUBLIC_API_BASE_URL` is set; no component changes.
 */
export interface ScutarisDataService {
  readonly name: "mock" | "http";

  listSatellites(): Promise<SatelliteObject[]>;
  listDebris(): Promise<DebrisObject[]>;
  listConjunctions(): Promise<Conjunction[]>;
  getConstraints(noradId: string): Promise<ConstraintsDoc | null>;

  /** Elastic seam. Phase 1 filters locally and reports `mock: true`. */
  search(request: SearchRequest): Promise<SearchResponse>;

  /** Grok Imagine seam. Phase 1 returns canned prose and a null image. */
  explainThreat(conjunction: Conjunction): Promise<ThreatExplanation>;
}

export function getDataService(): ScutarisDataService {
  if (isLiveApiEnabled) {
    // Phase 2: return httpDataService once the FastAPI contract is wired.
    // Until then the mock is the only implementation, so fall through
    // rather than fail at runtime.
    return mockDataService;
  }
  return mockDataService;
}
