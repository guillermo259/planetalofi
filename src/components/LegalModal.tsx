import { useState } from 'react';
import { ExternalLink, Music2, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext.tsx';
import type { AmbientCredit, GlobeTheme, TrackInfo } from '../shared/types.ts';

export type LegalTab = 'terms' | 'privacy' | 'credits';

function TrackThumb({
  url,
  title,
  isDay,
}: {
  url?: string;
  title: string;
  isDay: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`w-9 h-9 rounded-lg object-cover shrink-0 border ${
          isDay ? 'border-slate-900/12' : 'border-white/15'
        }`}
      />
    );
  }
  return (
    <div
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isDay ? 'bg-amber-100 text-amber-700' : 'bg-amber-400/15 text-amber-300'
      }`}
    >
      <Music2 className="w-4 h-4" aria-hidden="true" />
    </div>
  );
}

interface LegalModalProps {
  open: boolean;
  activeTab: LegalTab;
  theme: GlobeTheme;
  tracks: TrackInfo[];
  ambientCredits: AmbientCredit[];
  onChangeTab: (tab: LegalTab) => void;
  onClose: () => void;
}

export function LegalModal({
  open,
  activeTab,
  theme,
  tracks,
  ambientCredits,
  onChangeTab,
  onClose,
}: LegalModalProps) {
  const { t } = useI18n();

  if (!open) return null;

  const isDay = theme === 'day';
  const formatLicense = (raw: string) =>
    raw.startsWith('CC0') ? t.legal.publicDomainLicense : raw;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[4px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      data-testid="legal-modal"
    >
      <div
        className={`w-full max-w-xl max-h-[85vh] flex flex-col rounded-3xl overflow-hidden ${
          isDay
            ? 'glass-panel-day text-slate-900'
            : 'glass-panel-night text-slate-100'
        }`}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDay ? 'border-slate-900/10' : 'border-white/12'
          }`}
        >
          <h2 id="legal-modal-title" className="font-display text-lg font-semibold">
            {t.legal.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.legal.close}
            className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors ${
              isDay
                ? 'hover:bg-white/60 text-slate-700'
                : 'hover:bg-white/12 text-slate-200'
            }`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div
          className={`flex items-center gap-1 px-5 py-2.5 border-b ${
            isDay
              ? 'border-slate-900/10 bg-white/30'
              : 'border-white/12 bg-white/[0.04]'
          }`}
          role="tablist"
        >
          {(['terms', 'privacy', 'credits'] as LegalTab[]).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? isDay
                      ? 'bg-slate-900 text-white'
                      : 'bg-amber-400 text-slate-950'
                    : isDay
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                      : 'text-slate-300 hover:text-white hover:bg-white/8'
                }`}
              >
                {t.legal.tabs[tab]}
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-sm leading-relaxed">
          {activeTab === 'terms' && (
            <div className="space-y-3">
              {t.legal.termsBody.map((para, idx) => (
                <p
                  key={idx}
                  className={isDay ? 'text-slate-700' : 'text-slate-300'}
                >
                  {para}
                </p>
              ))}
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-3">
              {t.legal.privacyBody.map((para, idx) => (
                <p
                  key={idx}
                  className={isDay ? 'text-slate-700' : 'text-slate-300'}
                >
                  {para}
                </p>
              ))}
            </div>
          )}

          {activeTab === 'credits' && (
            <div className="space-y-6">
              <div>
                <h3
                  className={`font-semibold text-xs uppercase tracking-wider mb-3 ${
                    isDay ? 'text-amber-700' : 'text-amber-400'
                  }`}
                >
                  {t.legal.creditsTracksTitle}
                </h3>
                <ul
                  className={`divide-y ${
                    isDay ? 'divide-slate-200' : 'divide-white/10'
                  }`}
                >
                  {tracks.map((track) => (
                    <li
                      key={track.id}
                      className="py-2.5 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <TrackThumb
                          url={track.artwork_url}
                          title={track.title}
                          isDay={isDay}
                        />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{track.title}</p>
                          <p
                            className={`text-xs ${
                              isDay ? 'text-slate-600' : 'text-slate-400'
                            }`}
                          >
                            {track.artist} · {formatLicense(track.license)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={track.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`shrink-0 inline-flex items-center gap-1 text-xs underline underline-offset-4 ${
                          isDay
                            ? 'text-slate-700 hover:text-amber-700'
                            : 'text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <span>{t.legal.sourceLabel}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3
                  className={`font-semibold text-xs uppercase tracking-wider mb-3 ${
                    isDay ? 'text-amber-700' : 'text-amber-400'
                  }`}
                >
                  {t.legal.creditsAmbientTitle}
                </h3>
                <ul
                  className={`divide-y ${
                    isDay ? 'divide-slate-200' : 'divide-white/10'
                  }`}
                >
                  {ambientCredits.map((item) => (
                    <li
                      key={item.id}
                      className="py-2.5 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {t.ambient[item.channel] ?? item.title}
                        </p>
                        <p
                          className={`text-xs ${
                            isDay ? 'text-slate-600' : 'text-slate-400'
                          }`}
                        >
                          {item.artist} · {formatLicense(item.license)}
                        </p>
                      </div>
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`shrink-0 inline-flex items-center gap-1 text-xs underline underline-offset-4 ${
                          isDay
                            ? 'text-slate-700 hover:text-amber-700'
                            : 'text-slate-300 hover:text-amber-300'
                        }`}
                      >
                        <span>{t.legal.sourceLabel}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
