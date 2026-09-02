/**
 * Service worker: deixa o app abrir offline. So o casco estatico e cacheado -
 * o diario vive no IndexedDB e as chamadas ao Gemini nunca passam por aqui.
 */
const CACHE = 'diario-v3';

const CASCO = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'data/taco.json',
  'js/app.js',
  'js/db.js',
  'js/estado.js',
  'js/gemini.js',
  'js/nutri.js',
  'js/sistema.js',
  'js/taco.js',
  'js/ui.js',
  'js/views/hoje.js',
  'js/views/sistema.js',
  'js/views/semana.js',
  'js/views/peso.js',
  'js/views/treino.js',
  'js/views/dieta.js',
  'js/views/ajustes.js',
  'js/views/registrar.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Cache primeiro (abre instantaneo), com atualizacao silenciosa em segundo plano.
  e.respondWith(
    caches.match(e.request).then((guardado) => {
      const rede = fetch(e.request)
        .then((resp) => {
          if (resp.ok) caches.open(CACHE).then((c) => c.put(e.request, resp.clone()));
          return resp;
        })
        .catch(() => guardado);
      return guardado || rede;
    }),
  );
});
