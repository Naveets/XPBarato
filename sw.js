// Service worker do XP Barato: deixa o app instalável e funcionando sem internet.
// Estratégia "internet primeiro": o app sempre tenta baixar a versão mais nova dos arquivos e
// dos preços; só usa a cópia guardada no celular quando está sem internet.
// Quando uma versão nova do app é publicada, as telas abertas recarregam sozinhas.
// Ao mudar o app, aumente a VERSAO.

const VERSAO = 'xpbarato-onda4-v1';
const ARQUIVOS_DO_APP = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/alertas.js',
  './js/assinatura.js',
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
  if (url.pathname.includes('/__estado/')) return; // estado interno (alertas): só no Cache Storage

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

// ------------------------------------------------------------------ notificações (Onda 4)

// Tocar na notificação abre o app no jogo (ou foca a janela que já está aberta).
self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const destino = new URL(ev.notification.data?.url ?? './', self.registration.scope).href;
  ev.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((j) => j.url.startsWith(self.registration.scope));
    if (aberta) {
      await aberta.focus();
      return aberta.navigate(destino);
    }
    return self.clients.openWindow(destino);
  })());
});

// Conferência em segundo plano (Chrome no Android, com o app instalado).
// Mesma regra de js/alertas.js → avaliar().
const CACHE_ESTADO = 'xpb-estado';
const URL_ALERTAS = './__estado/alertas.json';
const reais = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function conferirPrecos() {
  const cache = await caches.open(CACHE_ESTADO);
  const salvo = await cache.match(URL_ALERTAS);
  if (!salvo) return;
  const alertas = await salvo.json();
  if (!alertas.length) return;
  const precos = await (await fetch('./dados/precos.json', { cache: 'no-cache' })).json();
  const agora = new Date().toISOString();

  const atualizados = [];
  for (const a of alertas) {
    const dados = precos.jogos?.[a.jogoId] ?? precos.extras?.[a.jogoId];
    const ofertas = [...(dados?.ofertas ?? [])].sort((x, y) => x.preco - y.preco);
    const melhor = ofertas[0];
    if (!melhor) { atualizados.push(a); continue; }
    const atual = melhor.preco;
    let disparou;
    const novo = { ...a, precoVisto: atual, verificadoEm: agora };
    if (a.alvo) {
      disparou = atual <= a.alvo && !a.avisadoNoAlvo;
      novo.avisadoNoAlvo = atual <= a.alvo;
    } else {
      disparou = a.precoVisto != null && atual < a.precoVisto - 0.009;
    }
    if (disparou) {
      novo.avisadoEm = agora;
      await self.registration.showNotification(`${a.nome} baixou para ${reais(atual)}`, {
        body: a.alvo ? `Chegou ao seu preço-alvo de ${reais(a.alvo)}.` : `Antes: ${reais(a.precoVisto)}. Toque para comparar as lojas.`,
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-72.png',
        tag: `preco-${a.jogoId}`,
        data: { url: `./#/jogo/${a.jogoId}` }
      });
    }
    atualizados.push(novo);
  }
  await cache.put(URL_ALERTAS, new Response(JSON.stringify(atualizados), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', (ev) => {
  if (ev.tag === 'xpb-precos') ev.waitUntil(conferirPrecos().catch(() => {}));
});
