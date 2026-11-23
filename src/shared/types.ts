export interface TrackInfo {
  id: number;
  position: number;
  title: string;
  artist: string;
  license: string;
  source_url: string;
  audio_url: string;
  artwork_url?: string;
  duration_sec: number;
}

export interface AmbientCredit {
  id: string;
  channel: 'rain' | 'waves' | 'keyboard';
  title: string;
  artist: string;
  license: string;
  source_url: string;
  audio_url: string;
}

export interface PlaylistResponse {
  playlistStartTs: number;
  totalDurationSec: number;
  tracks: TrackInfo[];
  ambientCredits: AmbientCredit[];
}

export interface CityPresence {
  key: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number | null;
  lon: number | null;
  n: number;
}

export interface CityDiffItem {
  key: string;
  n: number;
  name?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  lat?: number | null;
  lon?: number | null;
}

export type ServerWsMessage =
  | {
      type: 'hello';
      serverTime: number;
      city: CityPresence;
      total: number;
    }
  | {
      type: 'snapshot';
      total: number;
      cities: CityPresence[];
    }
  | {
      type: 'diff';
      total: number;
      cities: CityDiffItem[];
    }
  | {
      type: 'pong';
      t: number;
      serverTime: number;
    };

export type ClientWsMessage = {
  type: 'ping';
  t: number;
};

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline';

export type GlobeTheme = 'night' | 'day';
