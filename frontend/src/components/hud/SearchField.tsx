"use client";

import { Search, X } from "lucide-react";
import { useMissionStore } from "@/lib/store/useMissionStore";
import {
  useActiveSearchHits,
  useFilteredObjects,
} from "@/lib/store/selectors";
import { useSearch } from "@/lib/hooks/useSearch";
import { isLiveApiEnabled } from "@/lib/config/env";
import { Badge } from "@/components/ui/Badge";

const GOLDEN_QUERY = "high-risk debris near the ISS";

function sourceBadge(args: {
  query: string;
  loading: boolean;
  applied: boolean;
  mock: boolean | null;
  fallback: boolean;
  failed: boolean;
}): { label: string; tone: "teal" | "amber" | "neutral" } {
  const trimmed = args.query.trim();
  if (trimmed && args.failed) {
    return { label: "LOCAL MOCK", tone: "neutral" };
  }
  if (trimmed && (args.loading || !args.applied) && !args.fallback) {
    return { label: "SEARCHING", tone: "amber" };
  }
  if (trimmed && args.applied && args.mock === false && !args.fallback) {
    return { label: "LIVE ES", tone: "teal" };
  }
  if (trimmed && (args.mock === true || args.fallback || args.applied)) {
    return { label: "LOCAL MOCK", tone: "neutral" };
  }
  if (isLiveApiEnabled) {
    return { label: "LIVE ES", tone: "teal" };
  }
  return { label: "LOCAL MOCK", tone: "neutral" };
}

export function SearchField() {
  const query = useMissionStore((state) => state.filters.query);
  const setQuery = useMissionStore((state) => state.setQuery);
  const searchLoading = useMissionStore((state) => state.searchLoading);
  const searchError = useMissionStore((state) => state.searchError);
  const searchResponse = useMissionStore((state) => state.searchResponse);
  const searchFallback = useMissionStore((state) => state.searchFallback);
  const searchAppliedQuery = useMissionStore(
    (state) => state.searchAppliedQuery,
  );
  const { flushSearch } = useSearch();

  const hits = useActiveSearchHits();
  const globeMatches = useFilteredObjects();
  const applied =
    Boolean(query.trim()) &&
    searchAppliedQuery === query.trim() &&
    searchResponse !== null;

  const badge = sourceBadge({
    query,
    loading: searchLoading,
    applied,
    mock: searchResponse ? searchResponse.mock : null,
    fallback: searchFallback,
    failed: Boolean(searchError && !searchLoading && !applied),
  });

  const liveHits = hits?.length ?? 0;
  const globeCount = applied ? globeMatches.length : null;
  const visualizationGap = applied && liveHits > 0 && globeCount === 0;
  const showingMock =
    searchFallback || (applied && searchResponse?.mock === true);

  const note =
    isLiveApiEnabled && !showingMock
      ? "Live Elasticsearch hybrid search. Globe catalogue uses seeded orbit visualization."
      : "Local fixture search. Globe catalogue uses seeded orbit visualization.";

  return (
    <div className="pointer-events-auto flex min-w-0 flex-col gap-1">
      <form
        className="scut-panel flex items-center gap-2 px-2.5 py-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          flushSearch();
        }}
      >
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
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </form>
      <p
        id="search-phase-note"
        className="px-1 font-mono text-[9px] tracking-wide text-ink-faint"
        aria-live="polite"
      >
        {note}
        {applied && searchResponse
          ? ` ${liveHits} hit${liveHits === 1 ? "" : "s"}${
              globeCount === null
                ? ""
                : ` · ${globeCount} seeded object${globeCount === 1 ? "" : "s"} on the globe`
            }.`
          : null}
        {visualizationGap
          ? " Live results exist but their orbit visualization is unavailable in the seeded catalogue."
          : null}
        {searchError ? ` ${searchError}` : null}
      </p>
    </div>
  );
}
