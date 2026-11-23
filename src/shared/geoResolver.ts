import {
  buildCityKey,
  roundCityCoord,
  type ResolvedCityMetadata,
} from './presenceLogic.ts';

export interface CountryInfo {
  name: string;
  lat: number;
  lon: number;
}

// Representative centroids for country-only IP fallback (ISO 3166-1 alpha-2)
export const COUNTRY_CENTROIDS: Record<string, CountryInfo> = {
  AR: { name: 'Argentina', lat: -38.4, lon: -63.6 },
  AU: { name: 'Australia', lat: -25.3, lon: 133.8 },
  AT: { name: 'Austria', lat: 47.5, lon: 14.6 },
  BE: { name: 'Bélgica', lat: 50.5, lon: 4.5 },
  BO: { name: 'Bolivia', lat: -16.3, lon: -63.6 },
  BR: { name: 'Brasil', lat: -14.2, lon: -51.9 },
  CA: { name: 'Canadá', lat: 56.1, lon: -106.3 },
  CH: { name: 'Suiza', lat: 46.8, lon: 8.2 },
  CL: { name: 'Chile', lat: -35.7, lon: -71.5 },
  CN: { name: 'China', lat: 35.9, lon: 104.2 },
  CO: { name: 'Colombia', lat: 4.6, lon: -74.3 },
  CR: { name: 'Costa Rica', lat: 9.7, lon: -83.8 },
  CU: { name: 'Cuba', lat: 21.5, lon: -77.8 },
  DE: { name: 'Alemania', lat: 51.2, lon: 10.5 },
  DK: { name: 'Dinamarca', lat: 56.3, lon: 9.5 },
  DO: { name: 'República Dominicana', lat: 18.7, lon: -70.2 },
  EC: { name: 'Ecuador', lat: -1.8, lon: -78.2 },
  EG: { name: 'Egipto', lat: 26.8, lon: 30.8 },
  ES: { name: 'España', lat: 40.5, lon: -3.7 },
  FI: { name: 'Finlandia', lat: 61.9, lon: 25.7 },
  FR: { name: 'Francia', lat: 46.2, lon: 2.2 },
  GB: { name: 'Reino Unido', lat: 55.4, lon: -3.4 },
  GR: { name: 'Grecia', lat: 39.1, lon: 21.8 },
  GT: { name: 'Guatemala', lat: 15.8, lon: -90.2 },
  HN: { name: 'Honduras', lat: 15.2, lon: -86.2 },
  ID: { name: 'Indonesia', lat: -0.8, lon: 113.9 },
  IE: { name: 'Irlanda', lat: 53.4, lon: -8.2 },
  IL: { name: 'Israel', lat: 31.0, lon: 34.9 },
  IN: { name: 'India', lat: 20.6, lon: 79.0 },
  IT: { name: 'Italia', lat: 41.9, lon: 12.6 },
  JP: { name: 'Japón', lat: 36.2, lon: 138.3 },
  KR: { name: 'Corea del Sur', lat: 35.9, lon: 127.8 },
  MA: { name: 'Marruecos', lat: 31.8, lon: -7.1 },
  MX: { name: 'México', lat: 23.6, lon: -102.6 },
  MY: { name: 'Malasia', lat: 4.2, lon: 101.9 },
  NI: { name: 'Nicaragua', lat: 12.9, lon: -85.2 },
  NL: { name: 'Países Bajos', lat: 52.1, lon: 5.3 },
  NO: { name: 'Noruega', lat: 60.5, lon: 8.5 },
  NZ: { name: 'Nueva Zelanda', lat: -40.9, lon: 174.9 },
  PA: { name: 'Panamá', lat: 8.5, lon: -80.8 },
  PE: { name: 'Perú', lat: -9.2, lon: -75.0 },
  PH: { name: 'Filipinas', lat: 12.9, lon: 121.8 },
  PL: { name: 'Polonia', lat: 51.9, lon: 19.1 },
  PR: { name: 'Puerto Rico', lat: 18.2, lon: -66.6 },
  PT: { name: 'Portugal', lat: 39.4, lon: -8.2 },
  PY: { name: 'Paraguay', lat: -23.4, lon: -58.4 },
  RO: { name: 'Rumanía', lat: 45.9, lon: 25.0 },
  RU: { name: 'Rusia', lat: 61.5, lon: 105.3 },
  SE: { name: 'Suecia', lat: 60.1, lon: 18.6 },
  SG: { name: 'Singapur', lat: 1.4, lon: 103.8 },
  SV: { name: 'El Salvador', lat: 13.8, lon: -88.9 },
  TH: { name: 'Tailandia', lat: 15.9, lon: 101.0 },
  TR: { name: 'Turquía', lat: 39.0, lon: 35.2 },
  TW: { name: 'Taiwán', lat: 23.7, lon: 121.0 },
  UA: { name: 'Ucrania', lat: 48.4, lon: 31.2 },
  US: { name: 'Estados Unidos', lat: 37.1, lon: -95.7 },
  UY: { name: 'Uruguay', lat: -32.5, lon: -55.8 },
  VE: { name: 'Venezuela', lat: 6.4, lon: -66.6 },
  VN: { name: 'Vietnam', lat: 14.1, lon: 108.3 },
  ZA: { name: 'Sudáfrica', lat: -30.6, lon: 22.9 },
};

