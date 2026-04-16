const CACHE_NAME = 'cert-gen-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/renderWorker.js',
  '/assets/logo_beige.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached asset if found, else fetch from network
      return response || fetch(event.request).then((networkResponse) => {
        // Cache the dynamically fetched template image if it's high res
        if (event.request.url.startsWith('data:image')) {
             return networkResponse;
        }
        return networkResponse;
      });
    })
  );
});
