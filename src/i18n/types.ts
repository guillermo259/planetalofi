export type Locale = 'en' | 'es';

export interface I18nMessages {
  metaTitle: string;
  metaDescription: string;
  appName: string;
  tagline: string;
  entryModal: {
    privacySummary: string;
    termsLink: string;
    privacyLink: string;
    creditsLink: string;
    acceptCheckbox: string;
    enterButton: string;
    audioBlockedHint: string;
  };
  header: {
    listenersSingle: string;
    listenersPlural: string;
    noListenersYet: string;
    yourCityLabel: string;
    dayMode: string;
    nightMode: string;
    switchToDay: string;
    switchToNight: string;
    citiesList: string;
    resetView: string;
  };
  connection: {
    connecting: string;
    reconnecting: string;
    offline: string;
    retry: string;
  };
  radio: {
    label: string;
    loading: string;
    trackError: string;
    muteRadio: string;
    unmuteRadio: string;
    volumeRadio: string;
    muteAll: string;
    unmuteAll: string;
    hideControls: string;
    showControls: string;
    ambientToggle: string;
  };
  ambient: {
    title: string;
    subtitle: string;
    rain: string;
    waves: string;
    keyboard: string;
    volumeOf: (name: string) => string;
    toggleOf: (name: string) => string;
    loading: string;
  };
  cityDetail: {
    close: string;
    listenersSingle: string;
    listenersPlural: string;
    focusCity: string;
    unknownLocation: string;
  };
  citiesDrawer: {
    title: string;
    subtitle: string;
    empty: string;
    close: string;
    unknownGroup: string;
    youTag: string;
  };
  legal: {
    title: string;
    close: string;
    tabs: {
      terms: string;
      privacy: string;
      credits: string;
    };
    termsBody: readonly string[];
    privacyBody: readonly string[];
    creditsTracksTitle: string;
    creditsAmbientTitle: string;
    licenseLabel: string;
    sourceLabel: string;
    publicDomainLicense: string;
  };
  globe: {
    loadingTextures: string;
    ariaLabel: string;
    webglUnavailable: string;
  };
}
