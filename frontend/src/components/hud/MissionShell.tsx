"use client";

import dynamic from "next/dynamic";
import { useCatalogue } from "@/lib/hooks/useCatalogue";
import { useSelectionSync } from "@/lib/hooks/useSelectionSync";
import { useTimelinePlayback } from "@/lib/hooks/useTimelinePlayback";
import { useMissionStore } from "@/lib/store/useMissionStore";
import { useSelectedObject } from "@/lib/store/selectors";
import { GlobeLoader } from "@/components/system/GlobeLoader";
import { TopBar } from "./TopBar";
import { StatsStrip } from "./StatsStrip";
import { FilterPanel } from "./FilterPanel";
import { ThreatFeed } from "./ThreatFeed";
import { SelectedThreatPanel } from "./SelectedThreatPanel";
import { SelectedHitPanel } from "./SelectedHitPanel";
import { GrokVisualizeLayer } from "./GrokVisualizeLayer";
import { TimelineControls } from "./TimelineControls";

/**
 * The globe is loaded client-only: three.js has no business in the server
 * bundle, and the scene reads `window` during setup.
 */
const GlobeCanvas = dynamic(
  () => import("@/components/globe/GlobeCanvas").then((mod) => mod.GlobeCanvas),
  {
    ssr: false,
    loading: () => <GlobeLoader />,
  },
);

/**
 * Root layout: a full-bleed globe layer with the HUD floating above it.
 *
 * The HUD root is `pointer-events-none` and each panel opts back in, so
 * dragging in the gaps between panels still rotates the globe underneath.
 */
export function MissionShell() {
  useCatalogue();
  useTimelinePlayback();
  useSelectionSync();

  const selected = useSelectedObject();
  const selectedHit = useMissionStore((state) => state.selectedSearchHit);
  const loadError = useMissionStore((state) => state.loadError);

  // A live hit owns the panel when one is picked: it carries the fields the
  // operator just searched, even when the seeded catalogue has no such orbit.
  const detailPanel = selectedHit ? (
    <SelectedHitPanel hit={selectedHit} />
  ) : selected ? (
    <SelectedThreatPanel />
  ) : null;

  return (
    <main className="scut-scanlines relative h-full w-full overflow-hidden bg-void">
      <div className="absolute inset-0">
        <GlobeCanvas />
      </div>

      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
        <TopBar />

        <div className="pointer-events-none flex min-h-0 flex-1 items-stretch gap-3 px-3 pb-3">
          <div className="pointer-events-none hidden w-[19rem] shrink-0 flex-col gap-3 lg:flex">
            <FilterPanel />
            <ThreatFeed />
          </div>

          <div className="pointer-events-none flex min-w-0 flex-1 flex-col justify-between">
            <div className="pointer-events-none -mx-3">
              <StatsStrip />
            </div>

            <div className="pointer-events-none flex justify-center pb-1">
              <TimelineControls />
            </div>
          </div>

          {detailPanel ? (
            <div className="pointer-events-none absolute inset-y-3 right-3 z-20 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col xl:static xl:inset-auto xl:z-auto xl:w-[22rem] xl:shrink-0">
              {detailPanel}
            </div>
          ) : null}
        </div>
      </div>

      <GrokVisualizeLayer />

      {loadError ? (
        <div
          role="alert"
          className="scut-panel absolute bottom-3 left-1/2 -translate-x-1/2 border-crimson/50 px-3 py-2"
        >
          <p className="font-mono text-[10px] text-crimson">
            Catalogue failed to load: {loadError}
          </p>
        </div>
      ) : null}
    </main>
  );
}
