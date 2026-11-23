import 'dotenv/config';
import express from 'express';
import geoip from 'geoip-lite';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { isOriginAllowed, parseAllowedOrigins } from './src/server/cors.ts';
import { initDatabase } from './src/server/db.ts';
import { resolveLocationFromRequest } from './src/shared/geoResolver.ts';
import { PresenceStore } from './src/shared/presenceLogic.ts';
import type { ClientWsMessage, ServerWsMessage } from './src/shared/types.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const CONFIGURED_ORIGINS = parseAllowedOrigins(
  process.env.APP_URL,
  process.env.ALLOWED_ORIGINS,
);

const radioState = initDatabase(DATA_DIR);
const presence = new PresenceStore();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

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
  return isOriginAllowed(origin, hostHeader, CONFIGURED_ORIGINS);
}

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
app.get(['/time', '/api/time'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ now: Date.now() });
});

// Shared playlist & credits metadata endpoint
app.get(['/playlist', '/api/playlist'], (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json(radioState);
});

// Range-capable audio streaming endpoint (tracks & ambient loops)
app.get('/audio/:folder/:file', (req, res) => {
  const { folder, file } = req.params;
  if (folder !== 'tracks' && folder !== 'ambient') {
    res.status(404).end();
    return;
  }
  if (!/^[a-zA-Z0-9._-]+\.wav$/.test(file)) {
    res.status(400).end();
    return;
  }

  const filePath = path.join(AUDIO_DIR, folder, file);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      start >= total ||
      end < start
    ) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(chunkSize));
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.status(200);
  res.setHeader('Content-Length', String(total));
  fs.createReadStream(filePath).pipe(res);
});

const server = http.createServer(app);

// WebSocket presence server
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 512,
});

// Ephemeral in-memory connection rate guard (hashed IP key, auto-cleaned, never logged)
const ipAttemptCounts = new Map<string, { count: number; resetAt: number }>();

function checkConnectionLimit(ipHash: string): boolean {
  const now = Date.now();
  const entry = ipAttemptCounts.get(ipHash);
  if (!entry || now > entry.resetAt) {
    ipAttemptCounts.set(ipHash, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 40) {
    return false;
  }
  entry.count += 1;
  return true;
}

const sessionSockets = new Map<string, WebSocket>();

server.on('upgrade', (req, socket, head) => {
  const urlPath = (req.url ?? '').split('?')[0];
  if (urlPath !== '/ws') {
    return;
  }

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req.headers.host)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  // Ephemeral hash only for rate-limiting window, never persisted or logged
  const rawIp = req.socket.remoteAddress ?? 'unknown';
  const ipHash = crypto
    .createHash('sha256')
    .update(rawIp)
    .digest('hex')
    .slice(0, 16);

  if (!checkConnectionLimit(ipHash)) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
    socket.destroy();
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
  const cityMeta = resolveLocationFromRequest(
    req.headers,
    req.socket.remoteAddress,
    (ip) => geoip.lookup(ip),
  );

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

  ws.on('close', () => {
    sessionSockets.delete(sessionId);
    presence.removeSession(sessionId);
  });

  ws.on('error', () => {
    sessionSockets.delete(sessionId);
    presence.removeSession(sessionId);
  });
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

// Prune expired sessions (> 60s without heartbeat) every 20s and clean rate map
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
  for (const [k, v] of ipAttemptCounts.entries()) {
    if (now > v.resetAt) ipAttemptCounts.delete(k);
  }
}, 20_000);

async function start(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
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
  });
}

start();
