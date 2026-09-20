"use client";

import { Search, X } from "lucide-react";
import { useMissionStore } from "@/lib/store/useMissionStore";
import { PhaseBadge } from "@/components/ui/Badge";

const GOLDEN_QUERY = "high-risk debris near the ISS";

/**
 * ELASTIC SEAM.
 *
 * Phase 1 filters the in-memory catalogue locally and says so in the UI. The
 * input, the query state and the result plumbing are already the shape the
 * real thing needs, so Phase 2 replaces the body of `setQuery`'s consumer with
 * `getDataService().search()` against `POST /search` (hybrid BM25 + kNN fused
 * with RRF) without touching this component's markup.
 */
export function SearchField() {
  const query = useMissionStore((state) => state.filters.query);
  const setQuery = useMissionStore((state) => state.setQuery);

  return (
    <div className="pointer-events-auto flex min-w-0 flex-col gap-1">
      <div className="scut-panel flex items-center gap-2 px-2.5 py-1.5">
        <Search className="size-3.5 shrink-0 text-teal" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search catalogue — try "${GOLDEN_QUERY}"`}
          aria-label="Search satellites, debris and conjunctions"
          aria-describedby="search-phase-note"
          className="w-full min-w-0 bg-transparent font-mono text-xs text-ink placeholder:text-ink-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="shrink-0 text-ink-faint transition-colors hover:text-teal"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <PhaseBadge phase="Local · Elastic P2" />
      </div>
      <p
        id="search-phase-note"
        className="px-1 font-mono text-[9px] tracking-wide text-ink-faint"
      >
        Local substring match over mock data. Phase 2 routes this to
        Elasticsearch hybrid search (BM25 + kNN, RRF) via POST /search.
      </p>
    </div>
  );
}
