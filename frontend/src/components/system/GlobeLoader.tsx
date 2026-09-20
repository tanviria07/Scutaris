"use client";

/** Shown while textures and geometry resolve inside the canvas Suspense boundary. */
export function GlobeLoader({ label = "Initialising orbital scene" }: { label?: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative size-16">
          <div className="absolute inset-0 rounded-full border border-teal/20" />
          <div className="absolute inset-0 rounded-full border-t border-teal scut-spin" />
          <div className="absolute inset-3 rounded-full border border-teal/10" />
        </div>
        <p className="font-mono text-[10px] tracking-[0.18em] text-teal uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}
