import 'dotenv/config';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import geoip from 'geoip-lite';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { isOriginAllowed, parseAllowedOrigins } from './src/server/cors.ts';
import { initDatabase } from './src/server/db.ts';
import {
  resolveClientIp,
  resolveLocationFromRequest,
  type ProxyTrust,
} from './src/shared/geoResolver.ts';
import { PresenceStore } from './src/shared/presenceLogic.ts';
import type { ClientWsMessage, ServerWsMessage } from './src/shared/types.ts';

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CONFIGURED_ORIGINS = parseAllowedOrigins(
  process.env.APP_URL,
  process.env.ALLOWED_ORIGINS,
);

// 'auto' = detectar el proxy por la IP del par; 0 = ignorar cabeceras; N = saltos.
const RAW_TRUST_PROXY_HOPS = process.env.TRUST_PROXY_HOPS?.trim();
const PARSED_PROXY_HOPS = Number(RAW_TRUST_PROXY_HOPS);
const TRUSTED_PROXY_HOPS: ProxyTrust =
  RAW_TRUST_PROXY_HOPS === undefined || RAW_TRUST_PROXY_HOPS === ''
    ? 'auto'
    : Number.isInteger(PARSED_PROXY_HOPS) && PARSED_PROXY_HOPS >= 0
      ? PARSED_PROXY_HOPS
      : 'auto';
// Las cabeceras CF-* solo se usan si Cloudflare está delante (opt-in).
const TRUST_CF_HEADERS = process.env.TRUST_CF_HEADERS === '1';
const MAX_WS_CONNECTIONS = readPositiveInt(process.env.MAX_WS_CONNECTIONS, 5000);
const MAX_WS_PER_IP = readPositiveInt(process.env.MAX_WS_PER_IP, 16);
const WS_ATTEMPTS_PER_MINUTE = readPositiveInt(
  process.env.WS_ATTEMPTS_PER_MINUTE,
  40,
);
const MAX_PRESENCE_CITIES = readPositiveInt(process.env.MAX_PRESENCE_CITIES, 500);
const HTTP_API_LIMIT_PER_MINUTE = readPositiveInt(
  process.env.HTTP_API_LIMIT_PER_MINUTE,
  120,
);
const HTTP_AUDIO_LIMIT_PER_MINUTE = readPositiveInt(
  process.env.HTTP_AUDIO_LIMIT_PER_MINUTE,
  300,
);

const radioState = initDatabase(DATA_DIR);
const presence = new PresenceStore({ maxCities: MAX_PRESENCE_CITIES });

const app = express();
app.disable('x-powered-by');
app.set(
  'trust proxy',
  TRUSTED_PROXY_HOPS === 'auto' ? 1 : TRUSTED_PROXY_HOPS > 0 ? TRUSTED_PROXY_HOPS : false,
);

// Baseline security headers. Directives shared by both environments live in
// one place so production and development cannot drift apart.
const CSP_BASE = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https://freemusicarchive.org https://*.freemusicarchive.org",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
];

const CSP_PRODUCTION = [
  ...CSP_BASE,
  "script-src 'self'",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
].join('; ');

// Dev keeps HMR (inline/eval) and framing working for the local preview.
const CSP_DEVELOPMENT = [
  ...CSP_BASE,
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' http: https: ws: wss:",
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    IS_PRODUCTION ? CSP_PRODUCTION : CSP_DEVELOPMENT,
  );
  if (IS_PRODUCTION) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=15552000; includeSubDomains',
    );
  }
  next();
});

// Restrictive CORS for time, playlist, and audio range requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin, req.headers.host)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Range, Content-Length, Accept-Ranges',
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function isAllowedOrigin(
  origin: string | undefined,
  hostHeader: string | undefined,
): boolean {
  // Los orígenes locales solo se aceptan fuera de producción.
  return isOriginAllowed(origin, hostHeader, CONFIGURED_ORIGINS, {
    allowLocalhost: !IS_PRODUCTION,
  });
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const httpRateBuckets: Array<Map<string, RateBucket>> = [];

/**
 * Consume one slot from a fixed-window bucket. Returns false when the limit
 * has been reached for the current window.
 */
function consumeRateLimit(
  buckets: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) {
    return false;
  }
  entry.count += 1;
  return true;
}

function pruneRateBuckets(buckets: Map<string, RateBucket>, now: number): void {
  for (const [key, entry] of buckets.entries()) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}

