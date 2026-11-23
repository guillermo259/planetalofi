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

export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
): string | null {
  const xff = headers['x-forwarded-for'];
  const rawXff = Array.isArray(xff) ? xff[0] : xff;
  if (rawXff) {
    const first = rawXff.split(',')[0]?.trim();
    if (first) return stripIpv6Prefix(first);
  }
  const cfIp = headers['cf-connecting-ip'];
  const rawCf = Array.isArray(cfIp) ? cfIp[0] : cfIp;
  if (rawCf) return stripIpv6Prefix(rawCf.trim());

  if (socketRemoteAddress) return stripIpv6Prefix(socketRemoteAddress.trim());
  return null;
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

/**
 * Resolves approximate city/country metadata from headers or offline GeoIP.
 * Never persists or logs the IP address.
 */
export function resolveLocationFromRequest(
  headers: Record<string, string | string[] | undefined>,
  socketRemoteAddress: string | undefined,
  geoLookupFn: (ip: string) => GeoLookupResult | null,
): ResolvedCityMetadata {
  // 1. Cloudflare proxy headers if available
  const cfCity = getHeaderStr(headers, 'cf-ipcity');
  const cfRegion = getHeaderStr(headers, 'cf-region-code') ?? getHeaderStr(headers, 'cf-region');
  const cfCountry = getHeaderStr(headers, 'cf-ipcountry');
  const cfLat = getHeaderStr(headers, 'cf-iplatitude');
  const cfLon = getHeaderStr(headers, 'cf-iplongitude');

  if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
    const cc = cfCountry.toUpperCase();
    const countryMeta = COUNTRY_CENTROIDS[cc];
    const countryName = countryMeta?.name ?? cc;
    if (cfCity && cfLat && cfLon) {
      const lat = Number(cfLat);
      const lon = Number(cfLon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
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
  const ip = extractClientIp(headers, socketRemoteAddress);
  if (ip && !isPrivateOrLoopbackIp(ip)) {
    const geo = geoLookupFn(ip);
    if (geo && geo.country) {
      const cc = geo.country.toUpperCase();
      const countryMeta = COUNTRY_CENTROIDS[cc];
      const countryName = countryMeta?.name ?? cc;
      const hasCoords =
        Array.isArray(geo.ll) &&
        Number.isFinite(geo.ll[0]) &&
        Number.isFinite(geo.ll[1]);

      if (geo.city && hasCoords && geo.ll) {
        return {
          key: buildCityKey(geo.city, geo.region, cc),
          name: geo.city,
          region: geo.region ?? '',
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
  return {
    key: 'unknown',
    name: 'Ubicación desconocida',
    region: '',
    country: '',
    countryCode: '',
    lat: null,
    lon: null,
  };
}
