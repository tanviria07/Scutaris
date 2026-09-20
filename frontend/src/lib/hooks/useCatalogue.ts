"use client";

import { useEffect } from "react";
import { getDataService } from "@/lib/data/dataService";
import { useMissionStore } from "@/lib/store/useMissionStore";

/**
 * Loads the catalogue into the store once on mount.
 *
 * The mock service resolves immediately, but the async shape is deliberate:
 * when Phase 2 swaps in the HTTP client, the loading and error states here
 * already do the right thing without touching any component.
 */
export function useCatalogue(): void {
  const setCatalogue = useMissionStore((state) => state.setCatalogue);
  const setLoadError = useMissionStore((state) => state.setLoadError);

  useEffect(() => {
    let cancelled = false;
    const service = getDataService();

    async function load() {
      try {
        const [satellites, debris, conjunctions] = await Promise.all([
          service.listSatellites(),
          service.listDebris(),
          service.listConjunctions(),
        ]);
        if (!cancelled) setCatalogue({ satellites, debris, conjunctions });
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load catalogue",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [setCatalogue, setLoadError]);
}
