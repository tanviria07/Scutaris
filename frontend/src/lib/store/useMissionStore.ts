"use client";

import { create } from "zustand";
import type {
  Conjunction,
  DebrisObject,
  OrbitalObject,
  SatelliteObject,
} from "@/lib/types/orbital";
import type {
  Filters,
  PlaybackSpeed,
  QualityTier,
  TimelineState,
} from "@/lib/types/ui";
import { EMPTY_FILTERS } from "@/lib/types/ui";
import type { SearchResponse } from "@contracts";
import { SIM_EPOCH_MS } from "@/lib/data/fixtures/rng";

/**
 * Single source of truth shared by the WebGL scene and the DOM HUD.
 *
 * Why zustand rather than context: the scene needs to read hover and selection
 * every frame. With context, hovering one debris fragment would re-render the
 * entire HUD tree at 60 fps. Here the scene subscribes transiently
 * (`useMissionStore.getState()` inside `useFrame`) and only genuine state
 * changes re-render React.
 */

interface MissionState {
  // --- Catalogue ---
  satellites: SatelliteObject[];
  debris: DebrisObject[];
  conjunctions: Conjunction[];
  loading: boolean;
  loadError: string | null;

  // --- Live / mock search (does not replace the seeded catalogue) ---
  searchLoading: boolean;
  searchError: string | null;
  searchResponse: SearchResponse | null;
  searchAppliedQuery: string;
  searchHitNoradIds: string[];
  searchHitDocIds: string[];
  /** True when live HTTP failed and results came from the local mock service. */
  searchFallback: boolean;

  // --- Interaction ---
  selectedNoradId: string | null;
  selectedConjunctionId: string | null;
  hoveredNoradId: string | null;

  // --- Controls ---
  filters: Filters;
  timeline: TimelineState;
  quality: QualityTier;
  autoRotateEnabled: boolean;

  // --- Actions ---
  setCatalogue: (payload: {
    satellites: SatelliteObject[];
    debris: DebrisObject[];
    conjunctions: Conjunction[];
  }) => void;
  setLoading: (loading: boolean) => void;
  setLoadError: (message: string | null) => void;

  select: (noradId: string | null, conjunctionId?: string | null) => void;
  selectConjunction: (conjunction: Conjunction) => void;
  clearSelection: () => void;
  setHovered: (noradId: string | null) => void;

  setQuery: (query: string) => void;
  setFilters: (partial: Partial<Filters>) => void;
  resetFilters: () => void;
  beginSearch: () => void;
  setSearchResult: (payload: {
    query: string;
    response: SearchResponse;
    hitNoradIds: string[];
    hitDocIds: string[];
    fallback: boolean;
    error: string | null;
  }) => void;
  setSearchError: (message: string) => void;
  clearSearch: () => void;

  setTimelineOffset: (offsetMinutes: number) => void;
  togglePlaying: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  resetTimeline: () => void;

  setQuality: (quality: QualityTier) => void;
  setAutoRotateEnabled: (enabled: boolean) => void;
}

/** Timeline horizon: 48 hours forward from the simulation epoch. */
export const TIMELINE_MAX_MINUTES = 48 * 60;

const INITIAL_TIMELINE: TimelineState = {
  offsetMinutes: 0,
  playing: false,
  speed: 10,
};

const CLEARED_SEARCH = {
  searchLoading: false,
  searchError: null,
  searchResponse: null,
  searchAppliedQuery: "",
  searchHitNoradIds: [] as string[],
  searchHitDocIds: [] as string[],
  searchFallback: false,
};

export const useMissionStore = create<MissionState>((set) => ({
  satellites: [],
  debris: [],
  conjunctions: [],
  loading: true,
  loadError: null,

  ...CLEARED_SEARCH,

  selectedNoradId: null,
  selectedConjunctionId: null,
  hoveredNoradId: null,

  filters: EMPTY_FILTERS,
  timeline: INITIAL_TIMELINE,
  quality: "high",
  autoRotateEnabled: true,

  setCatalogue: ({ satellites, debris, conjunctions }) =>
    set({ satellites, debris, conjunctions, loading: false, loadError: null }),
  setLoading: (loading) => set({ loading }),
  setLoadError: (loadError) => set({ loadError, loading: false }),

  select: (noradId, conjunctionId = null) =>
    set({ selectedNoradId: noradId, selectedConjunctionId: conjunctionId }),

  selectConjunction: (conjunction) =>
    set({
      selectedNoradId: conjunction.primary_norad,
      selectedConjunctionId: conjunction.id,
    }),

  clearSelection: () =>
    set({ selectedNoradId: null, selectedConjunctionId: null }),

  setHovered: (hoveredNoradId) => set({ hoveredNoradId }),

  // A selection made against the previous result set is never valid for a new
  // one, so changing the query drops it before the next response arrives.
  setQuery: (query) =>
    set((state) => ({
      filters: { ...state.filters, query },
      selectedNoradId: null,
      selectedConjunctionId: null,
      ...(query.trim() ? {} : CLEARED_SEARCH),
    })),

  setFilters: (partial) =>
    set((state) => ({ filters: { ...state.filters, ...partial } })),

  resetFilters: () =>
    set({
      filters: EMPTY_FILTERS,
      selectedNoradId: null,
      selectedConjunctionId: null,
      ...CLEARED_SEARCH,
    }),

  beginSearch: () => set({ searchLoading: true, searchError: null }),

  setSearchResult: ({
    query,
    response,
    hitNoradIds,
    hitDocIds,
    fallback,
    error,
  }) =>
    set({
      searchLoading: false,
      searchError: error,
      searchResponse: response,
      searchAppliedQuery: query,
      searchHitNoradIds: hitNoradIds,
      searchHitDocIds: hitDocIds,
      searchFallback: fallback,
    }),

  setSearchError: (searchError) =>
    set({
      searchLoading: false,
      searchError,
      searchResponse: null,
      searchAppliedQuery: "",
      searchHitNoradIds: [],
      searchHitDocIds: [],
      searchFallback: false,
    }),

  clearSearch: () => set(CLEARED_SEARCH),

  setTimelineOffset: (offsetMinutes) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        offsetMinutes: Math.min(
          TIMELINE_MAX_MINUTES,
          Math.max(0, offsetMinutes),
        ),
      },
    })),

  togglePlaying: () =>
    set((state) => ({
      timeline: { ...state.timeline, playing: !state.timeline.playing },
    })),

  setSpeed: (speed) =>
    set((state) => ({ timeline: { ...state.timeline, speed } })),

  resetTimeline: () => set({ timeline: INITIAL_TIMELINE }),

  setQuality: (quality) => set({ quality }),
  setAutoRotateEnabled: (autoRotateEnabled) => set({ autoRotateEnabled }),
}));

/** Absolute simulation time in ms for a given timeline offset. */
export function simTimeMs(offsetMinutes: number): number {
  return SIM_EPOCH_MS + offsetMinutes * 60_000;
}

/** Every catalogue object in one array. Memoize at the call site. */
export function allObjects(state: {
  satellites: SatelliteObject[];
  debris: DebrisObject[];
}): OrbitalObject[] {
  return [...state.satellites, ...state.debris];
}
