import { getApiUrl } from '../config/endpoints.ts';
import {
  computePlaylistPosition,
  computeTrackEnvelopeMultiplier,
  shouldCorrectDrift,
} from '../shared/radioSync.ts';
import type { PlaylistResponse, TrackInfo } from '../shared/types.ts';

export type AmbientChannel = 'rain' | 'waves' | 'keyboard';

export interface AmbientChannelState {
  enabled: boolean;
  volume: number;
  loading: boolean;
}

export interface AudioEngineSnapshot {
  unlocked: boolean;
  audioBlocked: boolean;
  masterMuted: boolean;
  radioMuted: boolean;
  radioVolume: number;
  currentTrack: TrackInfo | null;
  trackProgressSec: number;
  trackError: boolean;
  ambient: Record<AmbientChannel, AmbientChannelState>;
}

const PREFS_KEY = 'planeta_lofi_audio_prefs_v1';

interface StoredAudioPrefs {
  radioVolume: number;
  radioMuted: boolean;
  masterMuted: boolean;
  ambient: Record<AmbientChannel, { enabled: boolean; volume: number }>;
}

function loadPrefs(): StoredAudioPrefs {
  const defaults: StoredAudioPrefs = {
    radioVolume: 0.72,
    radioMuted: false,
    masterMuted: false,
    ambient: {
      rain: { enabled: false, volume: 0.48 },
      waves: { enabled: false, volume: 0.42 },
      keyboard: { enabled: false, volume: 0.35 },
    },
  };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StoredAudioPrefs>;
    return {
      radioVolume:
        typeof parsed.radioVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.radioVolume))
          : defaults.radioVolume,
      radioMuted: Boolean(parsed.radioMuted),
      masterMuted: Boolean(parsed.masterMuted),
      ambient: {
        rain: {
          enabled: Boolean(parsed.ambient?.rain?.enabled),
          volume:
            typeof parsed.ambient?.rain?.volume === 'number'
              ? Math.max(0, Math.min(1, parsed.ambient.rain.volume))
              : defaults.ambient.rain.volume,
        },
        waves: {
          enabled: Boolean(parsed.ambient?.waves?.enabled),
          volume:
            typeof parsed.ambient?.waves?.volume === 'number'
              ? Math.max(0, Math.min(1, parsed.ambient.waves.volume))
              : defaults.ambient.waves.volume,
        },
        keyboard: {
          enabled: Boolean(parsed.ambient?.keyboard?.enabled),
          volume:
            typeof parsed.ambient?.keyboard?.volume === 'number'
              ? Math.max(0, Math.min(1, parsed.ambient.keyboard.volume))
              : defaults.ambient.keyboard.volume,
        },
      },
    };
  } catch {
    return defaults;
  }
}

function savePrefs(prefs: StoredAudioPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota/privacy errors
  }
}

