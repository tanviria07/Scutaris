"use client";

import { useCallback, useEffect, useRef } from "react";
import { getDataService } from "@/lib/data/dataService";
import { mockDataService } from "@/lib/data/mockDataService";
import { collectHitIds } from "@/lib/data/searchHits";
import { useMissionStore } from "@/lib/store/useMissionStore";

const DEBOUNCE_MS = 400;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Debounced catalogue search through `getDataService().search()`.
 *
 * Empty query clears immediately. Enter (via `flushSearch`) skips the timer.
 * A generation counter plus AbortSignal drops stale responses.
 */
export function useSearch(): { flushSearch: () => void } {
  const query = useMissionStore((state) => state.filters.query);
  const beginSearch = useMissionStore((state) => state.beginSearch);
  const setSearchResult = useMissionStore((state) => state.setSearchResult);
  const setSearchError = useMissionStore((state) => state.setSearchError);
  const clearSearch = useMissionStore((state) => state.clearSearch);

  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const runSearch = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const generation = ++generationRef.current;
      abortRef.current?.abort();

      if (!trimmed) {
        clearSearch();
        return;
      }

      const abort = new AbortController();
      abortRef.current = abort;
      beginSearch();

      const request = { query: trimmed, size: 20 as const };
      const primary = getDataService();

      try {
        const response = await primary.search(request, { signal: abort.signal });
        if (generation !== generationRef.current) return;
        const ids = collectHitIds(response.hits);
        setSearchResult({
          query: trimmed,
          response,
          hitNoradIds: ids.noradIds,
          hitDocIds: ids.docIds,
          fallback: false,
          error: response.mock
            ? (response.note ?? "Search returned labeled mock results.")
            : null,
        });
      } catch (error) {
        if (isAbortError(error) || generation !== generationRef.current) return;

        if (primary.name === "http") {
          try {
            const fallback = await mockDataService.search(request);
            if (generation !== generationRef.current) return;
            const ids = collectHitIds(fallback.hits);
            setSearchResult({
              query: trimmed,
              response: {
                ...fallback,
                mock: true,
                note:
                  fallback.note ??
                  "Live search failed; showing local mock results.",
              },
              hitNoradIds: ids.noradIds,
              hitDocIds: ids.docIds,
              fallback: true,
              error:
                error instanceof Error
                  ? `${error.message}. Showing local mock results.`
                  : "Live search failed; showing local mock results.",
            });
            return;
          } catch {
            // Fall through to a hard error with no hits.
          }
        }

        if (generation !== generationRef.current) return;
        setSearchError(
          error instanceof Error ? error.message : "Search failed",
        );
      }
    },
    [beginSearch, clearSearch, setSearchError, setSearchResult],
  );

  const scheduleSearch = useCallback(
    (raw: string, immediate: boolean) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!raw.trim()) {
        generationRef.current += 1;
        abortRef.current?.abort();
        clearSearch();
        return;
      }
      if (immediate) {
        void runSearch(raw);
        return;
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runSearch(raw);
      }, DEBOUNCE_MS);
    },
    [clearSearch, runSearch],
  );

  useEffect(() => {
    scheduleSearch(query, false);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [query, scheduleSearch]);

  const flushSearch = useCallback(() => {
    scheduleSearch(queryRef.current, true);
  }, [scheduleSearch]);

  return { flushSearch };
}
