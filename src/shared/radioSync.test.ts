import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClockOffset,
  computePlaylistPosition,
  computeTrackEnvelopeMultiplier,
  shouldCorrectDrift,
} from './radioSync.ts';
import type { TrackInfo } from './types.ts';

const SAMPLE_TRACKS: TrackInfo[] = [
  {
    id: 1,
    position: 1,
    title: 'Pista Uno',
    artist: 'Artista A',
    license: 'CC0 1.0',
    source_url: 'https://example.org/1',
    audio_url: '/audio/tracks/track-01.wav',
    duration_sec: 40,
  },
  {
    id: 2,
    position: 2,
    title: 'Pista Dos',
    artist: 'Artista B',
    license: 'CC0 1.0',
    source_url: 'https://example.org/2',
    audio_url: '/audio/tracks/track-02.wav',
    duration_sec: 60,
  },
];

test('computePlaylistPosition finds exact track and offset across loop wrap', () => {
  const start = 1_000_000;
  // 55s after start -> inside track 2 at 15s
  const pos1 = computePlaylistPosition(SAMPLE_TRACKS, start, start + 55_000);
  assert.ok(pos1);
  assert.equal(pos1.trackIndex, 1);
  assert.equal(pos1.track.id, 2);
  assert.ok(Math.abs(pos1.offsetSec - 15) < 0.001);
  assert.ok(Math.abs(pos1.remainingSec - 45) < 0.001);

  // 110s after start (total 100s) -> wraps to track 1 at 10s
  const pos2 = computePlaylistPosition(SAMPLE_TRACKS, start, start + 110_000);
  assert.ok(pos2);
  assert.equal(pos2.trackIndex, 0);
  assert.equal(pos2.track.id, 1);
  assert.ok(Math.abs(pos2.offsetSec - 10) < 0.001);
});

test('computeClockOffset handles asymmetric RTT midpoint', () => {
  // Client sent at 1000, received at 1100 (RTT = 100ms, midpoint = 1050)
  // Server reported 2050 -> offset is +1000ms
  const { offsetMs, rttMs } = computeClockOffset(1000, 2050, 1100);
  assert.equal(rttMs, 100);
  assert.equal(offsetMs, 1000);
});

test('shouldCorrectDrift triggers only above threshold', () => {
  assert.equal(shouldCorrectDrift(12.4, 12.0, 1.0), false);
  assert.equal(shouldCorrectDrift(13.2, 12.0, 1.0), true);
  assert.equal(shouldCorrectDrift(10.5, 12.0, 1.0), true);
});

test('computeTrackEnvelopeMultiplier smoothly fades in at start and out at end', () => {
  // Start of track -> 0 -> 0.5 -> 1
  assert.equal(computeTrackEnvelopeMultiplier(0, 120, 2.4, 3.0), 0);
  assert.ok(
    Math.abs(computeTrackEnvelopeMultiplier(1.2, 120, 2.4, 3.0) - 0.5) < 0.001,
  );
  // Middle of track -> full 1.0
  assert.equal(computeTrackEnvelopeMultiplier(45, 120, 2.4, 3.0), 1);
  // End of track -> 0.5 at 1.5s remaining -> 0 at 0s remaining
  assert.ok(
    Math.abs(computeTrackEnvelopeMultiplier(118.5, 120, 2.4, 3.0) - 0.5) < 0.001,
  );
  assert.equal(computeTrackEnvelopeMultiplier(120, 120, 2.4, 3.0), 0);
});
