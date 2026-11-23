import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Globe2,
  List,
  Moon,
  RefreshCw,
  Sun,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  PlanetaAudioEngine,
  type AmbientChannel,
  type AudioEngineSnapshot,
} from './audio/audioEngine.ts';
import appMarkUrl from './assets/planeta-lofi-favicon.svg';
import { CitiesDrawer } from './components/CitiesDrawer.tsx';
import { ControlDock } from './components/ControlDock.tsx';
import { EntryModal } from './components/EntryModal.tsx';
import {
  GlobeCanvas,
  type HoveredMarkerInfo,
} from './components/GlobeCanvas.tsx';
import { LegalModal, type LegalTab } from './components/LegalModal.tsx';
import { getApiUrl } from './config/endpoints.ts';
import { useI18n } from './i18n/I18nContext.tsx';
import {
  PresenceClient,
  type PresenceSnapshot,
} from './services/presenceClient.ts';
import type {
  CityPresence,
  GlobeTheme,
  PlaylistResponse,
} from './shared/types.ts';

const TERMS_STORAGE_KEY = 'planeta_lofi_terms_accepted';
const THEME_STORAGE_KEY = 'planeta_lofi_theme';

function loadStoredTerms(): boolean {
  try {
    return window.localStorage.getItem(TERMS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadStoredTheme(): GlobeTheme {
  try {
    const val = window.localStorage.getItem(THEME_STORAGE_KEY);
    return val === 'day' ? 'day' : 'night';
  } catch {
    return 'night';
  }
}

export default function App() {
  const { t, formatCityName, formatCountryName } = useI18n();
  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [entered, setEntered] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(() =>
    loadStoredTerms(),
  );
  const [theme, setTheme] = useState<GlobeTheme>(() => loadStoredTheme());
  const [globeReady, setGlobeReady] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistResponse | null>(null);

  const [selectedCity, setSelectedCity] = useState<CityPresence | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<HoveredMarkerInfo | null>(
    null,
  );
  const [focusRequest, setFocusRequest] = useState<{
    city: CityPresence;
    nonce: number;
  } | null>(null);
  const [resetViewNonce, setResetViewNonce] = useState(0);

  const [citiesDrawerOpen, setCitiesDrawerOpen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [legalState, setLegalState] = useState<{
    open: boolean;
    tab: LegalTab;
  }>({ open: false, tab: 'terms' });

  const audioEngineRef = useRef<PlanetaAudioEngine | null>(null);
  const presenceClientRef = useRef<PresenceClient | null>(null);

  if (!audioEngineRef.current) {
    audioEngineRef.current = new PlanetaAudioEngine();
  }
  if (!presenceClientRef.current) {
    presenceClientRef.current = new PresenceClient();
  }

  const [audioSnap, setAudioSnap] = useState<AudioEngineSnapshot>(() =>
    audioEngineRef.current!.getSnapshot(),
  );
  const [presenceSnap, setPresenceSnap] = useState<PresenceSnapshot>(() =>
    presenceClientRef.current!.getSnapshot(),
  );

  // Sync HTML .dark class and localStorage for Day/Night theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'night') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Subscribe to AudioEngine and PresenceClient stores
  useEffect(() => {
    const engine = audioEngineRef.current!;
    const client = presenceClientRef.current!;

    const unsubAudio = engine.subscribe((snap) => setAudioSnap(snap));
    const unsubPresence = client.subscribe((snap) => {
      setPresenceSnap(snap);
      engine.setClockOffsetMs(snap.clockOffsetMs);
    });

    return () => {
      unsubAudio();
      unsubPresence();
      engine.dispose();
      client.dispose();
    };
  }, []);

  // Load playlist metadata (no audio playback until user enters)
  useEffect(() => {
    let active = true;
    const playlistUrl = getApiUrl('/api/playlist');
    fetch(playlistUrl)
      .then((res) => res.json())
      .then((data: PlaylistResponse) => {
        if (!active) return;
        setPlaylist(data);
        audioEngineRef.current?.setPlaylist(data);
      })
      .catch(() => {
        // Retry once softly
        window.setTimeout(() => {
          if (!active) return;
          fetch(playlistUrl)
            .then((r) => r.json())
            .then((data: PlaylistResponse) => {
              if (!active) return;
              setPlaylist(data);
              audioEngineRef.current?.setPlaylist(data);
            })
            .catch(() => {});
        }, 2500);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleToggleAccepted = useCallback((checked: boolean) => {
    setAcceptedTerms(checked);
    try {
      window.localStorage.setItem(TERMS_STORAGE_KEY, checked ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const handleEnter = useCallback(() => {
    setEntered(true);
    presenceClientRef.current?.connect();
    void audioEngineRef.current?.unlockAndStart();
  }, []);

  // Optional ?autostart=1 support for automated browser verification
  useEffect(() => {
    if (isAutostart && !entered) {
      handleToggleAccepted(true);
      handleEnter();
    }
  }, [isAutostart, entered, handleToggleAccepted, handleEnter]);

  // Keyboard shortcut 'H' to collapse/expand bottom dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        entered &&
        !legalState.open &&
        !citiesDrawerOpen &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entered, legalState.open, citiesDrawerOpen]);

  const handleFocusCity = useCallback((city: CityPresence) => {
    setSelectedCity(city);
    setFocusRequest((prev) => ({ city, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const handleResetView = useCallback(() => {
    setSelectedCity(null);
    setResetViewNonce((n) => n + 1);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'night' ? 'day' : 'night'));
  }, []);

  const isDay = theme === 'day';
  const totalListeners = presenceSnap.total;
  const listenerText =
    totalListeners === 1
      ? `1 ${t.header.listenersSingle}`
      : `${totalListeners} ${t.header.listenersPlural}`;

  const hudSurfaceClass = isDay
    ? 'glass-panel-day text-slate-900'
    : 'glass-panel-night text-slate-100';

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden ${
        isDay ? 'bg-[#c8ddf0] text-slate-900' : 'bg-[#060913] text-slate-100'
      }`}
      data-entered={entered ? 'true' : 'false'}
      data-theme={theme}
      data-connection={presenceSnap.connectionState}
      data-audio={audioSnap.unlocked ? 'unlocked' : 'locked'}
    >
      {/* Fullscreen 3D Globe Background */}
      <main className="absolute inset-0">
        <GlobeCanvas
          theme={theme}
          cities={presenceSnap.cities}
          userCityKey={presenceSnap.userCity?.key ?? null}
          selectedCity={selectedCity}
          focusRequest={focusRequest}
          resetViewNonce={resetViewNonce}
          pulsedCityKeys={presenceSnap.pulsedCityKeys}
          interactive={entered}
          onSelectCity={(city) => {
            setSelectedCity(city);
          }}
          onHoverCity={setHoveredMarker}
          onReady={() => setGlobeReady(true)}
        />
      </main>

      {/* Lightweight initial loading banner while WebGL globe prepares */}
      {!globeReady && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2.5 rounded-2xl glass-panel-night text-xs text-slate-100">
            {t.globe.loadingTextures}
          </div>
        </div>
      )}

      {/* Top HUD Bar + Non-Overlapping Top-Left City Card Stack */}
      <header className="fixed top-4 left-4 right-4 z-20 flex items-start justify-between gap-3 pointer-events-none">
        <div className="flex flex-col items-start gap-2.5 min-w-0 max-w-[calc(100vw-11rem)] sm:max-w-none">
          {/* Top-Left: Brand + Listener Count */}
          <div
            className={`pointer-events-auto rounded-2xl border px-3.5 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-2.5 sm:gap-x-3 gap-y-1 transition-colors ${hudSurfaceClass}`}
          >
            <img
              src={appMarkUrl}
              alt=""
              aria-hidden="true"
              className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg shrink-0"
              draggable={false}
            />
            <span className="font-display text-sm sm:text-lg font-semibold tracking-tight whitespace-nowrap shrink-0">
              {t.appName}
            </span>
            <span
              className={`hidden sm:inline ${
                isDay ? 'text-slate-300' : 'text-white/20'
              }`}
              aria-hidden="true"
            >
              |
            </span>
            <div
              className="flex items-center gap-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0"
              data-testid="listener-count"
            >
              <Users
                className={`w-3.5 h-3.5 shrink-0 ${
                  isDay ? 'text-amber-700' : 'text-amber-400'
                }`}
                aria-hidden="true"
              />
              <span className="font-mono-nums font-medium">{listenerText}</span>
            </div>
            {entered && presenceSnap.userCity && (
              <>
                <span
                  className={`hidden md:inline ${
                    isDay ? 'text-slate-300' : 'text-white/20'
                  }`}
                  aria-hidden="true"
                >
                  ·
                </span>
                <span
                  className={`hidden md:inline text-xs truncate max-w-[200px] ${
                    isDay ? 'text-slate-600' : 'text-slate-300'
                  }`}
                  data-testid="user-city-label"
                >
                  {t.header.yourCityLabel}{' '}
                  {formatCityName(
                    presenceSnap.userCity.key,
                    presenceSnap.userCity.name,
                  )}
                </span>
              </>
            )}
          </div>

          {/* Selected City Detail Card (stacked directly below header, zero overlap) */}
          {entered && selectedCity && (
            <div
              className={`pointer-events-auto w-full max-w-[260px] rounded-2xl border p-3.5 sm:p-4 ${hudSurfaceClass}`}
              data-testid="selected-city-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold truncate">
                    {formatCityName(selectedCity.key, selectedCity.name)}
                  </h2>
                  <p
                    className={`text-xs truncate ${
                      isDay ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {[
                      selectedCity.region,
                      formatCountryName(
                        selectedCity.countryCode,
                        selectedCity.country,
                      ),
                    ]
                      .filter(Boolean)
                      .join(' · ') || t.cityDetail.unknownLocation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCity(null)}
                  aria-label={t.cityDetail.close}
                  className={`min-w-[34px] min-h-[34px] -mt-1 -mr-1 flex items-center justify-center rounded-lg transition-colors ${
                    isDay
                      ? 'hover:bg-slate-100 text-slate-600'
                      : 'hover:bg-white/10 text-slate-300'
                  }`}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <p
                className={`mt-2 text-xs font-semibold ${
                  isDay ? 'text-amber-700' : 'text-amber-400'
                }`}
              >
                <span className="font-mono-nums">{selectedCity.n}</span>{' '}
                {selectedCity.n === 1
                  ? t.cityDetail.listenersSingle
                  : t.cityDetail.listenersPlural}
              </p>
            </div>
          )}
        </div>

        {/* Top-Right: Day/Night Toggle, Cities List, Reset View */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          {entered && selectedCity && (
            <button
              type="button"
              onClick={handleResetView}
              aria-label={t.header.resetView}
              className={`min-h-[42px] min-w-[42px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${hudSurfaceClass}`}
            >
              <Globe2
                className={`w-4 h-4 ${
                  isDay ? 'text-amber-700' : 'text-amber-400'
                }`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{t.header.resetView}</span>
            </button>
          )}

          {entered && (
            <button
              type="button"
              onClick={() => setCitiesDrawerOpen(true)}
              aria-label={t.header.citiesList}
              data-testid="open-cities-btn"
              className={`min-h-[42px] min-w-[42px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${hudSurfaceClass}`}
            >
              <List className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t.header.citiesList}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={isDay ? t.header.switchToNight : t.header.switchToDay}
            data-testid="theme-toggle-btn"
            className={`min-h-[42px] min-w-[42px] px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${hudSurfaceClass}`}
          >
            {isDay ? (
              <>
                <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
                <span className="hidden sm:inline">{t.header.dayMode}</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span className="hidden sm:inline">{t.header.nightMode}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Non-blocking Connection Status Notice (only during connecting/reconnecting/offline) */}
      {entered && presenceSnap.connectionState !== 'online' && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
          role="status"
        >
          <div
            className={`px-4 py-2 rounded-xl border text-xs font-medium flex items-center gap-2.5 ${hudSurfaceClass}`}
          >
            <WifiOff
              className={`w-3.5 h-3.5 ${
                isDay ? 'text-amber-700' : 'text-amber-400'
              }`}
              aria-hidden="true"
            />
            <span>
              {presenceSnap.connectionState === 'connecting'
                ? t.connection.connecting
                : presenceSnap.connectionState === 'reconnecting'
                  ? t.connection.reconnecting
                  : t.connection.offline}
            </span>
            {presenceSnap.connectionState === 'offline' && (
              <button
                type="button"
                onClick={() => presenceClientRef.current?.retryNow()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-semibold hover:bg-amber-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                <span>{t.connection.retry}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hover Tooltip near Marker */}
      {entered && hoveredMarker && (
        <div
          className={`fixed z-20 pointer-events-none px-3 py-1.5 rounded-xl border text-xs transition-opacity ${hudSurfaceClass}`}
          style={{
            left: `${Math.min(window.innerWidth - 190, Math.max(16, hoveredMarker.x + 14))}px`,
            top: `${Math.min(window.innerHeight - 90, Math.max(70, hoveredMarker.y - 18))}px`,
          }}
        >
          <p className="font-semibold">
            {formatCityName(hoveredMarker.city.key, hoveredMarker.city.name)}
            {hoveredMarker.city.country
              ? `, ${formatCountryName(hoveredMarker.city.countryCode, hoveredMarker.city.country)}`
              : ''}
          </p>
          <p className={isDay ? 'text-slate-600' : 'text-slate-300'}>
            <span className="font-mono-nums">{hoveredMarker.city.n}</span>{' '}
            {hoveredMarker.city.n === 1
              ? t.cityDetail.listenersSingle
              : t.cityDetail.listenersPlural}
          </p>
        </div>
      )}

      {/* Unified Collapsible Bottom Radio & Ambient Control Dock */}
      {entered && (
        <ControlDock
          theme={theme}
          audio={audioSnap}
          collapsed={dockCollapsed}
          onToggleCollapsed={() => setDockCollapsed((v) => !v)}
          onToggleRadioMute={() => audioEngineRef.current?.toggleRadioMute()}
          onChangeRadioVolume={(vol) =>
            audioEngineRef.current?.setRadioVolume(vol)
          }
          onToggleMasterMute={() => audioEngineRef.current?.toggleMasterMute()}
          onToggleAmbient={(ch: AmbientChannel) => {
            void audioEngineRef.current?.toggleAmbientChannel(ch);
          }}
          onChangeAmbientVolume={(ch: AmbientChannel, vol: number) =>
            audioEngineRef.current?.setAmbientVolume(ch, vol)
          }
          onResumeAudio={() => {
            void audioEngineRef.current?.resumeAudio();
          }}
          onOpenLegal={(tab) => setLegalState({ open: true, tab })}
        />
      )}

      {/* Entry Gate Modal (blocks audio and presence until clicked) */}
      {!entered && (
        <EntryModal
          acceptedTerms={acceptedTerms}
          onToggleAccepted={handleToggleAccepted}
          onEnter={handleEnter}
          onOpenLegal={(tab) => setLegalState({ open: true, tab })}
        />
      )}

      {/* Accessible Active Cities List Drawer */}
      <CitiesDrawer
        open={citiesDrawerOpen}
        theme={theme}
        cities={presenceSnap.cities}
        userCityKey={presenceSnap.userCity?.key ?? null}
        onFocusCity={handleFocusCity}
        onClose={() => setCitiesDrawerOpen(false)}
      />

      {/* Legal Terms, Privacy & Audio Credits Modal */}
      <LegalModal
        open={legalState.open}
        activeTab={legalState.tab}
        theme={theme}
        tracks={playlist?.tracks ?? []}
        ambientCredits={playlist?.ambientCredits ?? []}
        onChangeTab={(tab) => setLegalState((s) => ({ ...s, tab }))}
        onClose={() => setLegalState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