export class PlanetaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private radioGain: GainNode | null = null;
  private radioEl: HTMLAudioElement | null = null;
  private radioSource: MediaElementAudioSourceNode | null = null;

  private ambientBuffers = new Map<AmbientChannel, AudioBuffer>();
  private ambientNodes = new Map<
    AmbientChannel,
    { source: AudioBufferSourceNode; gain: GainNode }
  >();

  private playlist: PlaylistResponse | null = null;
  private clockOffsetMs = 0;

  private prefs: StoredAudioPrefs = loadPrefs();
  private unlocked = false;
  private audioBlocked = false;
  private currentTrack: TrackInfo | null = null;
  private currentTrackIndex = -1;
  private trackProgressSec = 0;
  private trackError = false;
  private ambientLoading: Record<AmbientChannel, boolean> = {
    rain: false,
    waves: false,
    keyboard: false,
  };

  private driftTimerId: number | null = null;
  private progressTimerId: number | null = null;
  private envelopeTimerId: number | null = null;
  private entryFadeStartMs = 0;
  private preloadedUrl: string | null = null;
  private listeners = new Set<(snapshot: AudioEngineSnapshot) => void>();

  subscribe(cb: (snapshot: AudioEngineSnapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.getSnapshot());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const cb of this.listeners) {
      cb(snap);
    }
  }

  getSnapshot(): AudioEngineSnapshot {
    return {
      unlocked: this.unlocked,
      audioBlocked: this.audioBlocked,
      masterMuted: this.prefs.masterMuted,
      radioMuted: this.prefs.radioMuted,
      radioVolume: this.prefs.radioVolume,
      currentTrack: this.currentTrack,
      trackProgressSec: this.trackProgressSec,
      trackError: this.trackError,
      ambient: {
        rain: {
          ...this.prefs.ambient.rain,
          loading: this.ambientLoading.rain,
        },
        waves: {
          ...this.prefs.ambient.waves,
          loading: this.ambientLoading.waves,
        },
        keyboard: {
          ...this.prefs.ambient.keyboard,
          loading: this.ambientLoading.keyboard,
        },
      },
    };
  }

  setPlaylist(playlist: PlaylistResponse): void {
    this.playlist = playlist;
    if (this.unlocked) {
      this.syncRadioNow(true);
    }
  }

  setClockOffsetMs(offsetMs: number): void {
    this.clockOffsetMs = offsetMs;
  }

  /**
   * Must be called inside a user gesture ("Entrar y activar audio").
   */
  async unlockAndStart(): Promise<void> {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.prefs.masterMuted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);

      this.radioGain = this.ctx.createGain();
      this.radioGain.gain.value = this.prefs.radioMuted
        ? 0
        : this.prefs.radioVolume;
      this.radioGain.connect(this.masterGain);

      this.setupRadioElement();
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // handled below
      }
    }

    this.unlocked = true;
    this.audioBlocked = this.ctx.state !== 'running';
    this.emit();

    if (this.playlist) {
      this.syncRadioNow(true);
    }

    // Start any previously enabled ambient channels lazily
    (['rain', 'waves', 'keyboard'] as AmbientChannel[]).forEach((ch) => {
      if (this.prefs.ambient[ch].enabled) {
        void this.startAmbientChannel(ch);
      }
    });

    this.startTimers();
  }

  async resumeAudio(): Promise<void> {
    if (!this.ctx) {
      await this.unlockAndStart();
      return;
    }
    try {
      await this.ctx.resume();
      this.audioBlocked = this.ctx.state !== 'running';
      if (!this.audioBlocked && this.radioEl && this.radioEl.paused) {
        await this.radioEl.play().catch(() => {});
      }
      this.emit();
    } catch {
      this.audioBlocked = true;
      this.emit();
    }
  }

  private setupRadioElement(): void {
    if (!this.ctx || !this.radioGain) return;
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    this.radioEl = audio;

    this.radioSource = this.ctx.createMediaElementSource(audio);
    this.radioSource.connect(this.radioGain);

    audio.addEventListener('ended', () => {
      if (!this.playlist) return;
      const serverNowMs = Date.now() + this.clockOffsetMs;
      const pos = computePlaylistPosition(
        this.playlist.tracks,
        this.playlist.playlistStartTs,
        serverNowMs,
      );
      // If MP3 ended slightly earlier than rounded DB duration, advance cleanly to next track
      if (
        pos &&
        pos.trackIndex === this.currentTrackIndex &&
        pos.remainingSec <= 2.5
      ) {
        const nextIdx =
          (this.currentTrackIndex + 1) % this.playlist.tracks.length;
        this.playTrackAt(nextIdx, 0);
        return;
      }
      this.syncRadioNow(true);
    });

    let retryAttempted = false;
    audio.addEventListener('error', () => {
      if (!this.playlist || !this.unlocked) return;
      if (!retryAttempted && audio.src) {
        retryAttempted = true;
        window.setTimeout(() => {
          this.syncRadioNow(true);
        }, 1200);
        return;
      }
      retryAttempted = false;
      this.trackError = true;
      this.emit();
      const nextIdx =
        (this.currentTrackIndex + 1) % this.playlist.tracks.length;
      this.playTrackAt(nextIdx, 0);
    });

    audio.addEventListener('playing', () => {
      retryAttempted = false;
      if (this.trackError) {
        this.trackError = false;
        this.emit();
      }
    });
  }

  private startTimers(): void {
    if (this.driftTimerId !== null) window.clearInterval(this.driftTimerId);
    if (this.progressTimerId !== null) window.clearInterval(this.progressTimerId);
    if (this.envelopeTimerId !== null) window.clearInterval(this.envelopeTimerId);

    // Smooth 100ms gain envelope updates for track fade-in & fade-out
    this.envelopeTimerId = window.setInterval(() => {
      this.applyRadioEnvelopeGain(0.05);
    }, 100);

    this.progressTimerId = window.setInterval(() => {
      if (!this.radioEl || !this.currentTrack) return;
      this.trackProgressSec = this.radioEl.currentTime || 0;

      // Preload next track 7 seconds before current ends
      if (
        this.playlist &&
        this.getEffectiveDurationSec() - this.trackProgressSec <= 7
      ) {
        const nextIdx =
          (this.currentTrackIndex + 1) % this.playlist.tracks.length;
        const nextUrl = this.playlist.tracks[nextIdx]?.audio_url;
        if (nextUrl && this.preloadedUrl !== nextUrl) {
          this.preloadedUrl = nextUrl;
          try {
            const resolved = new URL(getApiUrl(nextUrl), window.location.origin);
            if (resolved.origin === window.location.origin) {
              void fetch(resolved.href, {
                headers: { Range: 'bytes=0-65535' },
              }).catch(() => {});
            } else {
              const preAudio = new Audio();
              preAudio.crossOrigin = 'anonymous';
              preAudio.preload = 'metadata';
              preAudio.src = resolved.href;
            }
          } catch {
            // ignore invalid preload URL
          }
        }
      }

      this.emit();
    }, 500);

    // Drift correction every 20 seconds
    this.driftTimerId = window.setInterval(() => {
      this.syncRadioNow(false);
    }, 20_000);
  }

  private getEffectiveDurationSec(): number {
    if (
      this.radioEl &&
      Number.isFinite(this.radioEl.duration) &&
      this.radioEl.duration > 1
    ) {
      return this.radioEl.duration;
    }
    return this.currentTrack?.duration_sec ?? 0;
  }

  private getCurrentEnvelopeMultiplier(): number {
    if (!this.radioEl || !this.currentTrack) return 1;
    const durationSec = this.getEffectiveDurationSec();
    const currentSec = this.radioEl.currentTime || 0;
    const trackEnv = computeTrackEnvelopeMultiplier(
      currentSec,
      durationSec,
      2.4,
      3.0,
    );

    // Soft 1.4s entry swell when joining mid-track
    let entryEnv = 1;
    if (this.entryFadeStartMs > 0) {
      const elapsedEntrySec = (performance.now() - this.entryFadeStartMs) / 1000;
      if (elapsedEntrySec < 1.4) {
        const p = Math.max(0, elapsedEntrySec / 1.4);
        entryEnv = 0.5 - 0.5 * Math.cos(Math.PI * p);
      }
    }

    return Math.min(trackEnv, entryEnv);
  }

  private applyRadioEnvelopeGain(timeConstant = 0.05): void {
    if (!this.ctx || !this.radioGain) return;
    const baseTarget = this.prefs.radioMuted ? 0 : this.prefs.radioVolume;
    const mult = this.getCurrentEnvelopeMultiplier();
    const target = baseTarget * mult;
    this.radioGain.gain.setTargetAtTime(target, this.ctx.currentTime, timeConstant);
  }

  private syncRadioNow(force: boolean): void {
    if (!this.playlist || !this.unlocked || !this.radioEl) return;

    const serverNowMs = Date.now() + this.clockOffsetMs;
    const pos = computePlaylistPosition(
      this.playlist.tracks,
      this.playlist.playlistStartTs,
      serverNowMs,
    );
    if (!pos) return;

    if (pos.trackIndex !== this.currentTrackIndex) {
      // Allow a 2.5s grace window if the previous MP3 finished slightly ahead of DB duration
      if (!force) {
        const nextExpected =
          (pos.trackIndex + 1) % this.playlist.tracks.length;
        if (
          this.currentTrackIndex === nextExpected &&
          pos.remainingSec <= 2.5
        ) {
          return;
        }
      }
      this.playTrackAt(pos.trackIndex, pos.offsetSec);
      return;
    }

    if (force) {
      this.playTrackAt(pos.trackIndex, pos.offsetSec);
      return;
    }

    // Do not interrupt an active end-of-track fade-out
    const effectiveDur = this.getEffectiveDurationSec();
    if (effectiveDur - this.radioEl.currentTime <= 3.5) {
      return;
    }

    // Same track: correct only if drift > 1.0s
    if (shouldCorrectDrift(this.radioEl.currentTime, pos.offsetSec, 1.0)) {
      this.seekSmoothly(pos.offsetSec);
    }
  }

  private playTrackAt(trackIndex: number, offsetSec: number): void {
    if (!this.playlist || !this.radioEl || !this.ctx || !this.radioGain) return;
    const track = this.playlist.tracks[trackIndex];
    if (!track) return;

    this.currentTrackIndex = trackIndex;
    this.currentTrack = track;
    this.trackProgressSec = offsetSec;
    this.entryFadeStartMs = performance.now();
    this.updateMediaSession(track);
    this.emit();

    const audio = this.radioEl;
    const targetUrl = new URL(getApiUrl(track.audio_url), window.location.origin).href;

    const beginAtOffset = () => {
      try {
        if (Math.abs(audio.currentTime - offsetSec) > 0.4) {
          audio.currentTime = Math.max(0, Math.min(track.duration_sec - 0.1, offsetSec));
        }
      } catch {
        // Ignore seek error before metadata
      }
      if (this.ctx && this.radioGain) {
        const now = this.ctx.currentTime;
        this.radioGain.gain.cancelScheduledValues(now);
        this.radioGain.gain.setValueAtTime(0, now);
      }
      this.entryFadeStartMs = performance.now();
      void audio.play().catch(() => {
        if (this.ctx && this.ctx.state !== 'running') {
          this.audioBlocked = true;
          this.emit();
        }
      });
    };

    if (audio.src !== targetUrl) {
      // Smooth fade-out before loading next track
      const now = this.ctx.currentTime;
      this.radioGain.gain.cancelScheduledValues(now);
      this.radioGain.gain.setValueAtTime(this.radioGain.gain.value, now);
      this.radioGain.gain.linearRampToValueAtTime(0, now + 0.25);

      audio.src = targetUrl;
      const onLoaded = () => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        beginAtOffset();
      };
      audio.addEventListener('loadedmetadata', onLoaded);
      audio.load();
    } else {
      beginAtOffset();
    }
  }

  private seekSmoothly(offsetSec: number): void {
    if (!this.radioEl || !this.ctx || !this.radioGain) return;
    const now = this.ctx.currentTime;
    this.radioGain.gain.cancelScheduledValues(now);
    this.radioGain.gain.setValueAtTime(this.radioGain.gain.value, now);
    this.radioGain.gain.linearRampToValueAtTime(0, now + 0.22);

    window.setTimeout(() => {
      if (!this.radioEl || !this.ctx || !this.radioGain) return;
      try {
        this.radioEl.currentTime = offsetSec;
      } catch {
        // ignore
      }
      this.entryFadeStartMs = performance.now();
      this.applyRadioEnvelopeGain(0.08);
    }, 230);
  }

  private updateMediaSession(track: TrackInfo): void {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: 'Planeta Lo-Fi',
          artwork: track.artwork_url
            ? [{ src: track.artwork_url, sizes: '400x400', type: 'image/jpeg' }]
            : undefined,
        });
      } catch {
        // Ignore unsupported browser environments
      }
    }
  }

  setRadioVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.prefs.radioVolume = clamped;
    if (clamped > 0 && this.prefs.radioMuted) {
      this.prefs.radioMuted = false;
    }
    savePrefs(this.prefs);
    this.rampRadioGain();
    this.emit();
  }

  toggleRadioMute(): void {
    this.prefs.radioMuted = !this.prefs.radioMuted;
    savePrefs(this.prefs);
    this.rampRadioGain();
    this.emit();
  }

  toggleMasterMute(): void {
    this.prefs.masterMuted = !this.prefs.masterMuted;
    savePrefs(this.prefs);
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(
        this.prefs.masterMuted ? 0 : 1,
        now + 0.25,
      );
    }
    this.emit();
  }

  private rampRadioGain(): void {
    if (!this.ctx || !this.radioGain) return;
    const now = this.ctx.currentTime;
    const baseTarget = this.prefs.radioMuted ? 0 : this.prefs.radioVolume;
    const target = baseTarget * this.getCurrentEnvelopeMultiplier();
    this.radioGain.gain.cancelScheduledValues(now);
    this.radioGain.gain.setValueAtTime(this.radioGain.gain.value, now);
    this.radioGain.gain.linearRampToValueAtTime(target, now + 0.15);
  }

  async toggleAmbientChannel(channel: AmbientChannel): Promise<void> {
    const nextEnabled = !this.prefs.ambient[channel].enabled;
    this.prefs.ambient[channel].enabled = nextEnabled;
    savePrefs(this.prefs);
    this.emit();

    if (!this.unlocked) return;

    if (nextEnabled) {
      await this.startAmbientChannel(channel);
    } else {
      this.stopAmbientChannel(channel);
    }
  }

  setAmbientVolume(channel: AmbientChannel, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.prefs.ambient[channel].volume = clamped;
    savePrefs(this.prefs);

    const active = this.ambientNodes.get(channel);
    if (active && this.ctx) {
      const now = this.ctx.currentTime;
      active.gain.gain.cancelScheduledValues(now);
      active.gain.gain.setValueAtTime(active.gain.gain.value, now);
      active.gain.gain.linearRampToValueAtTime(clamped, now + 0.12);
    }
    this.emit();
  }

  private async startAmbientChannel(channel: AmbientChannel): Promise<void> {
    if (!this.ctx || !this.masterGain) return;
    if (this.ambientNodes.has(channel)) return;

    let buffer = this.ambientBuffers.get(channel);
    if (!buffer) {
      const rawUrl =
        this.playlist?.ambientCredits.find((c) => c.channel === channel)
          ?.audio_url ?? `/audio/ambient/${channel}.wav`;
      const url = getApiUrl(rawUrl);
      this.ambientLoading[channel] = true;
      this.emit();
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(arr);
        this.ambientBuffers.set(channel, buffer);
      } catch {
        this.ambientLoading[channel] = false;
        this.prefs.ambient[channel].enabled = false;
        savePrefs(this.prefs);
        this.emit();
        return;
      }
      this.ambientLoading[channel] = false;
      this.emit();
    }

    // Check if user disabled while loading
    if (!this.prefs.ambient[channel].enabled || this.ambientNodes.has(channel)) {
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      this.prefs.ambient[channel].volume,
      now + 0.3,
    );

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.ambientNodes.set(channel, { source, gain });
  }

  private stopAmbientChannel(channel: AmbientChannel): void {
    const active = this.ambientNodes.get(channel);
    if (!active || !this.ctx) return;

    this.ambientNodes.delete(channel);
    const now = this.ctx.currentTime;
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueAtTime(active.gain.gain.value, now);
    active.gain.gain.linearRampToValueAtTime(0, now + 0.25);

    window.setTimeout(() => {
      try {
        active.source.stop();
        active.source.disconnect();
        active.gain.disconnect();
      } catch {
        // ignore already stopped
      }
    }, 280);
  }

  dispose(): void {
    if (this.driftTimerId !== null) window.clearInterval(this.driftTimerId);
    if (this.progressTimerId !== null) window.clearInterval(this.progressTimerId);
    if (this.envelopeTimerId !== null) window.clearInterval(this.envelopeTimerId);
    for (const ch of ['rain', 'waves', 'keyboard'] as AmbientChannel[]) {
      this.stopAmbientChannel(ch);
    }
    if (this.radioEl) {
      this.radioEl.pause();
      this.radioEl.src = '';
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
