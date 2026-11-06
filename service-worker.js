const CACHE_NAME = 'hoopslot-pwa-v68-exact-hero';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/hoopslot-app-icon-32.png',
  './assets/art-giants-logo.png',
  './assets/hoopslot-logo.png',
  './assets/hoopslot-logo-white.png',
  './assets/hoopslot-app-icon-180.png',
  './assets/hoopslot-app-icon-192.png',
  './assets/hoopslot-app-icon-512.png',
  './assets/hoopslot-app-icon-maskable-512.png',
  './assets/basketball-admin-v9.png',
  './assets/basketball-trainer-v9.png',
  './assets/basketball-parent-v9.png',
  './assets/training-basketball-blue.png',
  './assets/training-hero-background.webp',
  './assets/team-suedwest-baskets.png',
  './assets/team-osterather-tv.jpg',
  './assets/team-art-giants.png',
  './assets/team-djk-tusa.svg',
  './assets/team-tg-duesseldorf.png',
  './assets/team-isd-sportverein.png',
  './assets/team-art-duesseldorf.webp',
  './apple-touch-icon.png',
  './apple-touch-icon-precomposed.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase and other third-party traffic must always bypass the PWA cache.
  if (url.origin !== self.location.origin) return;

  const networkFirst = request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/config.js')
    || url.pathname.endsWith('/manifest.webmanifest');

  if (networkFirst) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(response => response || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const refresh = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
