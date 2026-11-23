import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Keyboard,
  Radio,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import type {
  AmbientChannel,
  AudioEngineSnapshot,
} from '../audio/audioEngine.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import type { GlobeTheme } from '../shared/types.ts';
import type { LegalTab } from './LegalModal.tsx';

interface ControlDockProps {
  theme: GlobeTheme;
  audio: AudioEngineSnapshot;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleRadioMute: () => void;
  onChangeRadioVolume: (vol: number) => void;
  onToggleMasterMute: () => void;
  onToggleAmbient: (channel: AmbientChannel) => void;
  onChangeAmbientVolume: (channel: AmbientChannel, vol: number) => void;
  onResumeAudio: () => void;
  onOpenLegal: (tab: LegalTab) => void;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export function ControlDock({
  theme,
  audio,
  collapsed,
  onToggleCollapsed,
  onToggleRadioMute,
  onChangeRadioVolume,
  onToggleMasterMute,
  onToggleAmbient,
  onChangeAmbientVolume,
  onResumeAudio,
  onOpenLegal,
}: ControlDockProps) {
  const { t } = useI18n();
  const [ambientOpen, setAmbientOpen] = useState(false);
  const [failedArtUrl, setFailedArtUrl] = useState<string | null>(null);
  const isDay = theme === 'day';

  const ambientItems: Array<{
    channel: AmbientChannel;
    label: string;
    Icon: typeof CloudRain;
  }> = [
    { channel: 'rain', label: t.ambient.rain, Icon: CloudRain },
    { channel: 'waves', label: t.ambient.waves, Icon: Waves },
    { channel: 'keyboard', label: t.ambient.keyboard, Icon: Keyboard },
  ];

  const surfaceClass = isDay
    ? 'glass-panel-day text-slate-900'
    : 'glass-panel-night text-slate-100';

  const mutedTextClass = isDay ? 'text-slate-600' : 'text-slate-300/80';
  const track = audio.currentTrack;
  const duration = track?.duration_sec ?? 0;
  const progressPct =
    duration > 0 ? Math.min(100, (audio.trackProgressSec / duration) * 100) : 0;

  const activeAmbientCount = (
    ['rain', 'waves', 'keyboard'] as AmbientChannel[]
  ).filter((c) => audio.ambient[c].enabled).length;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(860px,94vw)] flex flex-col items-center pointer-events-none"
      data-testid="control-dock"
    >
      {/* Audio blocked recovery banner if browser suspended AudioContext */}
      {audio.audioBlocked && (
        <button
          type="button"
          onClick={onResumeAudio}
          className="pointer-events-auto mb-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-semibold shadow-lg transition-colors"
        >
          {t.entryModal.audioBlockedHint}
        </button>
      )}

