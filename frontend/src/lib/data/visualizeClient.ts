import type { VisualizeRequest, VisualizeResponse } from "@contracts";
import { env } from "@/lib/config/env";

/**
 * Client for `POST /visualize` (Grok Imagine cards).
 *
 * The browser only ever talks to the Scutaris backend: the xAI call, the key
 * and the prompt template all stay server-side in `backend/grok_imagine.py`.
 */

export interface VisualizeInit {
  signal?: AbortSignal;
}

function isVisualizeResponse(value: unknown): value is VisualizeResponse {
  if (value === null || typeof value !== "object") return false;
  const payload = value as Partial<VisualizeResponse>;
  return (
    typeof payload.image_url === "string" &&
    typeof payload.mock === "boolean" &&
    typeof payload.cached === "boolean"
  );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/**
 * Absolute URLs are used as-is; the backend's `/static/...` paths are resolved
 * against the public API base URL.
 */
export function resolveImageUrl(imageUrl: string): string {
  if (/^(https?:)?\/\//i.test(imageUrl) || imageUrl.startsWith("data:")) {
    return imageUrl;
  }
  const path = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
  return `${env.apiBaseUrl}${path}`;
}

export async function requestVisualization(
  request: VisualizeRequest,
  init?: VisualizeInit,
): Promise<VisualizeResponse> {
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}/visualize`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: request.type,
        context: request.context ?? {},
      }),
      signal: init?.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Could not reach the Scutaris API");
  }

  if (!response.ok) {
    throw new Error(`Visualize failed (HTTP ${response.status})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Visualize returned an unreadable response");
  }

  if (!isVisualizeResponse(payload)) {
    throw new Error("Visualize returned an unexpected payload");
  }
  if (payload.image_url.trim().length === 0) {
    throw new Error("Visualize returned no image URL");
  }
  return payload;
}
