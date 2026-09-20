"use client";

import { useCallback, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { useMissionStore, simTimeMs } from "@/lib/store/useMissionStore";
import { useFilteredConjunctions } from "@/lib/store/selectors";
import { ThreatFeedItem } from "./ThreatFeedItem";

/**
 * Conjunction feed, ordered most severe first.
 *
 * This is the accessible parallel to picking objects in the 3D scene: it is a
 * real listbox, so arrow keys move the active row, Home/End jump, and Enter or
 * Space commits the selection to the same store the canvas writes to.
 */
export function ThreatFeed() {
  const entries = useFilteredConjunctions();
  const selectedConjunctionId = useMissionStore(
    (state) => state.selectedConjunctionId,
  );
  const selectConjunction = useMissionStore((state) => state.selectConjunction);
  const setHovered = useMissionStore((state) => state.setHovered);
  const offsetMinutes = useMissionStore((state) => state.timeline.offsetMinutes);
  const loading = useMissionStore((state) => state.loading);
  const referenceMs = simTimeMs(offsetMinutes);

  const [requestedIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Clamp during render rather than correcting in an effect: filters can
  // shrink the list at any time, and an effect would leave the roving focus
  // pointing past the end for one frame.
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

  return (
    <Panel
      title="Threat feed"
      as="section"
      className="min-h-0 flex-1"
      action={<Badge tone={entries.length > 0 ? "teal" : "neutral"}>{entries.length}</Badge>}
    >
      {entries.length === 0 ? (
        <p className="p-3 font-mono text-[10px] text-ink-faint">
          {loading
            ? "Loading conjunction screening…"
            : "No conjunctions match the active filters."}
        </p>
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
