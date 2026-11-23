import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDaySkyBlend, createSeededRandom } from './daySkyMath.ts';

test('computeDaySkyBlend returns full visibility in day mode (nightMix = 0)', () => {
  const state = computeDaySkyBlend(0);
  assert.equal(state.dayMix, 1);
  assert.equal(state.skyAlpha, 1);
  assert.equal(state.visible, true);
});

test('computeDaySkyBlend returns hidden zero alpha in night mode (nightMix = 1)', () => {
  const state = computeDaySkyBlend(1);
  assert.equal(state.dayMix, 0);
  assert.equal(state.skyAlpha, 0);
  assert.equal(state.visible, false);
});

test('computeDaySkyBlend interpolates smoothly across transition and clamps out-of-range inputs', () => {
  const mid = computeDaySkyBlend(0.5);
  assert.ok(mid.visible);
  assert.ok(mid.skyAlpha > 0 && mid.skyAlpha < 1);

  const nearNight = computeDaySkyBlend(0.97);
  assert.equal(nearNight.visible, false);
  assert.equal(nearNight.skyAlpha, 0);

  assert.deepEqual(computeDaySkyBlend(-0.5), computeDaySkyBlend(0));
  assert.deepEqual(computeDaySkyBlend(1.5), computeDaySkyBlend(1));
});

test('createSeededRandom produces deterministic unit-interval values', () => {
  const a = createSeededRandom(9001);
  const b = createSeededRandom(9001);
  for (let i = 0; i < 10; i++) {
    const va = a();
    const vb = b();
    assert.equal(va, vb);
    assert.ok(va >= 0 && va <= 1);
  }
});
