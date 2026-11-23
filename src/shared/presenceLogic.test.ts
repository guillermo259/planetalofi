import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PresenceStore,
  buildCityKey,
  markerIntensity,
  roundCityCoord,
} from './presenceLogic.ts';
import {
  describeClientNetwork,
  resolveClientIp,
  resolveLocationFromRequest,
} from './geoResolver.ts';

test('buildCityKey normalizes accents and distinguishes homonyms by region and country', () => {
  assert.equal(buildCityKey('Bogotá', 'DC', 'CO'), 'bogota-dc-co');
  assert.equal(buildCityKey('Córdoba', 'AN', 'ES'), 'cordoba-an-es');
  assert.equal(buildCityKey('Córdoba', 'CB', 'AR'), 'cordoba-cb-ar');
  assert.equal(buildCityKey(null, null, 'JP'), 'country-jp');
  assert.equal(buildCityKey(null, null, null), 'unknown');
});

test('markerIntensity scales smoothly and stays bounded below 1', () => {
  const i1 = markerIntensity(1);
  const i10 = markerIntensity(10);
  const i500 = markerIntensity(500);
  assert.ok(i1 > 0.05);
  assert.ok(i10 > i1);
  assert.ok(i500 > i10 && i500 <= 1.0);
});

test('roundCityCoord rounds coordinates to ~0.1 degree precision', () => {
  assert.equal(roundCityCoord(4.711034), 4.7);
  assert.equal(roundCityCoord(-74.07209), -74.1);
});

test('PresenceStore tracks adds, diffs, removals, and heartbeat expiration', () => {
  const store = new PresenceStore();
  const bogota = {
    key: 'bogota-dc-co',
    name: 'Bogotá',
    region: 'DC',
    country: 'Colombia',
    countryCode: 'CO',
    lat: 4.7,
    lon: -74.1,
  };

  store.addSession('s1', bogota, 1000);
  store.addSession('s2', bogota, 1100);
  assert.equal(store.getTotal(), 2);

  const diff1 = store.flushDiff();
  assert.ok(diff1);
  assert.equal(diff1.total, 2);
  assert.deepEqual(diff1.cities.map((c) => [c.key, c.n]), [['bogota-dc-co', 2]]);
  assert.equal(store.flushDiff(), null);

  store.touchSession('s1', 5000);
  const expired = store.pruneExpired(6000, 4000);
  assert.deepEqual(expired, ['s2']);
  assert.equal(store.getTotal(), 1);

  store.removeSession('s1');
  const diff2 = store.flushDiff();
  assert.ok(diff2);
  assert.equal(diff2.total, 0);
  assert.deepEqual(diff2.cities, [{ key: 'bogota-dc-co', n: 0 }]);
});

test('resolveLocationFromRequest degrades gracefully for city, country-only, and unknown IP', () => {
  const withCity = resolveLocationFromRequest(
    { 'x-forwarded-for': '8.8.8.8' },
    undefined,
    () => ({ city: 'Madrid', region: 'MD', country: 'ES', ll: [40.4168, -3.7038] }),
    { trustedProxyHops: 1 },
  );
  assert.equal(withCity.key, 'madrid-md-es');
  assert.equal(withCity.lat, 40.4);
  assert.equal(withCity.lon, -3.7);

  const countryOnly = resolveLocationFromRequest(
    { 'x-forwarded-for': '8.8.8.8' },
    undefined,
    () => ({ city: '', region: '', country: 'CL', ll: null }),
    { trustedProxyHops: 1 },
  );
  assert.equal(countryOnly.key, 'country-cl');
  assert.equal(countryOnly.name, 'Chile');
  assert.equal(typeof countryOnly.lat, 'number');

  const localhost = resolveLocationFromRequest(
    {},
    '::1',
    () => null,
  );
  assert.equal(localhost.key, 'unknown');
  assert.equal(localhost.name, 'Ubicación desconocida');
  assert.equal(localhost.lat, null);
});

