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
import type { SearchHit, SearchResponse, VisualizeResponse } from "@contracts";
import type { VisualizeTarget } from "@/lib/data/visualizeContext";
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
  /**
   * The live hit the operator picked. Held separately from `selectedNoradId`
   * because most hits have no counterpart in the seeded globe catalogue.
   */
  selectedSearchHit: SearchHit | null;
  hoveredNoradId: string | null;

  // --- Grok Imagine card generation ---
  visualize: VisualizeState;

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
  selectSearchHit: (hit: SearchHit, seededNoradId?: string | null) => void;
  clearSelectedSearchHit: () => void;
  /** Sync-driven: drops a stale orbit selection, leaves the hit panel alone. */
  clearSelection: () => void;
  /** Operator-driven close: drops everything the right-hand panel shows. */
  dismissSelection: () => void;
  setHovered: (noradId: string | null) => void;

  requestVisualize: (target: VisualizeTarget) => void;
  regenerateVisualize: () => void;
  setVisualizeResult: (response: VisualizeResponse) => void;
  setVisualizeError: (message: string) => void;
  closeVisualize: () => void;

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

/**
 * One Grok Imagine request, owned by `GrokVisualizeLayer`.
 *
 * `attempt` is the regenerate counter: together with `target.key` it identifies
 * the in-flight generation, so a response that lands after the operator moved
 * on is discarded instead of attached to the new selection.
 */
export interface VisualizeState {
  open: boolean;
  status: "idle" | "loading" | "ready" | "error";
  target: VisualizeTarget | null;
  attempt: number;
  response: VisualizeResponse | null;
  error: string | null;
}

/** Timeline horizon: 48 hours forward from the simulation epoch. */
export const TIMELINE_MAX_MINUTES = 48 * 60;

const INITIAL_TIMELINE: TimelineState = {
  offsetMinutes: 0,
  playing: false,
  speed: 10,
};

const IDLE_VISUALIZE: VisualizeState = {
  open: false,
  status: "idle",
  target: null,
  attempt: 0,
  response: null,
  error: null,
};

/** Any selection change invalidates a card generated for the old selection. */
const CLEARED_VISUALIZE = {
  selectedSearchHit: null as SearchHit | null,
  visualize: IDLE_VISUALIZE,
};

const CLEARED_SEARCH = {
  searchLoading: false,
  searchError: null,
  searchResponse: null,
  searchAppliedQuery: "",
  searchHitNoradIds: [] as string[],
  searchHitDocIds: [] as string[],
  searchFallback: false,
  ...CLEARED_VISUALIZE,
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
  selectedSearchHit: null,
  hoveredNoradId: null,
  visualize: IDLE_VISUALIZE,

  filters: EMPTY_FILTERS,
  timeline: INITIAL_TIMELINE,
  quality: "high",
  autoRotateEnabled: true,

  setCatalogue: ({ satellites, debris, conjunctions }) =>
    set({ satellites, debris, conjunctions, loading: false, loadError: null }),
  setLoading: (loading) => set({ loading }),
  setLoadError: (loadError) => set({ loadError, loading: false }),

  select: (noradId, conjunctionId = null) =>
    set({
      selectedNoradId: noradId,
      selectedConjunctionId: conjunctionId,
      ...CLEARED_VISUALIZE,
    }),

  selectConjunction: (conjunction) =>
    set({
      selectedNoradId: conjunction.primary_norad,
      selectedConjunctionId: conjunction.id,
      ...CLEARED_VISUALIZE,
    }),

  // A hit may also exist in the seeded catalogue; when it does, the caller
  // passes its NORAD id so the orbit highlight still works.
  selectSearchHit: (hit, seededNoradId = null) =>
    set({
      ...CLEARED_VISUALIZE,
      selectedSearchHit: hit,
      selectedNoradId: seededNoradId,
      selectedConjunctionId: null,
    }),

  clearSelectedSearchHit: () => set(CLEARED_VISUALIZE),

  clearSelection: () =>
    set({ selectedNoradId: null, selectedConjunctionId: null }),

  dismissSelection: () =>
    set({
      selectedNoradId: null,
      selectedConjunctionId: null,
      ...CLEARED_VISUALIZE,
    }),

  setHovered: (hoveredNoradId) => set({ hoveredNoradId }),

  // A selection made against the previous result set is never valid for a new
  // one, so changing the query drops it — including a live search hit — before
  // the next response arrives.
  setQuery: (query) =>
    set((state) => ({
      filters: { ...state.filters, query },
      selectedNoradId: null,
      selectedConjunctionId: null,
      ...CLEARED_VISUALIZE,
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
      ...CLEARED_VISUALIZE,
    }),

  clearSearch: () => set(CLEARED_SEARCH),

  // Generation is always operator-triggered: nothing here runs on selection.
  // `attempt` only ever climbs, so pressing the button twice on the same target
  // is a new generation rather than a duplicate of the one in flight.
  requestVisualize: (target) =>
    set((state) => ({
      visualize: {
        open: true,
        status: "loading",
        target,
        attempt:
          (state.visualize.target?.key === target.key
            ? state.visualize.attempt
            : 0) + 1,
        response: null,
        error: null,
      },
    })),

  regenerateVisualize: () =>
    set((state) =>
      state.visualize.target
        ? {
            visualize: {
              ...state.visualize,
              open: true,
              status: "loading",
              attempt: state.visualize.attempt + 1,
              response: null,
              error: null,
            },
          }
        : {},
    ),

  setVisualizeResult: (response) =>
    set((state) => ({
      visualize: { ...state.visualize, status: "ready", response, error: null },
    })),

  setVisualizeError: (error) =>
    set((state) => ({
      visualize: { ...state.visualize, status: "error", response: null, error },
    })),

  closeVisualize: () => set({ visualize: IDLE_VISUALIZE }),

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
