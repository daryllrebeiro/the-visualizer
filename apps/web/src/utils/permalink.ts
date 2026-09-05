/**
 * Simulation Scenario Permalink Utilities
 *
 * Provides URL-safe serialization, compression, and deserialization
 * for deterministic simulation snapshots, chaos presets, and state reconstitution.
 */

export interface ScenarioPermalinkPayload {
  domain: string;
  scenarioId?: string | undefined;
  tick?: number | undefined;
  seed?: number | undefined;
  params?: Record<string, unknown> | undefined;
}

/**
 * Encodes a scenario payload into a compact, URL-safe base64 string.
 */
export function encodeScenarioPermalink(payload: ScenarioPermalinkPayload): string {
  const json = JSON.stringify(payload);
  try {
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      return btoa(encodeURIComponent(json))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    return Buffer.from(json)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    return Buffer.from(json)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}

/**
 * Decodes a scenario payload from a query string or URLSearchParams.
 * Supports both encoded `?p=...` format and direct query params `?domain=...&scenario=...`.
 */
export function decodeScenarioPermalink(
  searchStrOrParams: string | URLSearchParams,
): ScenarioPermalinkPayload | null {
  const params =
    typeof searchStrOrParams === 'string'
      ? new URLSearchParams(
          searchStrOrParams.startsWith('?') ? searchStrOrParams.slice(1) : searchStrOrParams,
        )
      : searchStrOrParams;

  const encoded = params.get('p');
  if (encoded) {
    try {
      let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      let json: string;
      if (typeof window !== 'undefined' && typeof window.atob === 'function') {
        try {
          json = decodeURIComponent(atob(base64));
        } catch {
          json = atob(base64);
        }
      } else {
        json = Buffer.from(base64, 'base64').toString('utf8');
      }
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed.domain === 'string') {
        return parsed as ScenarioPermalinkPayload;
      }
    } catch {
      // Fall through to plain parameter inspection
    }
  }

  // Fallback: Human-readable URL query parameters
  const domain = params.get('domain');
  if (domain) {
    const scenarioId = params.get('scenario') || params.get('scenarioId') || undefined;
    const tickStr = params.get('tick');
    const seedStr = params.get('seed');
    return {
      domain,
      scenarioId,
      tick: tickStr ? parseInt(tickStr, 10) : undefined,
      seed: seedStr ? parseInt(seedStr, 10) : undefined,
    };
  }

  return null;
}

/**
 * Generates the full canonical shareable URL.
 */
export function generateShareableUrl(payload: ScenarioPermalinkPayload, origin?: string): string {
  const encoded = encodeScenarioPermalink(payload);
  const base =
    origin ||
    (typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'http://localhost:3000');
  return `${base}/${payload.domain}?p=${encoded}`;
}

/**
 * Copies the shareable scenario permalink to user clipboard.
 */
export async function copyPermalinkToClipboard(payload: ScenarioPermalinkPayload): Promise<string> {
  const url = generateShareableUrl(payload);
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Ignore clipboard write failure in automated/headless contexts
    }
  }
  return url;
}