export interface GeoLookupResult {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  ll?: [number, number] | null;
}

/** 'auto' = confiar en cabeceras solo si el par directo es un proxy interno. */
export type ProxyTrust = number | 'auto';

/**
 * Resolves the client IP without requiring the operator to count proxy hops.
 *
 * - 'auto' (default): headers are used only when the direct peer is a private
 *   address, which means a reverse proxy is in front. A direct public peer is
 *   authoritative, so clients cannot forge their IP.
 * - 0: never trust headers. N: start N entries from the right.
 *
 * X-Forwarded-For is read from the right (the entry added by the proxy) and
 * walks left past private addresses, so chains with extra internal hops still
 * resolve the real client instead of a proxy container IP.
 */
export type IpSource = 'cf-connecting-ip' | 'x-forwarded-for' | 'socket' | 'none';
export type IpClass = 'public' | 'private' | 'invalid';

export interface ResolvedClientIp {
  ip: string | null;
  source: IpSource;
}

/** Diagnóstico de la conexión que consulta: clases, nunca direcciones. */
export interface ClientNetworkInfo {
  trust: ProxyTrust;
  cfHeaders: boolean;
  peer: IpClass;
  forwarded: number;
  hopClasses: IpClass[];
  cfConnectingIp: boolean;
  xRealIp: boolean;
  source: IpSource;
  client: IpClass;
}

function parseXff(
  headers: Record<string, string | string[] | undefined>,
): string[] {
  const xff = headers['x-forwarded-for'];
  const rawXff = Array.isArray(xff) ? xff.join(',') : xff;
  if (!rawXff) return [];
  return rawXff
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function classifyIp(value: string | null): IpClass {
  if (!value) return 'invalid';
  const ip = stripIpv6Prefix(value.trim());
  const isIpv4 =
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip) &&
    ip.split('.').every((part) => Number(part) <= 255);
  const isIpv6 = ip.includes(':') && /^[0-9a-fA-F:.]+$/.test(ip);
  if (!isIpv4 && !isIpv6) return 'invalid';
  return isPrivateOrLoopbackIp(ip) ? 'private' : 'public';
}

