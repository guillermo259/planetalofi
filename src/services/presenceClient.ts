import { getApiUrl, getWsUrl } from '../config/endpoints.ts';
import { computeClockOffset } from '../shared/radioSync.ts';
import type {
  CityPresence,
  ConnectionState,
  ServerWsMessage,
} from '../shared/types.ts';

export interface PresenceSnapshot {
  connectionState: ConnectionState;
  total: number;
  cities: CityPresence[];
  userCity: CityPresence | null;
  clockOffsetMs: number;
  pulsedCityKeys: string[];
}

export class PresenceClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private total = 0;
  private cities = new Map<string, CityPresence>();
  private userCity: CityPresence | null = null;
  private clockOffsetMs = 0;
  private pulsedCityKeys: string[] = [];

  private retryAttempt = 0;
  private retryTimerId: number | null = null;
  private pingTimerId: number | null = null;
  private disposed = false;
  private listeners = new Set<(snap: PresenceSnapshot) => void>();

  subscribe(cb: (snap: PresenceSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.getSnapshot());
    return () => {
      this.listeners.delete(cb);
    };
  }

  getSnapshot(): PresenceSnapshot {
    return {
      connectionState: this.state,
      total: this.total,
      cities: Array.from(this.cities.values()),
      userCity: this.userCity,
      clockOffsetMs: this.clockOffsetMs,
      pulsedCityKeys: this.pulsedCityKeys,
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const cb of this.listeners) {
      cb(snap);
    }
  }

  connect(): void {
    this.disposed = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.retryTimerId !== null) {
      window.clearTimeout(this.retryTimerId);
      this.retryTimerId = null;
    }

    this.state = this.retryAttempt > 0 ? 'reconnecting' : 'connecting';
    this.emit();

    void this.syncHttpTime();

    const wsUrl = getWsUrl('/ws');

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.retryAttempt = 0;
        this.state = 'online';
        this.startHeartbeat();
        this.emit();
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerWsMessage;
          this.handleMessage(msg);
        } catch {
          // ignore invalid JSON
        }
      });

      ws.addEventListener('close', () => {
        this.stopHeartbeat();
        this.ws = null;
        if (!this.disposed) {
          this.scheduleReconnect();
        }
      });

      ws.addEventListener('error', () => {
        // close event will handle reconnect
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  retryNow(): void {
    this.retryAttempt = 0;
    this.connect();
  }

  private async syncHttpTime(): Promise<void> {
    try {
      const t0 = Date.now();
      const res = await fetch(getApiUrl('/api/time'), { cache: 'no-store' });
      const data = (await res.json()) as { now: number };
      const t1 = Date.now();
      if (typeof data.now === 'number') {
        const { offsetMs } = computeClockOffset(t0, data.now, t1);
        this.clockOffsetMs = offsetMs;
        this.emit();
      }
    } catch {
      // fallback to WebSocket pong
    }
  }

  private handleMessage(msg: ServerWsMessage): void {
    if (msg.type === 'hello') {
      this.clockOffsetMs = msg.serverTime - Date.now();
      this.userCity = msg.city;
      this.total = msg.total;
      this.emit();
      return;
    }

    if (msg.type === 'snapshot') {
      this.cities.clear();
      for (const c of msg.cities) {
        this.cities.set(c.key, c);
      }
      this.total = msg.total;
      this.pulsedCityKeys = [];
      this.emit();
      return;
    }

    if (msg.type === 'diff') {
      const newlyIncremented: string[] = [];
      for (const item of msg.cities) {
        if (item.n <= 0) {
          this.cities.delete(item.key);
        } else {
          const prev = this.cities.get(item.key);
          if (!prev || item.n > prev.n) {
            newlyIncremented.push(item.key);
          }
          this.cities.set(item.key, {
            key: item.key,
            name: item.name ?? prev?.name ?? item.key,
            region: item.region ?? prev?.region ?? '',
            country: item.country ?? prev?.country ?? '',
            countryCode: item.countryCode ?? prev?.countryCode ?? '',
            lat: item.lat !== undefined ? item.lat : (prev?.lat ?? null),
            lon: item.lon !== undefined ? item.lon : (prev?.lon ?? null),
            n: item.n,
          });
        }
      }
      this.total = msg.total;
      this.pulsedCityKeys = newlyIncremented;
      this.emit();
      return;
    }

    if (msg.type === 'pong') {
      const t1 = Date.now();
      const { offsetMs } = computeClockOffset(msg.t, msg.serverTime, t1);
      this.clockOffsetMs = offsetMs;
      this.emit();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimerId = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
      }
    }, 24_000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimerId !== null) {
      window.clearInterval(this.pingTimerId);
      this.pingTimerId = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const baseMs = Math.min(30_000, 1000 * Math.pow(2, this.retryAttempt));
    const jitter = Math.floor(Math.random() * 500);
    this.retryAttempt += 1;
    this.state = this.retryAttempt >= 4 ? 'offline' : 'reconnecting';
    this.emit();

    this.retryTimerId = window.setTimeout(() => {
      this.connect();
    }, baseMs + jitter);
  }

  dispose(): void {
    this.disposed = true;
    this.stopHeartbeat();
    if (this.retryTimerId !== null) {
      window.clearTimeout(this.retryTimerId);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
