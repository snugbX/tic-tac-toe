const CACHE_NAME = 'tic-tac-toe-v8';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=8',
  './script.js?v=8',
  './supabase-config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './sounds/click_human.wav',
  './sounds/click_ai.mp3',
  './sounds/win.mp3',
  './sounds/lose.mp3',
  './sounds/draw.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS.map((asset) => new URL(asset, self.registration.scope).toString())))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('tic-tac-toe-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const isInScope = requestUrl.origin === self.location.origin
    && requestUrl.href.startsWith(self.registration.scope);

  if (event.request.method !== 'GET' || !isInScope) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((response) => {
        if (response.ok) {
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, response.clone()))
            .then(() => response);
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(new URL('./index.html', self.registration.scope).toString());
        }
        throw new Error('Recurso indisponível offline.');
      });
    })
  );
});
