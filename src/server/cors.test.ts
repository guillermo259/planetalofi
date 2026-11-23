import assert from 'node:assert/strict';
import test from 'node:test';
import { isOriginAllowed, parseAllowedOrigins } from './cors.ts';

test('parseAllowedOrigins extracts normalized origins from APP_URL and comma-separated ALLOWED_ORIGINS', () => {
  const set = parseAllowedOrigins(
    'https://demo.example.com/app',
    'https://user.github.io/planeta-lofi/, http://staging.local:8080, invalid-url',
  );
  assert.equal(set.has('https://demo.example.com'), true);
  assert.equal(set.has('https://user.github.io'), true);
  assert.equal(set.has('http://staging.local:8080'), true);
  assert.equal(set.size, 3);
});

test('parseAllowedOrigins ignores placeholder MY_APP_URL', () => {
  const set = parseAllowedOrigins('MY_APP_URL', '');
  assert.equal(set.size, 0);
});

test('isOriginAllowed permits same-host, empty origin and configured origins', () => {
  const configured = parseAllowedOrigins(
    undefined,
    'https://user.github.io',
  );
  assert.equal(isOriginAllowed(undefined, 'api.example.com', configured), true);
  assert.equal(
    isOriginAllowed('https://api.example.com', 'api.example.com', configured),
    true,
  );
  assert.equal(
    isOriginAllowed('http://localhost:5173', 'api.example.com', configured),
    false,
  );
  assert.equal(
    isOriginAllowed('http://localhost:5173', 'api.example.com', configured, {
      allowLocalhost: true,
    }),
    true,
  );
  assert.equal(
    isOriginAllowed('https://user.github.io', 'api.example.com', configured),
    true,
  );
  assert.equal(
    isOriginAllowed('https://evil.example.net', 'api.example.com', configured),
    false,
  );
});
