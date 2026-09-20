"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Badge, RiskBadge } from "@/components/ui/Badge";
import {
  requestVisualization,
  resolveImageUrl,
} from "@/lib/data/visualizeClient";
import { useMissionStore } from "@/lib/store/useMissionStore";

/**
 * Owns the whole `POST /visualize` lifecycle and the card modal.
 *
 * The panels only record intent (`requestVisualize`); the request runs here so
 * there is exactly one in-flight generation. `target.key` plus `attempt`
 * identify it, and any selection change resets the slice, which aborts the
 * request and guarantees the old image never lands on the new selection.
 */

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function formatTook(tookMs: number): string {
  return tookMs >= 1000 ? `${(tookMs / 1000).toFixed(1)} s` : `${tookMs} ms`;
}

function fileName(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "card";
  return `scutaris-risk-card-${slug}.png`;
}

function ActionButton({
  onClick,
  children,
  label,
  tone = "teal",
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
  tone?: "teal" | "neutral";
}) {
  const toneClass =
    tone === "teal"
      ? "border-teal/40 bg-teal/10 text-teal hover:bg-teal/20"
      : "border-ink-faint/30 bg-white/[0.03] text-ink-dim hover:text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center gap-1.5 border px-3 py-2 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function GrokVisualizeLayer() {
  const visualize = useMissionStore((state) => state.visualize);
  const setVisualizeResult = useMissionStore(
    (state) => state.setVisualizeResult,
  );
  const setVisualizeError = useMissionStore((state) => state.setVisualizeError);
  const closeVisualize = useMissionStore((state) => state.closeVisualize);
  const regenerateVisualize = useMissionStore(
    (state) => state.regenerateVisualize,
  );

  const { open, status, target, attempt, response, error } = visualize;
  const generation = target ? `${target.key}#${attempt}` : null;

  const startedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "loading" || !target || !generation) return;
    // React runs effects twice in development; one generation, one request.
    if (startedRef.current === generation) return;

    startedRef.current = generation;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setImageFailed(false);
    setDownloadError(null);

    void (async () => {
      try {
        const result = await requestVisualization(
          { type: "risk_card", context: target.context },
          { signal: abort.signal },
        );
        if (abort.signal.aborted) return;
        const current = useMissionStore.getState().visualize;
        if (current.target?.key !== target.key || current.attempt !== attempt) {
          return;
        }
        setVisualizeResult(result);
      } catch (caught) {
        if (isAbortError(caught) || abort.signal.aborted) return;
        const current = useMissionStore.getState().visualize;
        if (current.target?.key !== target.key || current.attempt !== attempt) {
          return;
        }
        setVisualizeError(
          caught instanceof Error ? caught.message : "Visualize failed",
        );
      }
    })();
  }, [
    status,
    target,
    attempt,
    generation,
    setVisualizeResult,
    setVisualizeError,
  ]);

  // Leaving `loading` for any reason — result, error, or a selection change
  // that reset the slice — means nothing should still be in flight.
  useEffect(() => {
    if (status === "loading") return;
    abortRef.current?.abort();
    abortRef.current = null;
    if (status === "idle") startedRef.current = null;
  }, [status]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeVisualize();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeVisualize]);

  const imageUrl = response ? resolveImageUrl(response.image_url) : null;

  const download = useCallback(async () => {
    if (!imageUrl || !target) return;
    setDownloadError(null);
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName(target.title);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch {
      // Saving can be blocked cross-origin; the tab is a working fallback.
      setDownloadError("Download blocked — opened the image in a new tab.");
      window.open(imageUrl, "_blank", "noopener,noreferrer");
    }
  }, [imageUrl, target]);

  if (!open || !target) return null;

  const sourceBadge = response ? (
    response.mock ? (
      <Badge tone="amber">Mock image</Badge>
    ) : (
      <Badge tone="teal">
        <Sparkles className="size-2.5" aria-hidden="true" />
        Grok Imagine • Live
      </Badge>
    )
  ) : null;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 z-20 bg-void/75 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grok-card-title"
      >
      <div className="pointer-events-auto scut-panel flex max-h-full w-full max-w-[34rem] flex-col overflow-hidden">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-3 py-2">
          <div className="min-w-0">
            <h2
              id="grok-card-title"
              className="font-mono text-[10px] tracking-[0.18em] text-teal uppercase"
            >
              Grok Imagine · risk card
            </h2>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink">
              {target.title}
            </p>
            {target.subtitle ? (
              <p className="truncate font-mono text-[9px] tracking-[0.1em] text-ink-faint uppercase">
                {target.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {target.riskLevel ? <RiskBadge level={target.riskLevel} /> : null}
            <button
              type="button"
              onClick={closeVisualize}
              aria-label="Close the Grok Imagine card"
              className="text-ink-faint transition-colors hover:text-teal"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="scut-scroll min-h-0 overflow-y-auto p-3">
          {status === "loading" ? (
            <div className="flex flex-col items-center gap-3 py-10" aria-live="polite">
              <RefreshCw
                className="scut-spin size-5 text-teal"
                aria-hidden="true"
              />
              <p className="font-mono text-[11px] tracking-[0.14em] text-teal uppercase">
                Generating with Grok Imagine…
              </p>
              <div className="relative h-0.5 w-48 overflow-hidden bg-white/10">
                <div className="scut-sweep absolute inset-y-0 w-1/3 bg-teal" />
              </div>
              <p className="max-w-xs text-center text-[10px] leading-relaxed text-ink-dim">
                Image synthesis runs on xAI and usually takes several seconds.
                The card appears here as soon as the backend returns it.
              </p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex flex-col items-center gap-3 py-8" role="alert">
              <AlertTriangle className="size-5 text-crimson" aria-hidden="true" />
              <p className="font-mono text-[11px] tracking-[0.12em] text-crimson uppercase">
                Card generation failed
              </p>
              <p className="max-w-xs text-center text-[10px] leading-relaxed text-ink-dim">
                {error ?? "The backend did not return an image."}
              </p>
              <div className="flex gap-2">
                <ActionButton onClick={regenerateVisualize} label="Retry Grok Imagine generation">
                  <RefreshCw className="size-3" aria-hidden="true" />
                  Retry
                </ActionButton>
                <ActionButton
                  onClick={closeVisualize}
                  label="Close the Grok Imagine card"
                  tone="neutral"
                >
                  Close
                </ActionButton>
              </div>
            </div>
          ) : null}

          {status === "ready" && response && imageUrl ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {sourceBadge}
                {response.cached ? <Badge tone="neutral">Cached</Badge> : null}
                <Badge tone="neutral">{formatTook(response.took_ms)}</Badge>
              </div>

              {imageFailed ? (
                <div
                  className="flex aspect-square w-full items-center justify-center border border-dashed border-crimson/40 bg-black/30 p-4"
                  role="alert"
                >
                  <p className="text-center text-[10px] leading-relaxed text-crimson">
                    The generated image could not be loaded from {imageUrl}
                  </p>
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={imageUrl}
                  alt={`Grok Imagine risk card for ${target.title}${
                    target.riskLevel ? `, ${target.riskLevel} risk` : ""
                  }`}
                  onError={() => setImageFailed(true)}
                  className="w-full border border-[var(--color-hairline)] bg-black/40"
                />
              )}

              {response.note ? (
                <p className="border-l-2 border-amber/50 pl-2 text-[10px] leading-relaxed text-amber">
                  {response.note}
                </p>
              ) : null}
              {downloadError ? (
                <p className="text-[10px] leading-relaxed text-amber">
                  {downloadError}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <ActionButton
                  onClick={regenerateVisualize}
                  label="Regenerate this risk card"
                >
                  <RefreshCw className="size-3" aria-hidden="true" />
                  Regenerate
                </ActionButton>
                <ActionButton
                  onClick={() =>
                    window.open(imageUrl, "_blank", "noopener,noreferrer")
                  }
                  label="Open the full size image in a new tab"
                >
                  <ExternalLink className="size-3" aria-hidden="true" />
                  Open full size
                </ActionButton>
                <ActionButton
                  onClick={() => void download()}
                  label="Download the generated image"
                  tone="neutral"
                >
                  <Download className="size-3" aria-hidden="true" />
                  Download
                </ActionButton>
                <ActionButton
                  onClick={closeVisualize}
                  label="Close the Grok Imagine card"
                  tone="neutral"
                >
                  Close
                </ActionButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </>
  );
}
