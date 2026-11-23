import type { I18nMessages } from './types.ts';

export const es: I18nMessages = {
  metaTitle: 'Planeta Lo-Fi — Radio global y presencia en vivo',
  metaDescription:
    'Escucha la misma radio lo-fi junto a personas de todo el mundo sobre un globo 3D con lluvia, olas y sonido de teclado.',
  appName: 'Planeta Lo-Fi',
  tagline:
    'Escucha la misma radio lo-fi junto a personas de todo el mundo sobre un globo 3D.',
  entryModal: {
    privacySummary:
      'Al entrar, usamos tu dirección IP un instante para situar solo tu ciudad aproximada en el planeta mientras estás conectado. No guardamos tu IP, tu ubicación exacta ni datos personales, y no hay cuentas ni chat.',
    termsLink: 'Términos de uso',
    privacyLink: 'Política de privacidad',
    creditsLink: 'Licencias de audio',
    acceptCheckbox: 'He leído y acepto los términos y la política de privacidad',
    enterButton: 'Entrar y activar audio',
    audioBlockedHint:
      'El navegador pausó el audio. Pulsa aquí para activar el sonido.',
  },
  header: {
    listenersSingle: 'persona escuchando',
    listenersPlural: 'personas escuchando',
    noListenersYet: 'Esperando oyentes',
    yourCityLabel: 'Tu punto:',
    dayMode: 'Día',
    nightMode: 'Noche',
    switchToDay: 'Cambiar a modo día',
    switchToNight: 'Cambiar a modo noche',
    citiesList: 'Ciudades activas',
    resetView: 'Vista global',
  },
  connection: {
    connecting: 'Conectando…',
    reconnecting: 'Reconectando…',
    offline: 'Sin conexión',
    retry: 'Reintentar',
  },
  radio: {
    label: 'Radio compartida',
    loading: 'Cargando emisora…',
    trackError: 'No se pudo cargar la pista, saltando a la siguiente',
    muteRadio: 'Silenciar radio',
    unmuteRadio: 'Activar radio',
    volumeRadio: 'Volumen de la radio',
    muteAll: 'Silenciar todo',
    unmuteAll: 'Restaurar sonido',
    hideControls: 'Ocultar controles',
    showControls: 'Mostrar controles',
    ambientToggle: 'Ambiente',
  },
  ambient: {
    title: 'Sonidos ambientales locales',
    subtitle: 'Solo se oyen en tu navegador',
    rain: 'Lluvia',
    waves: 'Olas del mar',
    keyboard: 'Teclado',
    volumeOf: (name: string) => `Volumen de ${name}`,
    toggleOf: (name: string) => `Activar o silenciar ${name}`,
    loading: 'Cargando…',
  },
  cityDetail: {
    close: 'Cerrar detalle de ciudad',
    listenersSingle: 'persona conectada',
    listenersPlural: 'personas conectadas',
    focusCity: 'Acercar a esta ciudad',
    unknownLocation: 'Ubicación desconocida',
  },
  citiesDrawer: {
    title: 'Ciudades activas en este momento',
    subtitle: 'Alternativa accesible al mapa 3D',
    empty: 'Aún no hay oyentes activos en el globo.',
    close: 'Cerrar lista de ciudades',
    unknownGroup: 'Sin ubicación visible en el mapa',
    youTag: ' (tú)',
  },
  legal: {
    title: 'Información legal y créditos',
    close: 'Cerrar ventana',
    tabs: {
      terms: 'Términos de uso',
      privacy: 'Privacidad',
      credits: 'Créditos de audio',
    },
    termsBody: [
      'Planeta Lo-Fi es un espacio gratuito de escucha compartida para estudiar, programar o descansar sin cuentas de usuario ni mensajería.',
      'El servicio se ofrece tal cual, sin garantías de disponibilidad continua. Las pistas musicales y sonidos ambientales se reproducen bajo sus respectivas licencias libres indicadas en la pestaña de créditos.',
      'Queda prohibido intentar saturar el servicio mediante conexiones automatizadas masivas o alterar los marcadores de presencia.',
    ],
    privacyBody: [
      'Privacidad primero: tu dirección IP se procesa exclusivamente en memoria en el instante en que abres la conexión para deducir tu ciudad, región o país aproximado y situar un punto luminoso colectivo en el globo.',
      'Nunca escribimos tu IP en discos, bases de datos, analíticas ni registros del servidor. Las coordenadas se redondean al centro aproximado de la ciudad.',
      'Cuando cierras la pestaña o pierdes la conexión, tu sesión desaparece de la memoria. El navegador solo guarda localmente tus preferencias de volumen, el modo día/noche y la aceptación de estos términos.',
    ],
    creditsTracksTitle: 'Pistas de la radio lo-fi',
    creditsAmbientTitle: 'Canales ambientales',
    licenseLabel: 'Licencia',
    sourceLabel: 'Origen',
    publicDomainLicense: 'CC0 1.0 (Dominio público)',
  },
  globe: {
    loadingTextures: 'Preparando planeta 3D…',
    ariaLabel: 'Globo 3D interactivo de oyentes de Planeta Lo-Fi',
    webglUnavailable:
      'El visor 3D no está disponible en este dispositivo, pero puedes usar la lista de ciudades activas y escuchar la radio normalmente.',
  },
};
