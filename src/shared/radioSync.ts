import type { TrackInfo } from './types.ts';

export interface PlaylistPosition {
  trackIndex: number;
  track: TrackInfo;
  offsetSec: number;
  remainingSec: number;
  totalDurationSec: number;
}

/**
 * Computes the exact active track and offset in seconds from the shared
 * server clock (`serverNowMs`) and `playlistStartTs`.
 */
export function computePlaylistPosition(
  tracks: TrackInfo[],
  playlistStartTs: number,
  serverNowMs: number,
): PlaylistPosition | null {
  if (!tracks.length) return null;

  const totalDurationSec = tracks.reduce(
    (sum, t) => sum + Math.max(0.1, t.duration_sec),
    0,
  );
  if (totalDurationSec <= 0) return null;

  const totalDurationMs = totalDurationSec * 1000;
  const elapsedMs = serverNowMs - playlistStartTs;
  const wrappedMs =
    ((elapsedMs % totalDurationMs) + totalDurationMs) % totalDurationMs;
  const positionSec = wrappedMs / 1000;

  let accum = 0;
  for (let i = 0; i < tracks.length; i++) {
    const dur = Math.max(0.1, tracks[i].duration_sec);
    if (positionSec < accum + dur || i === tracks.length - 1) {
      const offsetSec = Math.max(0, Math.min(dur - 0.05, positionSec - accum));
      const remainingSec = Math.max(0.05, dur - offsetSec);
      return {
        trackIndex: i,
        track: tracks[i],
        offsetSec,
        remainingSec,
        totalDurationSec,
      };
    }
    accum += dur;
  }

  return {
    trackIndex: 0,
    track: tracks[0],
    offsetSec: 0,
    remainingSec: tracks[0].duration_sec,
    totalDurationSec,
  };
}

/**
 * NTP-style midpoint clock offset: serverTime ≈ clientNow + offsetMs.
 */
export function computeClockOffset(
  t0ClientMs: number,
  serverTimeMs: number,
  t1ClientMs: number,
): { offsetMs: number; rttMs: number } {
  const rttMs = Math.max(0, t1ClientMs - t0ClientMs);
  const midpointClient = t0ClientMs + rttMs / 2;
  return {
    offsetMs: serverTimeMs - midpointClient,
    rttMs,
  };
}

/**
 * Checks whether playback has drifted beyond threshold (default 1.0s)
 * from the expected shared playlist position.
 */
export function shouldCorrectDrift(
  actualOffsetSec: number,
  expectedOffsetSec: number,
  thresholdSec = 1.0,
): boolean {
  if (!Number.isFinite(actualOffsetSec) || !Number.isFinite(expectedOffsetSec)) {
    return false;
  }
  return Math.abs(actualOffsetSec - expectedOffsetSec) > thresholdSec;
}

/**
 * Computes a smooth S-curve (cosine) gain multiplier in [0, 1] for track start
 * fade-in and track end fade-out.
 */
export function computeTrackEnvelopeMultiplier(
  currentTimeSec: number,
  durationSec: number,
  fadeInSec = 2.4,
  fadeOutSec = 3.0,
): number {
  if (
    !Number.isFinite(currentTimeSec) ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  ) {
    return 1;
  }
  const t = Math.max(0, Math.min(durationSec, currentTimeSec));
  const remaining = Math.max(0, durationSec - t);

  let gain = 1;
  if (fadeInSec > 0 && t < fadeInSec) {
    const p = t / fadeInSec;
    gain = Math.min(gain, 0.5 - 0.5 * Math.cos(Math.PI * p));
  }
  if (fadeOutSec > 0 && remaining < fadeOutSec) {
    const p = remaining / fadeOutSec;
    gain = Math.min(gain, 0.5 - 0.5 * Math.cos(Math.PI * p));
  }
  return Math.max(0, Math.min(1, gain));
}
