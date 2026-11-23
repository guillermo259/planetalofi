import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PresenceStore,
  buildCityKey,
  markerIntensity,
  roundCityCoord,
} from './presenceLogic.ts';
import { resolveLocationFromRequest } from './geoResolver.ts';

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
  );
  assert.equal(withCity.key, 'madrid-md-es');
  assert.equal(withCity.lat, 40.4);
  assert.equal(withCity.lon, -3.7);

  const countryOnly = resolveLocationFromRequest(
    { 'x-forwarded-for': '8.8.8.8' },
    undefined,
    () => ({ city: '', region: '', country: 'CL', ll: null }),
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