/** Hash of the client IP; raw addresses are never stored or logged. */
function hashClientIp(ip: string | null): string {
  return crypto
    .createHash('sha256')
    .update(ip ?? 'unknown')
    .digest('hex')
    .slice(0, 16);
}

function clientIpHashFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress: string | undefined,
): string {
  return hashClientIp(resolveClientIp(headers, remoteAddress, TRUSTED_PROXY_HOPS));
}

function createHttpRateLimiter(maxPerMinute: number) {
  const buckets = new Map<string, RateBucket>();
  httpRateBuckets.push(buckets);
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientIpHashFromHeaders(req.headers, req.socket.remoteAddress);
    if (!consumeRateLimit(buckets, key, maxPerMinute, 60_000)) {
      res.setHeader('Retry-After', '60');
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

const apiRateLimiter = createHttpRateLimiter(HTTP_API_LIMIT_PER_MINUTE);
const audioRateLimiter = createHttpRateLimiter(HTTP_AUDIO_LIMIT_PER_MINUTE);

// Healthcheck endpoint for Dokploy / container orchestrators
app.get(['/health', '/api/health'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    tracks: radioState.tracks.length,
    listeners: presence.getSnapshot().total,
  });
});

// Time sync endpoint
app.get(['/time', '/api/time'], apiRateLimiter, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ now: Date.now() });
});

// Shared playlist & credits metadata endpoint
app.get(['/playlist', '/api/playlist'], apiRateLimiter, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json(radioState);
});

// Range-capable audio streaming endpoint (tracks & ambient loops)
app.get('/audio/:folder/:file', audioRateLimiter, async (req, res) => {
  const { folder, file } = req.params;
  if (folder !== 'tracks' && folder !== 'ambient') {
    res.status(404).end();
    return;
  }
  if (!/^[a-zA-Z0-9._-]+\.wav$/.test(file)) {
    res.status(400).end();
    return;
  }

  // Defense in depth: the resolved path must stay inside the audio directory.
  const baseDir = path.resolve(AUDIO_DIR);
  const folderDir = path.join(baseDir, folder);
  const filePath = path.resolve(folderDir, file);
  if (!filePath.startsWith(`${folderDir}${path.sep}`)) {
    res.status(404).end();
    return;
  }

  let total: number;
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      res.status(404).end();
      return;
    }
    total = stat.size;
  } catch {
    res.status(404).end();
    return;
  }

  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  let start = 0;
  let end = total - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }

    const [, rawStart, rawEnd] = match;
    if (!rawStart) {
      // Suffix range: "bytes=-N" means the last N bytes.
      const suffix = Number.parseInt(rawEnd, 10);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
        return;
      }
      start = Math.max(0, total - suffix);
      end = total - 1;
    } else {
      start = Number.parseInt(rawStart, 10);
      end = rawEnd
        ? Math.min(Number.parseInt(rawEnd, 10), total - 1)
        : total - 1;
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= total ||
      end < start
    ) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }

    status = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  }

  res.status(status);
  res.setHeader('Content-Length', String(end - start + 1));

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath, { start, end });
  // An unhandled stream error used to crash the whole process.
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy();
    }
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
});

const server = http.createServer(app);
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 65_000;
server.maxHeadersCount = 200;

server.on('error', (error) => {
  console.error('[server] HTTP server error:', error);
});

// WebSocket presence server
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 512,
});

// Ephemeral in-memory guards (hashed IP keys, auto-cleaned, never logged)
const ipAttemptBuckets = new Map<string, RateBucket>();
const wsConnectionsPerIp = new Map<string, number>();
const sessionSockets = new Map<string, WebSocket>();
let warnedUnknownGeo = false;

