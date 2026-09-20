/**
 * Public runtime configuration.
 *
 * Only `NEXT_PUBLIC_*` values may appear here. Anything prefixed that way is
 * inlined into the browser bundle and is world-readable, so no secret, token
 * or API key is ever read in this file. Phase 1 ships with the base URL unset,
 * which keeps the app fully offline on the mock data service.
 *
 * Note the literal `process.env.NEXT_PUBLIC_API_BASE_URL` access: Next inlines
 * it at build time only when written as a static property lookup.
 */

const rawApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export const env = {
  /** Trailing slash stripped so callers can always append `/path`. */
  apiBaseUrl: rawApiBaseUrl.trim().replace(/\/+$/, ""),
} as const;

/**
 * True when a public API base URL is configured. Search then uses
 * `httpDataService`; catalogue lists stay on the seeded mock.
 */
export const isLiveApiEnabled = env.apiBaseUrl.length > 0;
