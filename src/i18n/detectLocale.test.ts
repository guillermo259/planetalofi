import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLocale } from './detectLocale.ts';

test('detectLocale selects Spanish when browser prefers es-*', () => {
  assert.equal(detectLocale(['es-ES', 'en-US'], 'es-ES'), 'es');
  assert.equal(detectLocale(['es-419'], 'es'), 'es');
  assert.equal(detectLocale(undefined, 'es-CO'), 'es');
});

test('detectLocale selects English when browser prefers en-* or unsupported languages', () => {
  assert.equal(detectLocale(['en-US', 'es-ES'], 'en-US'), 'en');
  assert.equal(detectLocale(['fr-FR', 'de-DE'], 'fr-FR'), 'en');
  assert.equal(detectLocale([], ''), 'en');
  assert.equal(detectLocale(undefined, undefined), 'en');
});

test('detectLocale respects priority order across multiple languages', () => {
  assert.equal(detectLocale(['ja-JP', 'es-MX'], 'ja-JP'), 'es');
  assert.equal(detectLocale(['pt-BR', 'en-GB', 'es-ES'], 'pt-BR'), 'en');
});
