const CACHE_NAME = 'mda-v1';
const assets = [
  './',
  './index.html',
  './dashboard.html',
  './style.css',
  './app.js',
  './manifest.json',
  './logomdaapp.png',    // Verifica que este archivo exista en la carpeta
  './logomdaapp512.png'  // Verifica que este archivo exista en la carpeta
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});