"use client";

import { Radar } from "lucide-react";
import { useMissionStore, simTimeMs } from "@/lib/store/useMissionStore";
import { formatUtc } from "@/lib/utils/format";
import { SearchField } from "./SearchField";
import { Legend } from "./Legend";

export function TopBar() {
  const offsetMinutes = useMissionStore((state) => state.timeline.offsetMinutes);
  const loading = useMissionStore((state) => state.loading);

  // Derived from the frozen sim epoch, never the wall clock, so SSR and the
  // client agree and the displayed time always matches what the globe shows.
  const clock = formatUtc(new Date(simTimeMs(offsetMinutes)).toISOString());

  return (
    <header className="pointer-events-none flex items-start justify-between gap-3 p-3">
      <div className="flex items-start gap-3">
        <div className="scut-panel pointer-events-auto flex items-center gap-2.5 px-3 py-2">
          <Radar
            className={`size-4 text-teal ${loading ? "scut-pulse" : ""}`}
            aria-hidden="true"
          />
          <div className="leading-none">
            <h1 className="font-mono text-sm font-semibold tracking-[0.22em] text-ink uppercase">
              Scutaris
            </h1>
            <p className="mt-1 font-mono text-[9px] tracking-[0.14em] text-ink-faint uppercase">
              Orbital Safety Command
            </p>
          </div>
        </div>

        <div className="scut-panel pointer-events-auto hidden flex-col justify-center px-3 py-2 lg:flex">
          <span className="font-mono text-[9px] tracking-[0.14em] text-ink-faint uppercase">
            Sim clock
          </span>
          <time className="font-mono text-xs text-teal tabular-nums">
            {clock}
          </time>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-2 sm:max-w-md lg:max-w-lg">
        <div className="w-full min-w-0">
          <SearchField />
        </div>
      </div>

      <Legend />
    </header>
  );
}