export function resolveClientIpDetailed(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
  trust: ProxyTrust = 'auto',
  trustCfConnectingIp = false,
): ResolvedClientIp {
  const socketIp = socketRemoteAddress
    ? stripIpv6Prefix(socketRemoteAddress.trim())
    : null;
  const useHeaders =
    typeof trust === 'number' ? trust > 0 : isPrivateOrLoopbackIp(socketIp);

  if (useHeaders) {
    const cfIpHeader = headers['cf-connecting-ip'];
    const rawCf = Array.isArray(cfIpHeader) ? cfIpHeader[0] : cfIpHeader;
    const cfIp = rawCf ? stripIpv6Prefix(rawCf.trim()) : null;
    // Solo con Cloudflare declarado: si no, el cliente puede falsificarlo.
    if (trustCfConnectingIp && cfIp && !isPrivateOrLoopbackIp(cfIp)) {
      return { ip: cfIp, source: 'cf-connecting-ip' };
    }

    const hops = parseXff(headers);
    if (hops.length > 0) {
      const trustedHops = typeof trust === 'number' ? Math.max(1, trust) : 1;
      for (
        let index = Math.max(0, hops.length - trustedHops);
        index >= 0;
        index -= 1
      ) {
        const candidate = stripIpv6Prefix(hops[index]);
        if (!isPrivateOrLoopbackIp(candidate)) {
          return { ip: candidate, source: 'x-forwarded-for' };
        }
      }
    }
  }

  return { ip: socketIp, source: socketIp ? 'socket' : 'none' };
}

export function describeClientNetwork(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
  trust: ProxyTrust = 'auto',
  trustCfConnectingIp = false,
): ClientNetworkInfo {
  const resolved = resolveClientIpDetailed(
    headers,
    socketRemoteAddress,
    trust,
    trustCfConnectingIp,
  );
  const hops = parseXff(headers);
  return {
    trust,
    cfHeaders: trustCfConnectingIp,
    peer: classifyIp(socketRemoteAddress ?? null),
    forwarded: hops.length,
    hopClasses: hops.slice(0, 10).map((hop) => classifyIp(hop)),
    cfConnectingIp: headers['cf-connecting-ip'] !== undefined,
    xRealIp: headers['x-real-ip'] !== undefined,
    source: resolved.source,
    client: classifyIp(resolved.ip),
  };
}

export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
  trust: ProxyTrust = 'auto',
  trustCfConnectingIp = false,
): string | null {
  return resolveClientIpDetailed(
    headers,
    socketRemoteAddress,
    trust,
    trustCfConnectingIp,
  ).ip;
}

