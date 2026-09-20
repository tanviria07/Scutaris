import type { SearchRequest, SearchResponse } from "@contracts";
import { env } from "@/lib/config/env";
import type { ScutarisDataService, SearchInit } from "./dataService";
import { mockDataService } from "./mockDataService";

/**
 * HTTP data service.
 *
 * `search()` is live: it POSTs the locked `SearchRequest` shape to FastAPI
 * `POST /search` (hybrid BM25 + kNN, RRF). Catalogue visualization is not.
 * `listSatellites`, `listDebris`, `listConjunctions`, `getConstraints`, and
 * `explainThreat` still delegate to the seeded mock service because the
 * backend has no bulk catalogue, constraints, or explain endpoints yet.
 * Do not treat SearchHit rows as a replacement globe catalogue.
 */

function isSearchResponse(value: unknown): value is SearchResponse {
  if (value === null || typeof value !== "object") return false;
  const payload = value as Partial<SearchResponse>;
  return Array.isArray(payload.hits) && typeof payload.mock === "boolean";
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export const httpDataService: ScutarisDataService = {
  name: "http",

  listSatellites: () => mockDataService.listSatellites(),
  listDebris: () => mockDataService.listDebris(),
  listConjunctions: () => mockDataService.listConjunctions(),
  getConstraints: (noradId) => mockDataService.getConstraints(noradId),
  explainThreat: (conjunction) => mockDataService.explainThreat(conjunction),

  async search(
    request: SearchRequest,
    init?: SearchInit,
  ): Promise<SearchResponse> {
    let response: Response;
    try {
      response = await fetch(`${env.apiBaseUrl}/search`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: request.query,
          size: request.size ?? 20,
          ...(request.filters ? { filters: request.filters } : {}),
        }),
        signal: init?.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new Error("Live search request failed");
    }

    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    if (!isSearchResponse(payload)) {
      throw new Error("Search returned an unexpected payload");
    }
    return payload;
  },
};
