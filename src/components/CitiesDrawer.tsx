import { MapPin, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext.tsx';
import type { CityPresence, GlobeTheme } from '../shared/types.ts';

interface CitiesDrawerProps {
  open: boolean;
  theme: GlobeTheme;
  cities: CityPresence[];
  userCityKey: string | null;
  onFocusCity: (city: CityPresence) => void;
  onClose: () => void;
}

export function CitiesDrawer({
  open,
  theme,
  cities,
  userCityKey,
  onFocusCity,
  onClose,
}: CitiesDrawerProps) {
  const { t, formatCityName, formatCountryName } = useI18n();

  if (!open) return null;

  const isDay = theme === 'day';
  const sorted = [...cities].sort((a, b) => b.n - a.n);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-end p-4 bg-black/30 backdrop-blur-[4px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cities-drawer-title"
      data-testid="cities-drawer"
    >
      <div
        className={`w-full max-w-sm max-h-[82vh] flex flex-col rounded-3xl overflow-hidden ${
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
          <div>
            <h2 id="cities-drawer-title" className="font-display text-base font-semibold">
              {t.citiesDrawer.title}
            </h2>
            <p
              className={`text-xs ${
                isDay ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {t.citiesDrawer.subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.citiesDrawer.close}
            className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg transition-colors ${
              isDay
                ? 'hover:bg-slate-100 text-slate-600'
                : 'hover:bg-white/10 text-slate-300'
            }`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-3 overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <p
              className={`p-4 text-sm text-center ${
                isDay ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              {t.citiesDrawer.empty}
            </p>
          ) : (
            <ul className="space-y-1">
              {sorted.map((city) => {
                const isMapPoint = city.lat !== null && city.lon !== null;
                const isSelf = city.key === userCityKey;
                const displayCity = formatCityName(city.key, city.name);
                const displayCountry = formatCountryName(city.countryCode, city.country);
                const subtitle = displayCountry
                  ? city.region
                    ? `${city.region} · ${displayCountry}`
                    : displayCountry
                  : t.citiesDrawer.unknownGroup;

                return (
                  <li key={city.key}>
                    <button
                      type="button"
                      disabled={!isMapPoint}
                      onClick={() => {
                        if (isMapPoint) {
                          onFocusCity(city);
                          onClose();
                        }
                      }}
                      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors ${
                        isMapPoint
                          ? isDay
                            ? 'hover:bg-slate-100 cursor-pointer'
                            : 'hover:bg-white/8 cursor-pointer'
                          : 'opacity-75 cursor-default'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin
                          className={`w-4 h-4 shrink-0 ${
                            isSelf
                              ? isDay
                                ? 'text-amber-700'
                                : 'text-amber-400'
                              : isDay
                                ? 'text-slate-500'
                                : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {displayCity}
                            {isSelf ? t.citiesDrawer.youTag : ''}
                          </p>
                          <p
                            className={`text-xs truncate ${
                              isDay ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {subtitle}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-mono-nums text-xs font-semibold shrink-0 ${
                          isDay ? 'text-amber-700' : 'text-amber-400'
                        }`}
                      >
                        {city.n}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