function rejectUpgrade(
  socket: { write: (chunk: string) => unknown; destroy: () => void },
  status: string,
): void {
  socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', (req, socket, head) => {
  // Never let an unhandled socket error take down the process.
  socket.on('error', () => socket.destroy());

  const urlPath = (req.url ?? '').split('?')[0];
  if (urlPath !== '/ws') {
    // Without destroy() the socket stays open forever (descriptor leak).
    socket.destroy();
    return;
  }

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req.headers.host)) {
    rejectUpgrade(socket, '403 Forbidden');
    return;
  }

  const ipHash = clientIpHashFromHeaders(req.headers, req.socket.remoteAddress);

  if (
    !consumeRateLimit(ipAttemptBuckets, ipHash, WS_ATTEMPTS_PER_MINUTE, 60_000)
  ) {
    rejectUpgrade(socket, '429 Too Many Requests');
    return;
  }

  const activeForIp = wsConnectionsPerIp.get(ipHash) ?? 0;
  if (wss.clients.size >= MAX_WS_CONNECTIONS || activeForIp >= MAX_WS_PER_IP) {
    rejectUpgrade(socket, '503 Service Unavailable');
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function sendJson(ws: WebSocket, msg: ServerWsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws, req) => {
  const sessionId = crypto.randomUUID();
  // Same deterministic hash the upgrade guard used for this socket.
  const ipHash = clientIpHashFromHeaders(req.headers, req.socket.remoteAddress);
  wsConnectionsPerIp.set(ipHash, (wsConnectionsPerIp.get(ipHash) ?? 0) + 1);

  const cityMeta = resolveLocationFromRequest(
    req.headers,
    req.socket.remoteAddress,
    (ip) => geoip.lookup(ip),
    { trustedProxyHops: TRUSTED_PROXY_HOPS, trustCfHeaders: TRUST_CF_HEADERS },
  );

  if (cityMeta.key === 'unknown' && !warnedUnknownGeo) {
    warnedUnknownGeo = true;
    console.warn(
      '[server] First connection without geolocation: check that the proxy forwards X-Forwarded-For (or set TRUST_CF_HEADERS=1 behind Cloudflare).',
    );
  }

  const assignedCity = presence.addSession(sessionId, cityMeta, Date.now());
  sessionSockets.set(sessionId, ws);

  const snapshot = presence.getSnapshot();
  sendJson(ws, {
    type: 'hello',
    serverTime: Date.now(),
    city: assignedCity,
    total: snapshot.total,
  });
  sendJson(ws, {
    type: 'snapshot',
    total: snapshot.total,
    cities: snapshot.cities,
  });

  let lastPingAt = 0;

  ws.on('message', (raw) => {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      if (text.length > 256) return;
      const parsed = JSON.parse(text) as Partial<ClientWsMessage>;
      if (parsed.type === 'ping' && typeof parsed.t === 'number') {
        const now = Date.now();
        if (now - lastPingAt < 2000) return; // Rate limit pings
        lastPingAt = now;
        presence.touchSession(sessionId, now);
        sendJson(ws, {
          type: 'pong',
          t: parsed.t,
          serverTime: now,
        });
      }
    } catch {
      // Ignore malformed client payloads
    }
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    sessionSockets.delete(sessionId);
    presence.removeSession(sessionId);
    const active = wsConnectionsPerIp.get(ipHash) ?? 0;
    if (active <= 1) {
      wsConnectionsPerIp.delete(ipHash);
    } else {
      wsConnectionsPerIp.set(ipHash, active - 1);
    }
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

// Aggregated presence diff broadcast every 1.5 seconds
setInterval(() => {
  const diff = presence.flushDiff();
  if (!diff) return;
  const payload = JSON.stringify({
    type: 'diff',
    total: diff.total,
    cities: diff.cities,
  } satisfies ServerWsMessage);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}, 1500);

// Prune expired sessions (> 60s without heartbeat) every 20s and clean guards
setInterval(() => {
  const now = Date.now();
  const expiredIds = presence.pruneExpired(now, 60_000);
  for (const id of expiredIds) {
    const ws = sessionSockets.get(id);
    sessionSockets.delete(id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.terminate();
    }
  }
  pruneRateBuckets(ipAttemptBuckets, now);
  for (const buckets of httpRateBuckets) {
    pruneRateBuckets(buckets, now);
  }
}, 20_000);

async function start(): Promise<void> {
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({
          service: 'planeta-lofi-api',
          status: 'ok',
        });
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Planeta Lo-Fi server listening on http://localhost:${PORT}`);
    console.log(
      `[server] client IP: trust=${TRUSTED_PROXY_HOPS} cf-headers=${TRUST_CF_HEADERS ? 'on' : 'off'}`,
    );
    if (IS_PRODUCTION && TRUSTED_PROXY_HOPS === 0) {
      console.warn(
        '[server] TRUST_PROXY_HOPS=0: geo and per-IP limits use the socket address. Set 1 behind a reverse proxy.',
      );
    }
  });
}

start().catch((error) => {
  console.error('[server] Failed to start:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('[server] Uncaught exception:', error);
  process.exit(1);
});
