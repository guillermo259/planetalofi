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
export interface PresenceStoreOptions {
  /** Máximo de ciudades distintas monitorizadas (evita crecimiento sin cota). */
  maxCities?: number;
}

export interface CountryPresenceSummary {
  code: string;
  name: string;
  listeners: number;
}

/** Agregado anónimo para /api/health: países y sesiones sin ubicación. */
export interface GeoSummary {
  located: number;
  unknown: number;
  countries: CountryPresenceSummary[];
}

const DEFAULT_MAX_CITIES = 500;

// Bucket compartido para sesiones que exceden el máximo de ciudades.
const UNKNOWN_CITY_META: ResolvedCityMetadata = {
  key: 'unknown',
  name: '',
  region: '',
  country: '',
  countryCode: '',
  lat: null,
  lon: null,
};

export class PresenceStore {
  private sessions = new Map<string, SessionRecord>();
  private cities = new Map<string, CityPresence>();
  private dirtyKeys = new Set<string>();
  private totalChanged = false;
  private maxCities: number;

  constructor(options: PresenceStoreOptions = {}) {
    const requested = options.maxCities;
    this.maxCities =
      requested && Number.isInteger(requested) && requested > 0
        ? requested
        : DEFAULT_MAX_CITIES;
  }

  addSession(
    sessionId: string,
    meta: ResolvedCityMetadata,
    nowMs = Date.now(),
  ): CityPresence {
    if (this.sessions.has(sessionId)) {
      this.removeSession(sessionId);
    }

    // Cap de ciudades: una clave nueva por encima del límite cae en "unknown".
    const effectiveMeta =
      this.cities.has(meta.key) || this.cities.size < this.maxCities
        ? meta
        : UNKNOWN_CITY_META;

    this.sessions.set(sessionId, {
      id: sessionId,
      cityKey: effectiveMeta.key,
      lastSeenMs: nowMs,
    });

    const existing = this.cities.get(effectiveMeta.key);
    if (existing) {
      existing.n += 1;
    } else {
      this.cities.set(effectiveMeta.key, {
        ...effectiveMeta,
        n: 1,
      });
    }

    this.dirtyKeys.add(effectiveMeta.key);
    this.totalChanged = true;

    return { ...this.cities.get(effectiveMeta.key)! };
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

  /**
   * Recuento por país, sin IPs ni ciudades: solo agregados para comprobar la
   * geolocalización tras el despliegue.
   */
  getGeoSummary(): GeoSummary {
    const byCountry = new Map<string, CountryPresenceSummary>();
    let located = 0;
    let unknown = 0;

    for (const city of this.cities.values()) {
      const code = city.countryCode.trim().toUpperCase();
      if (!code) {
        unknown += city.n;
        continue;
      }
      located += city.n;
      const entry = byCountry.get(code);
      if (entry) {
        entry.listeners += city.n;
      } else {
        byCountry.set(code, {
          code,
          name: city.country.trim() || code,
          listeners: city.n,
        });
      }
    }

    const countries = Array.from(byCountry.values()).sort(
      (a, b) => b.listeners - a.listeners || a.code.localeCompare(b.code),
    );

    return { located, unknown, countries };
  }
}