function stripIpv6Prefix(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

export function isPrivateOrLoopbackIp(ip: string | null): boolean {
  if (!ip) return true;
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80:')
  ) {
    return true;
  }
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function getHeaderStr(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const v = headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim().length > 0 ? s.trim() : null;
}

const MAX_CITY_NAME_LENGTH = 64;
const MAX_REGION_LENGTH = 64;

const UNKNOWN_LOCATION: ResolvedCityMetadata = {
  key: 'unknown',
  name: 'Ubicación desconocida',
  region: '',
  country: '',
  countryCode: '',
  lat: null,
  lon: null,
};

/** Cleans and truncates client-controlled text before broadcasting it. */
function clampText(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export interface GeoResolutionOptions {
  /** Nº de proxies de confianza, o 'auto' (por defecto). */
  trustedProxyHops?: ProxyTrust;
  /** Aceptar CF-Connecting-IP y cabeceras CF-* (Cloudflare delante). */
  trustCfHeaders?: boolean;
}

/**
 * Resolves approximate city/country metadata from headers or offline GeoIP.
 * Never persists or logs the IP address.
 *
 * Header data is only trusted when explicitly configured: CF-* needs
 * Cloudflare in front, and X-Forwarded-For needs trusted proxy hops.
 */
export function resolveLocationFromRequest(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
  geoLookupFn: (ip: string) => GeoLookupResult | null,
  options: GeoResolutionOptions = {},
): ResolvedCityMetadata {
  const trustedProxyHops = options.trustedProxyHops ?? 'auto';
  const trustCfHeaders = options.trustCfHeaders === true;

  // 1. Cloudflare proxy headers (opt-in, clamped)
  const cfCity = clampText(getHeaderStr(headers, 'cf-ipcity'), MAX_CITY_NAME_LENGTH);
  const cfRegion = clampText(
    getHeaderStr(headers, 'cf-region-code') ?? getHeaderStr(headers, 'cf-region'),
    MAX_REGION_LENGTH,
  );
  const cfCountryRaw = clampText(getHeaderStr(headers, 'cf-ipcountry'), 8);
  const cfCountry = cfCountryRaw ? cfCountryRaw.toUpperCase() : null;
  const cfLat = getHeaderStr(headers, 'cf-iplatitude');
  const cfLon = getHeaderStr(headers, 'cf-iplongitude');

  if (
    trustCfHeaders &&
    cfCountry &&
    /^[A-Z]{2}$/.test(cfCountry) &&
    cfCountry !== 'XX' &&
    cfCountry !== 'T1'
  ) {
    const cc = cfCountry;
    const countryMeta = COUNTRY_CENTROIDS[cc];
    const countryName = countryMeta?.name ?? cc;
    if (cfCity && cfLat !== null && cfLon !== null) {
      const lat = Number(cfLat);
      const lon = Number(cfLon);
      if (isValidLatitude(lat) && isValidLongitude(lon)) {
        return {
          key: buildCityKey(cfCity, cfRegion, cc),
          name: cfCity,
          region: cfRegion ?? '',
          country: countryName,
          countryCode: cc,
          lat: roundCityCoord(lat),
          lon: roundCityCoord(lon),
        };
      }
    }
    if (countryMeta) {
      return {
        key: buildCityKey(null, null, cc),
        name: countryMeta.name,
        region: '',
        country: countryMeta.name,
        countryCode: cc,
        lat: roundCityCoord(countryMeta.lat),
        lon: roundCityCoord(countryMeta.lon),
      };
    }
  }

  // 2. Offline GeoIP lookup on non-private IP (discarded immediately)
  const ip = resolveClientIp(
    headers,
    socketRemoteAddress,
    trustedProxyHops,
    trustCfHeaders,
  );
  if (ip && !isPrivateOrLoopbackIp(ip)) {
    const geo = geoLookupFn(ip);
    if (geo && geo.country) {
      const cc = geo.country.toUpperCase();
      const countryMeta = COUNTRY_CENTROIDS[cc];
      const countryName = countryMeta?.name ?? cc;
      const cityName = clampText(geo.city ?? null, MAX_CITY_NAME_LENGTH);
      const regionName =
        clampText(geo.region ?? null, MAX_REGION_LENGTH) ?? '';
      const hasCoords =
        Array.isArray(geo.ll) &&
        isValidLatitude(geo.ll[0]) &&
        isValidLongitude(geo.ll[1]);

      if (cityName && hasCoords && geo.ll) {
        return {
          key: buildCityKey(cityName, regionName, cc),
          name: cityName,
          region: regionName,
          country: countryName,
          countryCode: cc,
          lat: roundCityCoord(geo.ll[0]),
          lon: roundCityCoord(geo.ll[1]),
        };
      }

      if (countryMeta) {
        return {
          key: buildCityKey(null, null, cc),
          name: countryMeta.name,
          region: '',
          country: countryMeta.name,
          countryCode: cc,
          lat: roundCityCoord(countryMeta.lat),
          lon: roundCityCoord(countryMeta.lon),
        };
      }

      if (hasCoords && geo.ll) {
        return {
          key: buildCityKey(null, null, cc),
          name: countryName,
          region: '',
          country: countryName,
          countryCode: cc,
          lat: roundCityCoord(geo.ll[0]),
          lon: roundCityCoord(geo.ll[1]),
        };
      }
    }
  }

  // 3. Fallback when neither city nor country is available (VPN, IPv6, localhost)
  return { ...UNKNOWN_LOCATION };
}
