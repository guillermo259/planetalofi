import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AmbientCredit, TrackInfo } from '../shared/types.ts';
import { ensureAudioAssets } from './audioGenerator.ts';
import { FMA_LOFI_TRACKS } from './fmaTracks.ts';

export interface RadioDatabaseState {
  playlistStartTs: number;
  totalDurationSec: number;
  tracks: TrackInfo[];
  ambientCredits: AmbientCredit[];
}

export function initDatabase(dataDir: string): RadioDatabaseState {
  fs.mkdirSync(dataDir, { recursive: true });
  const audioDir = path.join(dataDir, 'audio');
  const manifest = ensureAudioAssets(audioDir);

  const dbPath = path.join(dataDir, 'planeta.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      license TEXT NOT NULL,
      source_url TEXT NOT NULL,
      audio_url TEXT NOT NULL,
      artwork_url TEXT NOT NULL DEFAULT '',
      duration_sec REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      playlist_start_ts INTEGER NOT NULL
    );
  `);

  // Ensure artwork_url column exists for existing databases
  const columns = db.prepare('PRAGMA table_info(tracks)').all() as Array<{
    name: string;
  }>;
  if (!columns.some((c) => c.name === 'artwork_url')) {
    db.exec(
      "ALTER TABLE tracks ADD COLUMN artwork_url TEXT NOT NULL DEFAULT ''",
    );
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as count FROM tracks')
    .get() as { count: number };

  const legacyPlaceholderRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM tracks WHERE audio_url LIKE '/audio/tracks/track-%'",
    )
    .get() as { count: number };

  let resetPlaylistClock = false;
  if (countRow.count === 0 || legacyPlaceholderRow.count > 0) {
    const replaceTracks = db.transaction(() => {
      db.prepare('DELETE FROM tracks').run();
      const insertTrack = db.prepare(`
        INSERT INTO tracks (position, title, artist, license, source_url, audio_url, artwork_url, duration_sec)
        VALUES (@position, @title, @artist, @license, @source_url, @audio_url, @artwork_url, @duration_sec)
      `);
      for (const item of FMA_LOFI_TRACKS) {
        insertTrack.run({
          ...item,
          artwork_url: item.artwork_url ?? '',
        });
      }
    });
    replaceTracks();
    resetPlaylistClock = true;
  }

  const stateRow = db
    .prepare('SELECT playlist_start_ts FROM playlist_state WHERE id = 1')
    .get() as { playlist_start_ts: number } | undefined;

  let playlistStartTs: number;
  if (!stateRow || resetPlaylistClock) {
    // Anchor shared playlist clock persistently in SQLite
    playlistStartTs = Date.now();
    db.prepare(
      `INSERT INTO playlist_state (id, playlist_start_ts) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET playlist_start_ts = excluded.playlist_start_ts`,
    ).run(playlistStartTs);
  } else {
    playlistStartTs = stateRow.playlist_start_ts;
  }

  const tracks = db
    .prepare(
      'SELECT id, position, title, artist, license, source_url, audio_url, artwork_url, duration_sec FROM tracks ORDER BY position ASC',
    )
    .all() as TrackInfo[];

  const totalDurationSec = tracks.reduce((sum, t) => sum + t.duration_sec, 0);

  db.close();

  return {
    playlistStartTs,
    totalDurationSec,
    tracks,
    ambientCredits: manifest.ambient,
  };
}
