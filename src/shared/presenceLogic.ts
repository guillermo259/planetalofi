import type { CityDiffItem, CityPresence } from './types.ts';

export function normalizeLocationPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildCityKey(
  city: string | null | undefined,
  region: string | null | undefined,
  countryCode: string | null | undefined,
): string {
  const c = normalizeLocationPart(city ?? '');
  const r = normalizeLocationPart(region ?? '');
  const cc = normalizeLocationPart(countryCode ?? '');

  if (c && cc) {
    return r ? `${c}-${r}-${cc}` : `${c}-${cc}`;
  }
  if (cc) {
    return `country-${cc}`;
  }
  return 'unknown';
}

/**
 * Rounds coordinates to ~0.1 deg (~11km city center granularity)
 * so exact IP coordinates are never exposed.
 */
export function roundCityCoord(coord: number): number {
  return Math.round(coord * 10) / 10;
}

/**
 * Bounded luminous intensity for city markers:
 * 1 listener is clearly visible, 500+ never saturates the scene.
 */
export function markerIntensity(n: number, k = 12): number {
  if (n <= 0) return 0;
  return 1 - Math.exp(-n / k);
}

export interface SessionRecord {
  id: string;
  cityKey: string;
  lastSeenMs: number;
}

export interface ResolvedCityMetadata {
  key: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number | null;
  lon: number | null;
}

/**
 * In-memory live presence store with aggregated diff batching.
 * Stores no IP addresses and no persistent history.
 */
export class PresenceStore {
  private sessions = new Map<string, SessionRecord>();
  private cities = new Map<string, CityPresence>();
  private dirtyKeys = new Set<string>();
  private totalChanged = false;

  addSession(
    sessionId: string,
    meta: ResolvedCityMetadata,
    nowMs = Date.now(),
  ): CityPresence {
    if (this.sessions.has(sessionId)) {
      this.removeSession(sessionId);
    }

    this.sessions.set(sessionId, {
      id: sessionId,
      cityKey: meta.key,
      lastSeenMs: nowMs,
    });

    const existing = this.cities.get(meta.key);
    if (existing) {
      existing.n += 1;
    } else {
      this.cities.set(meta.key, {
        ...meta,
        n: 1,
      });
    }

    this.dirtyKeys.add(meta.key);
    this.totalChanged = true;

    return { ...this.cities.get(meta.key)! };
  }

  touchSession(sessionId: string, nowMs = Date.now()): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeenMs = nowMs;
    }
  }

  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);
    const city = this.cities.get(session.cityKey);
    if (city) {
      city.n = Math.max(0, city.n - 1);
      if (city.n === 0) {
        this.cities.delete(session.cityKey);
      }
      this.dirtyKeys.add(session.cityKey);
      this.totalChanged = true;
    }
    return true;
  }

  pruneExpired(nowMs: number, maxIdleMs: number): string[] {
    const expiredIds: string[] = [];
    for (const [id, session] of this.sessions.entries()) {
      if (nowMs - session.lastSeenMs > maxIdleMs) {
        expiredIds.push(id);
      }
    }
    for (const id of expiredIds) {
      this.removeSession(id);
    }
    return expiredIds;
  }

  getTotal(): number {
    return this.sessions.size;
  }

  getSnapshot(): { total: number; cities: CityPresence[] } {
    return {
      total: this.sessions.size,
      cities: Array.from(this.cities.values()).map((c) => ({ ...c })),
    };
  }

  flushDiff(): { total: number; cities: CityDiffItem[] } | null {
    if (!this.totalChanged && this.dirtyKeys.size === 0) {
      return null;
    }

    const diffCities: CityDiffItem[] = [];
    for (const key of this.dirtyKeys) {
      const city = this.cities.get(key);
      if (city) {
        diffCities.push({
          key: city.key,
          n: city.n,
          name: city.name,
          region: city.region,
          country: city.country,
          countryCode: city.countryCode,
          lat: city.lat,
          lon: city.lon,
        });
      } else {
        diffCities.push({
          key,
          n: 0,
        });
      }
    }

    this.dirtyKeys.clear();
    this.totalChanged = false;

    return {
      total: this.sessions.size,
      cities: diffCities,
    };
  }
}
