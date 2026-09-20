"use client";

import { useCallback, useRef, useState } from "react";
import type { SearchHit } from "@contracts";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { useMissionStore, simTimeMs } from "@/lib/store/useMissionStore";
import {
  useActiveSearchHits,
  useFilteredConjunctions,
  useObjectIndex,
} from "@/lib/store/selectors";
import { hitKey, indexLabel, parseConjunctionPair } from "@/lib/data/searchHits";
import { ThreatFeedItem } from "./ThreatFeedItem";

function LiveHitRow({
  hit,
  selected,
  onSelect,
}: {
  hit: SearchHit;
  selected: boolean;
  onSelect: (hit: SearchHit) => void;
}) {
  const label = hit.name ?? hit.norad_id ?? hit.id ?? "Untitled hit";
  const meta = [
    indexLabel(hit.index),
    hit.norad_id ? `NORAD ${hit.norad_id}` : null,
    hit.risk_level,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(hit)}
        aria-current={selected ? "true" : undefined}
        className={`w-full px-3 py-2 text-left transition-colors hover:bg-white/[0.04] ${
          selected ? "border-l-2 border-teal bg-teal/[0.07]" : ""
        }`}
      >
        <p className="truncate font-mono text-[11px] text-ink">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[9px] tracking-wide text-ink-faint uppercase">
          {meta}
        </p>
        {hit.snippet ? (
          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-ink-dim">
            {hit.snippet}
          </p>
        ) : null}
      </button>
    </li>
  );
}

/**
 * Conjunction feed, ordered most severe first.
 *
 * During an applied search this lists live SearchHits (name, index, snippet)
 * rather than pairing them with seeded miss / Pc / TCA values.
 */
export function ThreatFeed() {
  const seeded = useFilteredConjunctions();
  const liveHits = useActiveSearchHits();
  const objectIndex = useObjectIndex();
  const selectedConjunctionId = useMissionStore(
    (state) => state.selectedConjunctionId,
  );
  const selectConjunction = useMissionStore((state) => state.selectConjunction);
  const selectSearchHit = useMissionStore((state) => state.selectSearchHit);
  const selectedSearchHit = useMissionStore((state) => state.selectedSearchHit);
  const setHovered = useMissionStore((state) => state.setHovered);
  const offsetMinutes = useMissionStore((state) => state.timeline.offsetMinutes);
  const loading = useMissionStore((state) => state.loading);
  const searchLoading = useMissionStore((state) => state.searchLoading);
  const referenceMs = simTimeMs(offsetMinutes);

  const searchActive = liveHits !== null;
  const entries = searchActive ? [] : seeded;
  const count = searchActive ? liveHits.length : seeded.length;

  const [requestedIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const activeIndex = Math.min(requestedIndex, Math.max(0, entries.length - 1));

  const commit = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (entry) selectConjunction(entry.conjunction);
    },
    [entries, selectConjunction],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      if (entries.length === 0) return;

      let next = activeIndex;
      switch (event.key) {
        case "ArrowDown":
          next = Math.min(entries.length - 1, activeIndex + 1);
          break;
        case "ArrowUp":
          next = Math.max(0, activeIndex - 1);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = entries.length - 1;
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          commit(activeIndex);
          return;
        default:
          return;
      }

      event.preventDefault();
      setActiveIndex(next);
      itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
    },
    [activeIndex, commit, entries.length],
  );

  // A hit is selectable whether or not it exists in the seeded globe; the
  // NORAD id is only passed along when it does, to drive the orbit highlight.
  function selectLiveHit(hit: SearchHit) {
    const pair = parseConjunctionPair(hit);
    const seeded = [hit.norad_id, pair?.primary].find(
      (id): id is string => Boolean(id) && objectIndex.has(id as string),
    );
    selectSearchHit(hit, seeded ?? null);
  }

  let emptyCopy: string | null = null;
  if (searchActive && liveHits.length === 0) {
    emptyCopy = searchLoading
      ? "Searching Elasticsearch…"
      : "No Elasticsearch hits for this query.";
  } else if (!searchActive && entries.length === 0) {
    emptyCopy = loading
      ? "Loading conjunction screening…"
      : "No conjunctions match the active filters.";
  }

  return (
    <Panel
      title={searchActive ? "Search hits" : "Threat feed"}
      as="section"
      className="min-h-0 flex-1"
      action={<Badge tone={count > 0 ? "teal" : "neutral"}>{count}</Badge>}
    >
      {searchActive && liveHits.length > 0 ? (
        <ul
          aria-label="Elasticsearch search hits"
          className="scut-scroll min-h-0 flex-1 divide-y divide-[var(--color-hairline)] overflow-y-auto"
        >
          {liveHits.map((hit, index) => (
            <LiveHitRow
              key={`${hitKey(hit)}:${index}`}
              hit={hit}
              selected={
                selectedSearchHit !== null &&
                hitKey(selectedSearchHit) === hitKey(hit)
              }
              onSelect={selectLiveHit}
            />
          ))}
        </ul>
      ) : emptyCopy ? (
        <p className="p-3 font-mono text-[10px] text-ink-faint">{emptyCopy}</p>
      ) : (
        <ul
          role="listbox"
          tabIndex={0}
          aria-label="Conjunction threat feed"
          aria-activedescendant={undefined}
          onKeyDown={onKeyDown}
          onBlur={() => setHovered(null)}
          className="scut-scroll min-h-0 flex-1 divide-y divide-[var(--color-hairline)] overflow-y-auto"
        >
          {entries.map((entry, index) => (
            <ThreatFeedItem
              key={entry.conjunction.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              entry={entry}
              referenceMs={referenceMs}
              selected={entry.conjunction.id === selectedConjunctionId}
              onSelect={() => {
                setActiveIndex(index);
                commit(index);
              }}
              onHover={setHovered}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
