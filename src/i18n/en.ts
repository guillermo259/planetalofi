import type { I18nMessages } from './types.ts';

export const en: I18nMessages = {
  metaTitle: 'Planeta Lo-Fi — Global Radio & Live Presence',
  metaDescription:
    'Listen to the same lo-fi radio stream alongside people around the world on a 3D globe with rain, ocean waves, and keyboard ambiance.',
  appName: 'Planeta Lo-Fi',
  tagline:
    'Listen to the same lo-fi radio stream with people around the world on a 3D globe.',
  entryModal: {
    privacySummary:
      'When you enter, we use your IP address for a brief moment to estimate only your approximate city on the planet while you are connected. We never store your IP, exact location, or personal data, and there are no accounts or chat.',
    termsLink: 'Terms of Use',
    privacyLink: 'Privacy Policy',
    creditsLink: 'Audio Licenses',
    acceptCheckbox: 'I have read and accept the terms and privacy policy',
    enterButton: 'Enter & enable audio',
    audioBlockedHint:
      'Your browser paused audio playback. Click here to enable sound.',
  },
  header: {
    listenersSingle: 'person listening',
    listenersPlural: 'people listening',
    noListenersYet: 'Waiting for listeners',
    yourCityLabel: 'Your point:',
    dayMode: 'Day',
    nightMode: 'Night',
    switchToDay: 'Switch to day mode',
    switchToNight: 'Switch to night mode',
    citiesList: 'Active cities',
    resetView: 'Global view',
  },
  connection: {
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    offline: 'Offline',
    retry: 'Retry',
  },
  radio: {
    label: 'Shared radio',
    loading: 'Loading station…',
    trackError: 'Could not load track, skipping to the next one',
    muteRadio: 'Mute radio',
    unmuteRadio: 'Unmute radio',
    volumeRadio: 'Radio volume',
    muteAll: 'Mute all',
    unmuteAll: 'Unmute all',
    hideControls: 'Hide controls',
    showControls: 'Show controls',
    ambientToggle: 'Ambient',
  },
  ambient: {
    title: 'Local ambient sounds',
    subtitle: 'Played only in your browser',
    rain: 'Rain',
    waves: 'Ocean waves',
    keyboard: 'Keyboard',
    volumeOf: (name: string) => `${name} volume`,
    toggleOf: (name: string) => `Toggle ${name}`,
    loading: 'Loading…',
  },
  cityDetail: {
    close: 'Close city details',
    listenersSingle: 'person connected',
    listenersPlural: 'people connected',
    focusCity: 'Zoom to this city',
    unknownLocation: 'Unknown location',
  },
  citiesDrawer: {
    title: 'Active cities right now',
    subtitle: 'Accessible alternative to the 3D globe',
    empty: 'No active listeners on the globe yet.',
    close: 'Close cities list',
    unknownGroup: 'Location hidden on map',
    youTag: ' (you)',
  },
  legal: {
    title: 'Legal & Audio Credits',
    close: 'Close dialog',
    tabs: {
      terms: 'Terms of Use',
      privacy: 'Privacy',
      credits: 'Audio Credits',
    },
    termsBody: [
      'Planeta Lo-Fi is a free shared listening space for studying, coding, or relaxing without user accounts or messaging.',
      'The service is provided as-is without continuous availability guarantees. Music tracks and ambient loops are played under their respective free licenses listed in the credits tab.',
      'Automated mass connections or attempts to artificially inflate presence markers are prohibited.',
    ],
    privacyBody: [
      'Privacy first: your IP address is processed exclusively in memory at the moment you connect to estimate your approximate city, region, or country and place a shared light marker on the globe.',
      'We never write your IP to disk, databases, analytics, or server logs. Coordinates are rounded to approximate city centers.',
      'When you close the tab or lose connection, your session disappears from memory. Your browser only stores local preferences for volume, day/night mode, and terms acceptance.',
    ],
    creditsTracksTitle: 'Lo-fi radio tracks',
    creditsAmbientTitle: 'Ambient sound channels',
    licenseLabel: 'License',
    sourceLabel: 'Source',
    publicDomainLicense: 'CC0 1.0 (Public Domain)',
  },
  globe: {
    loadingTextures: 'Preparing 3D planet…',
    ariaLabel: 'Interactive 3D globe of Planeta Lo-Fi listeners',
    webglUnavailable:
      'The 3D viewer is unavailable on this device, but you can still browse the active cities list and listen to the radio.',
  },
};
