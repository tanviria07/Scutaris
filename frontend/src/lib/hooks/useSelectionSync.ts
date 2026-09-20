"use client";

import { useEffect, useMemo } from "react";
import { useMissionStore } from "@/lib/store/useMissionStore";
import {
  useFilteredConjunctions,
  useFilteredObjects,
} from "@/lib/store/selectors";

/**
 * Drops a selection once it leaves the visible result set.
 *
 * `selectedNoradId` resolves against the whole seeded catalogue, so without
 * this the Selected Threat panel and its orbit highlight would survive a
 * search response or a filter change that no longer contains the object.
 */
export function useSelectionSync(): void {
  const selectedNoradId = useMissionStore((state) => state.selectedNoradId);
  const selectedConjunctionId = useMissionStore(
    (state) => state.selectedConjunctionId,
  );
  const clearSelection = useMissionStore((state) => state.clearSelection);
  const loading = useMissionStore((state) => state.loading);

  const objects = useFilteredObjects();
  const conjunctions = useFilteredConjunctions();

  const visibleNorads = useMemo(
    () => new Set(objects.map((object) => object.norad_id)),
    [objects],
  );
  const visibleConjunctionIds = useMemo(
    () => new Set(conjunctions.map((entry) => entry.conjunction.id)),
    [conjunctions],
  );

  useEffect(() => {
    // The catalogue is empty before it loads; nothing is stale yet.
    if (loading) return;

    const objectStale =
      selectedNoradId !== null && !visibleNorads.has(selectedNoradId);
    const conjunctionStale =
      selectedConjunctionId !== null &&
      !visibleConjunctionIds.has(selectedConjunctionId);

    if (objectStale || conjunctionStale) clearSelection();
  }, [
    loading,
    selectedNoradId,
    selectedConjunctionId,
    visibleNorads,
    visibleConjunctionIds,
    clearSelection,
  ]);
}