      {/* Collapse / Expand tab */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className={`pointer-events-auto mb-1.5 min-h-[32px] px-3.5 py-1 rounded-t-xl border-b-0 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${surfaceClass}`}
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.radio.showControls}</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.radio.hideControls}</span>
          </>
        )}
      </button>

      {/* Main Dock Panel */}
      {!collapsed && (
        <div
          className={`pointer-events-auto w-full rounded-3xl overflow-hidden transition-colors ${surfaceClass}`}
        >
          {/* Ambient Mixer Drawer (inside dock above radio bar) */}
          {ambientOpen && (
            <div
              className={`px-4 py-3.5 border-b ${
                isDay
                  ? 'border-slate-900/10 bg-white/25'
                  : 'border-white/12 bg-white/[0.03]'
              }`}
              data-testid="ambient-mixer-panel"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold">
                    {t.ambient.title}
                  </span>
                  <span className={`text-[11px] ${mutedTextClass}`}>
                    · {t.ambient.subtitle}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleMasterMute}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                    audio.masterMuted
                      ? 'bg-amber-400 text-slate-950'
                      : isDay
                        ? 'glass-inset-day hover:bg-white/75 text-slate-800'
                        : 'glass-inset-night hover:bg-white/14 text-slate-100'
                  }`}
                >
                  {audio.masterMuted ? t.radio.unmuteAll : t.radio.muteAll}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ambientItems.map(({ channel, label, Icon }) => {
                  const chState = audio.ambient[channel];
                  return (
                    <div
                      key={channel}
                      className={`rounded-2xl px-3.5 py-2.5 flex flex-col gap-2 ${
                        isDay ? 'glass-inset-day' : 'glass-inset-night'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              chState.enabled
                                ? isDay
                                  ? 'text-amber-700'
                                  : 'text-amber-400'
                                : mutedTextClass
                            }`}
                            aria-hidden="true"
                          />
                          <span className="text-xs font-medium truncate">
                            {label}
                          </span>
                          {chState.loading && (
                            <span className={`text-[11px] ${mutedTextClass}`}>
                              {t.ambient.loading}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={chState.enabled}
                          aria-label={t.ambient.toggleOf(label)}
                          data-testid={`ambient-toggle-${channel}`}
                          onClick={() => onToggleAmbient(channel)}
                          className={`min-w-[44px] min-h-[28px] px-2.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                            chState.enabled
                              ? 'bg-amber-400 text-slate-950'
                              : isDay
                                ? 'bg-slate-900/10 text-slate-800 hover:bg-slate-900/15'
                                : 'bg-white/10 text-slate-200 hover:bg-white/18'
                          }`}
                        >
                          {chState.enabled ? 'On' : 'Off'}
                        </button>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={chState.volume}
                        aria-label={t.ambient.volumeOf(label)}
                        data-testid={`ambient-volume-${channel}`}
                        onChange={(e) =>
                          onChangeAmbientVolume(channel, Number(e.target.value))
                        }
                        className="lofi-slider w-full h-5"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Radio Track Error (non-blocking) */}
          {audio.trackError && (
            <div className="px-4 py-1.5 text-xs text-amber-400 border-b border-white/10">
              {t.radio.trackError}
            </div>
          )}

          {/* Primary Radio & Controls Bar */}
          <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Track Info & Progress */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {track?.artwork_url && failedArtUrl !== track.artwork_url ? (
                <img
                  src={track.artwork_url}
                  alt={track.title}
                  referrerPolicy="no-referrer"
                  onError={() => setFailedArtUrl(track.artwork_url ?? null)}
                  data-testid="current-track-artwork"
                  className={`w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm border ${
                    isDay ? 'border-slate-900/12' : 'border-white/15'
                  }`}
                />
              ) : (
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isDay
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-amber-400/15 text-amber-300'
                  }`}
                >
                  <Radio className="w-4 h-4" aria-hidden="true" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-xs sm:text-sm font-semibold truncate"
                    data-testid="current-track-title"
                  >
                    {track ? `${track.title} — ${track.artist}` : t.radio.loading}
                  </p>
                  {track && (
                    <span
                      className={`font-mono-nums text-[11px] shrink-0 ${mutedTextClass}`}
                    >
                      {formatSec(audio.trackProgressSec)} / {formatSec(duration)}
                    </span>
                  )}
                </div>
                <div
                  className={`mt-1.5 h-1 w-full rounded-full overflow-hidden ${
                    isDay ? 'bg-slate-200' : 'bg-white/10'
                  }`}
                >
                  <div
                    className="h-full bg-amber-400 transition-[width] duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Radio Volume + Ambient Drawer Button + Legal */}
            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleRadioMute}
                  aria-label={
                    audio.radioMuted ? t.radio.unmuteRadio : t.radio.muteRadio
                  }
                  data-testid="radio-mute-btn"
                  className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors ${
                    isDay
                      ? 'hover:bg-slate-100 text-slate-700'
                      : 'hover:bg-white/10 text-slate-200'
                  }`}
                >
                  {audio.radioMuted || audio.masterMuted || audio.radioVolume === 0 ? (
                    <VolumeX
                      className={`w-4 h-4 ${isDay ? 'text-amber-700' : 'text-amber-400'}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={audio.radioMuted ? 0 : audio.radioVolume}
                  aria-label={t.radio.volumeRadio}
                  data-testid="radio-volume-slider"
                  onChange={(e) => onChangeRadioVolume(Number(e.target.value))}
                  className="lofi-slider w-16 sm:w-24 h-6"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-expanded={ambientOpen}
                  onClick={() => setAmbientOpen((v) => !v)}
                  data-testid="toggle-ambient-drawer-btn"
                  className={`min-h-[40px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    ambientOpen || activeAmbientCount > 0
                      ? 'bg-amber-400 text-slate-950 font-semibold shadow-sm'
                      : isDay
                        ? 'bg-slate-900/8 hover:bg-slate-900/14 text-slate-800 border border-slate-900/10'
                        : 'bg-white/10 hover:bg-white/16 text-slate-100 border border-white/12'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {t.radio.ambientToggle}
                    {activeAmbientCount > 0 ? ` (${activeAmbientCount})` : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenLegal('credits')}
                  className={`min-h-[40px] px-2 py-2 rounded-xl text-[11px] font-medium underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                    isDay
                      ? 'text-slate-700 hover:text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.entryModal.creditsLink}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
