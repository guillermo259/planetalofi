import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApiUrl,
  buildWsUrl,
  normalizeApiBaseUrl,
} from './endpoints.ts';

test('normalizeApiBaseUrl trims whitespace and trailing slashes', () => {
  assert.equal(normalizeApiBaseUrl(''), '');
  assert.equal(normalizeApiBaseUrl('  https://api.planeta.dev///  '), 'https://api.planeta.dev');
});

test('buildApiUrl resolves relative paths against base URL and preserves absolute URLs', () => {
  assert.equal(buildApiUrl('/api/playlist', ''), '/api/playlist');
  assert.equal(
    buildApiUrl('/api/playlist', 'https://api.planeta.dev/'),
    'https://api.planeta.dev/api/playlist',
  );
  assert.equal(
    buildApiUrl('audio/ambient/rain.wav', 'https://api.planeta.dev'),
    'https://api.planeta.dev/audio/ambient/rain.wav',
  );
  assert.equal(
    buildApiUrl(
      'https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/foo.mp3',
      'https://api.planeta.dev',
    ),
    'https://files.freemusicarchive.org/storage-freemusicarchive-org/tracks/foo.mp3',
  );
});

test('buildWsUrl maps http/https base URLs to ws/wss and falls back to window location', () => {
  assert.equal(
    buildWsUrl('/ws', 'https://api.planeta.dev', {
      protocol: 'https:',
      host: 'user.github.io',
    }),
    'wss://api.planeta.dev/ws',
  );
  assert.equal(
    buildWsUrl('/ws', 'http://localhost:3000/', {
      protocol: 'http:',
      host: 'localhost:5173',
    }),
    'ws://localhost:3000/ws',
  );
  assert.equal(
    buildWsUrl('/ws', '', { protocol: 'https:', host: 'example.com' }),
    'wss://example.com/ws',
  );
});
