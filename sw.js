// Service worker do XP Barato: deixa o app instalável e abrindo rápido.
// - Arquivos do app (HTML, CSS, JS, ícones): servidos do cache e atualizados em segundo plano.
// - Preços (dados/*.json): sempre tenta a internet primeiro; sem internet, usa o último salvo.
// Ao mudar o app, aumente a VERSAO para os celulares baixarem a versão nova.

const VERSAO = 'xpbarato-onda1-v2';
const ARQUIVOS_DO_APP = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/dados.js',
  './js/lojas.js',
  './js/metricas.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS_DO_APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // capas e lojas: direto da internet

  if (url.pathname.includes('/dados/')) {
    ev.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  ev.respondWith(
    caches.match(req).then((emCache) => {
      const daRede = fetch(req)
        .then((resp) => {
          if (resp.ok) {
            const copia = resp.clone();
            caches.open(VERSAO).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => emCache);
      return emCache || daRede;
    })
  );
});