test('resolveClientIp only trusts the configured proxy hops', () => {
  const headers = { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' };
  assert.equal(resolveClientIp(headers, '9.9.9.9', 0), '9.9.9.9');
  // El proxy de confianza añade su entrada a la derecha: se lee desde ahí.
  assert.equal(resolveClientIp(headers, '9.9.9.9', 1), '5.6.7.8');
  assert.equal(resolveClientIp(headers, '9.9.9.9', 2), '1.2.3.4');
  assert.equal(resolveClientIp({}, '9.9.9.9', 1), '9.9.9.9');
});

test('resolveClientIp skips private proxy hops to reach the real client', () => {
  assert.equal(
    resolveClientIp(
      { 'x-forwarded-for': '203.0.113.9, 172.18.0.2' },
      '172.18.0.3',
      1,
    ),
    '203.0.113.9',
  );
  assert.equal(
    resolveClientIp(
      { 'x-forwarded-for': '203.0.113.9, 10.0.0.5, 172.18.0.2' },
      '172.18.0.3',
      1,
    ),
    '203.0.113.9',
  );
  // Cadena completamente interna: se cae al socket.
  assert.equal(
    resolveClientIp(
      { 'x-forwarded-for': '10.1.2.3, 172.18.0.2' },
      '172.18.0.3',
      1,
    ),
    '172.18.0.3',
  );
  // CF-Connecting-IP no se usa salvo con Cloudflare declarado.
  assert.equal(
    resolveClientIp(
      { 'x-forwarded-for': '172.18.0.2', 'cf-connecting-ip': '203.0.113.9' },
      '172.18.0.3',
      1,
    ),
    '172.18.0.3',
  );
});

test('resolveClientIp auto-detects the proxy from a private peer', () => {
  const headers = { 'x-forwarded-for': '203.0.113.9, 172.18.0.2' };
  // Par privado (detrás de Traefik/Docker): se usan las cabeceras.
  assert.equal(resolveClientIp(headers, '172.18.0.3'), '203.0.113.9');
  // Par público (expuesto directo): la cabecera es falsificable y se ignora.
  assert.equal(resolveClientIp(headers, '198.51.100.20'), '198.51.100.20');
  // 0 fuerza a ignorar cabeceras incluso detrás de un proxy.
  assert.equal(resolveClientIp(headers, '172.18.0.3', 0), '172.18.0.3');
});

test('resolveClientIp uses CF-Connecting-IP only when Cloudflare is declared', () => {
  const headers = {
    'x-forwarded-for': '172.18.0.2',
    'cf-connecting-ip': '203.0.113.9',
  };
  assert.equal(resolveClientIp(headers, '172.18.0.3', 'auto', false), '172.18.0.3');
  assert.equal(resolveClientIp(headers, '172.18.0.3', 'auto', true), '203.0.113.9');
});

test('describeClientNetwork explains a chain that yields no public client IP', () => {
  const info = describeClientNetwork(
    { 'x-forwarded-for': '172.18.0.2' },
    '172.18.0.3',
  );
  assert.deepEqual(info, {
    trust: 'auto',
    cfHeaders: false,
    peer: 'private',
    forwarded: 1,
    hopClasses: ['private'],
    cfConnectingIp: false,
    xRealIp: false,
    source: 'socket',
    client: 'private',
  });
});

test('describeClientNetwork exposes the two-public-hop edge case', () => {
  const headers = {
    'x-forwarded-for': '181.49.0.1, 162.158.1.1',
    'cf-connecting-ip': '181.49.0.1',
  };
  const info = describeClientNetwork(headers, '172.18.0.3');
  assert.equal(info.forwarded, 2);
  assert.deepEqual(info.hopClasses, ['public', 'public']);
  assert.equal(info.cfConnectingIp, true);
  // Sin opt-in se mide el último salto público (p. ej. el edge de Cloudflare).
  assert.equal(info.source, 'x-forwarded-for');
  assert.equal(info.client, 'public');

  const withCf = describeClientNetwork(headers, '172.18.0.3', 'auto', true);
  assert.equal(withCf.source, 'cf-connecting-ip');
});

test('resolveLocationFromRequest resolves the client behind extra proxy hops', () => {
  const resolved = resolveLocationFromRequest(
    { 'x-forwarded-for': '8.8.8.8, 172.18.0.2' },
    '172.18.0.3',
    () => ({ city: 'Madrid', region: 'MD', country: 'ES', ll: [40.4168, -3.7038] }),
    { trustedProxyHops: 1 },
  );
  assert.equal(resolved.key, 'madrid-md-es');
  assert.equal(resolved.name, 'Madrid');
});

test('resolveLocationFromRequest ignores and clamps spoofable geo headers', () => {
  const longName = 'X'.repeat(400);

  const ignored = resolveLocationFromRequest(
    {
      'cf-ipcountry': 'AR',
      'cf-ipcity': longName,
      'cf-iplatitude': '10',
      'cf-iplongitude': '20',
    },
    '203.0.113.5',
    () => null,
  );
  assert.equal(ignored.key, 'unknown');

  const clamped = resolveLocationFromRequest(
    {
      'cf-ipcountry': 'AR',
      'cf-ipcity': longName,
      'cf-region-code': 'B',
      'cf-iplatitude': '10',
      'cf-iplongitude': '20',
    },
    '203.0.113.5',
    () => null,
    { trustedProxyHops: 1, trustCfHeaders: true },
  );
  assert.equal(clamped.name.length, 64);
  assert.ok(clamped.key.length <= 80);

  const outOfRange = resolveLocationFromRequest(
    {
      'cf-ipcountry': 'AR',
      'cf-ipcity': 'Rosario',
      'cf-iplatitude': '999',
      'cf-iplongitude': '20',
    },
    '203.0.113.5',
    () => null,
    { trustedProxyHops: 1, trustCfHeaders: true },
  );
  assert.equal(outOfRange.key, 'country-ar');
});

test('PresenceStore caps the number of tracked cities', () => {
  const store = new PresenceStore({ maxCities: 2 });
  const city = (name: string) => ({
    key: name,
    name,
    region: '',
    country: '',
    countryCode: '',
    lat: null,
    lon: null,
  });

  store.addSession('a', city('a'), 1);
  store.addSession('b', city('b'), 1);
  const overflow = store.addSession('c', city('c'), 1);

  assert.equal(store.getTotal(), 3);
  assert.equal(overflow.key, 'unknown');
  // 2 ciudades + bucket compartido "unknown"; nunca crece sin cota.
  assert.equal(store.getSnapshot().cities.length, 3);
  store.addSession('d', city('d'), 1);
  assert.equal(store.getSnapshot().cities.length, 3);
});

test('PresenceStore summarizes listeners by country without cities or IPs', () => {
  const store = new PresenceStore();
  const city = (
    key: string,
    name: string,
    country: string,
    countryCode: string,
  ) => ({ key, name, region: '', country, countryCode, lat: null, lon: null });

  store.addSession('a', city('madrid-md-es', 'Madrid', 'España', 'ES'), 1);
  store.addSession('b', city('barcelona-ct-es', 'Barcelona', 'España', 'ES'), 1);
  store.addSession('c', city('country-us', 'Estados Unidos', 'Estados Unidos', 'US'), 1);
  store.addSession('d', city('unknown', '', '', ''), 1);

  assert.deepEqual(store.getGeoSummary(), {
    located: 3,
    unknown: 1,
    countries: [
      { code: 'ES', name: 'España', listeners: 2 },
      { code: 'US', name: 'Estados Unidos', listeners: 1 },
    ],
  });

  store.removeSession('a');
  assert.deepEqual(store.getGeoSummary().countries[0], {
    code: 'ES',
    name: 'España',
    listeners: 1,
  });

  // located + unknown siempre suma el total de oyentes.
  const summary = store.getGeoSummary();
  assert.equal(summary.located + summary.unknown, store.getTotal());
});
