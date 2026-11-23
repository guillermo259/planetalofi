export interface LocationLike {
  protocol: string;
  host: string;
}

/**
 * Strips trailing slashes from an API base URL (e.g. "https://api.example.com/" -> "https://api.example.com").
 */
export function normalizeApiBaseUrl(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Resolves an HTTP endpoint or audio path against an optional external API base URL.
 * Already-absolute URLs (e.g. external FMA MP3 links) are returned unchanged.
 */
export function buildApiUrl(path: string, apiBaseUrl?: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = normalizeApiBaseUrl(apiBaseUrl);
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

/**
 * Builds the WebSocket URL for /ws from VITE_API_BASE_URL when provided,
 * falling back to same-origin window.location when hosted together.
 */
export function buildWsUrl(
  path: string,
  apiBaseUrl?: string,
  currentLocation?: LocationLike,
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = normalizeApiBaseUrl(apiBaseUrl);
  if (base) {
    try {
      const parsed = new URL(base);
      const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const basePath = parsed.pathname.replace(/\/+$/, '');
      return `${wsProtocol}//${parsed.host}${basePath}${normalizedPath}`;
    } catch {
      // Fall through to currentLocation if invalid base URL
    }
  }
  const protocol = currentLocation?.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = currentLocation?.host ?? 'localhost:3000';
  return `${protocol}//${host}${normalizedPath}`;
}

function readViteApiBaseUrl(): string {
  try {
    return import.meta.env?.VITE_API_BASE_URL ?? '';
  } catch {
    return '';
  }
}

export function getApiUrl(path: string): string {
  return buildApiUrl(path, readViteApiBaseUrl());
}

export function getWsUrl(path: string): string {
  const loc = typeof window !== 'undefined' ? window.location : undefined;
  return buildWsUrl(path, readViteApiBaseUrl(), loc);
}
