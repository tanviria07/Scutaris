/** Display formatters for the HUD. All are locale-stable to avoid hydration drift. */

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

export function formatInt(value: number): string {
  return NUMBER_FORMAT.format(Math.round(value));
}

export function formatKm(value: number, digits = 1): string {
  return `${value.toFixed(digits)} km`;
}

export function formatDeg(value: number, digits = 2): string {
  return `${value.toFixed(digits)}\u00b0`;
}

/** Probability of collision, which is always tiny and always scientific. */
export function formatPc(value: number): string {
  if (value === 0) return "0";
  return value.toExponential(2);
}

/** `2026-09-19T14:03:00Z` -> `2026-09-19 14:03:00Z`, stable across locales. */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 19).replace("T", " ")}Z`;
}

/** Short clock used in the dense threat feed. */
export function formatUtcShort(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(5, 16).replace("T", " ");
}

/** Signed relative time against a supplied reference, e.g. `T-42m`. */
export function formatRelative(iso: string, referenceMs: number): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "--";

  const deltaMinutes = Math.round((target - referenceMs) / 60_000);
  const sign = deltaMinutes >= 0 ? "-" : "+";
  const magnitude = Math.abs(deltaMinutes);

  if (magnitude < 60) return `T${sign}${magnitude}m`;
  if (magnitude < 1440) {
    return `T${sign}${Math.floor(magnitude / 60)}h${String(magnitude % 60).padStart(2, "0")}m`;
  }
  return `T${sign}${Math.floor(magnitude / 1440)}d${String(Math.floor((magnitude % 1440) / 60)).padStart(2, "0")}h`;
}
