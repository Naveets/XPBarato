// Service worker do XP Barato: deixa o app instalável e funcionando sem internet.
// Estratégia "internet primeiro": o app sempre tenta baixar a versão mais nova dos arquivos e
// dos preços; só usa a cópia guardada no celular quando está sem internet.
// Quando uma versão nova do app é publicada, as telas abertas recarregam sozinhas.
// Ao mudar o app, aumente a VERSAO.

const VERSAO = 'xpbarato-onda2-v5';
const ARQUIVOS_DO_APP = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/auth.js',
  './js/dados.js',
  './js/grafico.js',
  './js/lojas.js',
  './js/metricas.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSAO)
      .then((c) => c.addAll(ARQUIVOS_DO_APP.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const antigas = (await caches.keys()).filter((k) => k !== VERSAO);
    await Promise.all(antigas.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Se havia uma versão anterior, recarrega as telas abertas para mostrar a nova.
    if (antigas.length) {
      const janelas = await self.clients.matchAll({ type: 'window' });
      janelas.forEach((j) => j.navigate(j.url).catch(() => {}));
    }
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // capas e lojas: direto da internet

  ev.respondWith((async () => {
    try {
      // no-cache: pergunta ao servidor se o arquivo mudou (rápido quando não mudou)
      const resp = await fetch(req, { cache: 'no-cache' });
      if (resp.ok) {
        const copia = resp.clone();
        caches.open(VERSAO).then((c) => c.put(req, copia));
      }
      return resp;
    } catch {
      const guardado = await caches.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      if (req.mode === 'navigate') return caches.match('./index.html');
      throw new Error('Sem internet e sem cópia guardada');
    }
  })());
});
