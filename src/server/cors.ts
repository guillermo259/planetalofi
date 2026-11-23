/**
 * Parses comma-separated origin/URL strings (from ALLOWED_ORIGINS and APP_URL)
 * into a normalized Set of URL origins (e.g. "https://user.github.io").
 */
export function parseAllowedOrigins(
  appUrl?: string,
  allowedOriginsEnv?: string,
): Set<string> {
  const origins = new Set<string>();
  const candidates: string[] = [];

  if (appUrl && appUrl !== 'MY_APP_URL') {
    candidates.push(appUrl);
  }
  if (allowedOriginsEnv) {
    for (const item of allowedOriginsEnv.split(',')) {
      candidates.push(item);
    }
  }

  for (const raw of candidates) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed origin entries
    }
  }

  return origins;
}

/**
 * Checks whether an HTTP/WebSocket Origin header is permitted.
 */
export function isOriginAllowed(
  origin: string | undefined,
  hostHeader: string | undefined,
  configuredOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (hostHeader && parsed.host === hostHeader) return true;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return true;
    }
    return configuredOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}
