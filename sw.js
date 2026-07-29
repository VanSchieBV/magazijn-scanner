/* Service worker — bij elke wijziging aan de app: VERSION ophogen! */
const VERSION = 'mgz-v1.7.2';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'zxing.min.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  // cache:'reload' — vers van het netwerk halen, nooit uit de HTTP-cache
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API-verkeer nooit cachen
  if (url.hostname !== self.location.hostname) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request))
  );
});
