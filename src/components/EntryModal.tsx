import { Volume2 } from 'lucide-react';
import logoUrl from '../assets/planeta-lofi-logo.svg';
import { useI18n } from '../i18n/I18nContext.tsx';
import type { LegalTab } from './LegalModal.tsx';

interface EntryModalProps {
  acceptedTerms: boolean;
  onToggleAccepted: (checked: boolean) => void;
  onEnter: () => void;
  onOpenLegal: (tab: LegalTab) => void;
}

export function EntryModal({
  acceptedTerms,
  onToggleAccepted,
  onEnter,
  onOpenLegal,
}: EntryModalProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#040814]/45 backdrop-blur-[4px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-modal-title"
      data-testid="entry-modal"
    >
      <div className="w-full max-w-md rounded-3xl glass-panel-night p-6 sm:p-7 text-slate-100">
        <div className="space-y-2">
          <h1 id="entry-modal-title" className="text-balance">
            <img
              src={logoUrl}
              alt={t.appName}
              className="h-14 sm:h-16 w-auto"
              draggable={false}
            />
          </h1>
          <p className="text-sm sm:text-[15px] leading-relaxed text-slate-200/90">
            {t.tagline}
          </p>
        </div>

        <div className="mt-5 rounded-2xl glass-inset-night p-4 text-xs sm:text-[13px] leading-relaxed text-slate-200/90">
          {t.entryModal.privacySummary}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => onOpenLegal('terms')}
            className="underline underline-offset-4 hover:text-amber-300 transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            {t.entryModal.termsLink}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onOpenLegal('privacy')}
            className="underline underline-offset-4 hover:text-amber-300 transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            {t.entryModal.privacyLink}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onOpenLegal('credits')}
            className="underline underline-offset-4 hover:text-amber-300 transition-colors py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            {t.entryModal.creditsLink}
          </button>
        </div>

        <label className="mt-5 flex items-start gap-3 cursor-pointer text-xs sm:text-[13px] text-slate-200 leading-snug select-none">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => onToggleAccepted(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-500 bg-slate-900 text-amber-500 focus:ring-amber-400 accent-amber-500 cursor-pointer"
          />
          <span>{t.entryModal.acceptCheckbox}</span>
        </label>

        <button
          type="button"
          disabled={!acceptedTerms}
          onClick={onEnter}
          data-testid="enter-audio-btn"
          className="mt-6 w-full min-h-[46px] px-5 py-3 rounded-xl font-medium text-sm sm:text-[15px] flex items-center justify-center gap-2.5 transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40 disabled:cursor-not-allowed bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-semibold shadow-lg shadow-amber-500/15"
        >
          <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.entryModal.enterButton}</span>
        </button>
      </div>
    </div>
  );
}
