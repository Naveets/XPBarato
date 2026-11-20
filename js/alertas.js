// Notificações de promoções (Onda 4): alertas de preço por jogo.
//
// Como funciona sem servidor:
//  - o usuário segue um jogo (🔔), com ou sem preço-alvo;
//  - quando o app abre (ou volta do segundo plano), ele compara os preços do robô com os
//    que o usuário já viu e, se baixou, mostra uma notificação do sistema;
//  - no Android, com o app instalado, o service worker também confere em segundo plano
//    (Periodic Background Sync do Chrome; o navegador decide a frequência).
//
// A lista de alertas fica no localStorage (por conta) e uma cópia vai para o Cache Storage,
// que é o único lugar que o service worker consegue ler.

import * as auth from './auth.js';
import { formatarPreco } from './dados.js';
import { nomeDaLoja } from './lojas.js';
import { registrarEvento } from './metricas.js';

const CACHE_ESTADO = 'xpb-estado';
const URL_ALERTAS = './__estado/alertas.json';
const chave = () => `xpb.alertas.${auth.usuarioAtual()?.email ?? 'anonimo'}`;

function ler() {
  try {
    return JSON.parse(localStorage.getItem(chave())) ?? [];
  } catch {
    return [];
  }
}

async function gravar(alertas) {
  try {
    localStorage.setItem(chave(), JSON.stringify(alertas));
  } catch {
    // sem espaço / modo anônimo
  }
  try {
    const cache = await caches.open(CACHE_ESTADO);
    await cache.put(URL_ALERTAS, new Response(JSON.stringify(alertas), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Cache Storage indisponível: só o aviso em segundo plano deixa de funcionar
  }
}

export const listar = () => ler();
export const seguindo = (jogoId) => ler().find((a) => a.jogoId === jogoId) ?? null;

export async function seguir(jogo, alvo = null) {
  const alertas = ler().filter((a) => a.jogoId !== jogo.id);
  alertas.push({
    jogoId: jogo.id,
    nome: jogo.nome,
    alvo: alvo > 0 ? Math.round(alvo * 100) / 100 : null,
    precoVisto: jogo.melhorOferta?.preco ?? null,
    criadoEm: new Date().toISOString(),
    avisadoNoAlvo: false
  });
  await gravar(alertas);
  registrarEvento('seguiu-jogo', { titulo: jogo.nome });
}

export async function deixarDeSeguir(jogoId) {
  await gravar(ler().filter((a) => a.jogoId !== jogoId));
}

/** Mantém a cópia do service worker em dia (ex.: depois de trocar de conta). */
export const sincronizar = () => gravar(ler());

// ------------------------------------------------------------------ permissão

export const suportado = () => 'Notification' in window && 'serviceWorker' in navigator;
export const permissao = () => (suportado() ? Notification.permission : 'unsupported');

export async function pedirPermissao() {
  if (!suportado()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  const resposta = await Notification.requestPermission();
  registrarEvento(resposta === 'granted' ? 'ativou-notificacoes' : 'recusou-notificacoes');
  if (resposta === 'granted') registrarSegundoPlano();
  return resposta;
}

/** Pede ao Chrome para acordar o app algumas vezes por dia (só com o app instalado). */
export async function registrarSegundoPlano() {
  try {
    const registro = await navigator.serviceWorker.ready;
    if (!('periodicSync' in registro)) return false;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await registro.periodicSync.register('xpb-precos', { minInterval: 6 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

async function notificar({ titulo, corpo, jogoId, tag }) {
  if (permissao() !== 'granted') return false;
  const registro = await navigator.serviceWorker.ready;
  await registro.showNotification(titulo, {
    body: corpo,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    tag: tag ?? `preco-${jogoId}`,
    data: { url: `./#/jogo/${jogoId}` },
    vibrate: [80, 40, 80]
  });
  return true;
}

// ------------------------------------------------------------------ verificação

/**
 * Regra do alerta:
 *  - com preço-alvo: avisa quando o menor preço chega ao alvo (uma vez; volta a valer se subir de novo);
 *  - sem alvo: avisa sempre que o menor preço fica abaixo do último preço visto.
 */
export function avaliar(alerta, atual) {
  if (atual == null) return { disparou: false, alerta };
  const novo = { ...alerta, precoVisto: atual, verificadoEm: new Date().toISOString() };
  let disparou = false;
  if (alerta.alvo) {
    disparou = atual <= alerta.alvo && !alerta.avisadoNoAlvo;
    novo.avisadoNoAlvo = atual <= alerta.alvo;
  } else {
    disparou = alerta.precoVisto != null && atual < alerta.precoVisto - 0.009;
  }
  if (disparou) novo.avisadoEm = new Date().toISOString();
  return { disparou, alerta: novo };
}

/** O service worker pode ter conferido em segundo plano: traz o estado mais novo dele. */
async function mesclarComSegundoPlano(alertas) {
  try {
    const resposta = await (await caches.open(CACHE_ESTADO)).match(URL_ALERTAS);
    if (!resposta) return alertas;
    const doSw = new Map((await resposta.json()).map((a) => [a.jogoId, a]));
    return alertas.map((a) => {
      const b = doSw.get(a.jogoId);
      return b && (b.verificadoEm ?? '') > (a.verificadoEm ?? '')
        ? { ...a, precoVisto: b.precoVisto, avisadoNoAlvo: b.avisadoNoAlvo, avisadoEm: b.avisadoEm, verificadoEm: b.verificadoEm }
        : a;
    });
  } catch {
    return alertas;
  }
}

/** Confere todos os alertas com os preços atuais. Devolve os jogos que baixaram. */
export async function verificar(dados) {
  const alertas = await mesclarComSegundoPlano(ler());
  if (!alertas.length) return [];
  const disparados = [];
  const atualizados = alertas.map((a) => {
    const jogo = dados.todos.find((j) => j.id === a.jogoId);
    const { disparou, alerta } = avaliar(a, jogo?.melhorOferta?.preco ?? null);
    if (disparou) disparados.push({ jogo, alerta, antes: a.precoVisto });
    return alerta;
  });
  await gravar(atualizados);
  for (const d of disparados) {
    const o = d.jogo.melhorOferta;
    await notificar({
      titulo: `${d.jogo.nome} baixou para ${formatarPreco(o.preco)}`,
      corpo: d.alerta.alvo
        ? `Chegou ao seu preço-alvo de ${formatarPreco(d.alerta.alvo)} na ${nomeDaLoja(o)}.`
        : `Antes: ${formatarPreco(d.antes)}. Agora na ${nomeDaLoja(o)}${o.desconto ? ` (-${o.desconto}%)` : ''}.`,
      jogoId: d.jogo.id
    });
    registrarEvento('notificacao-preco', { titulo: d.jogo.nome });
  }
  return disparados;
}

/** Notificação de demonstração com dados reais de um jogo (botão "Testar notificação"). */
export async function testar(jogo) {
  const o = jogo.melhorOferta;
  registrarEvento('testou-notificacao');
  return notificar({
    titulo: `🔔 ${jogo.nome} por ${formatarPreco(o.preco)}`,
    corpo: `Menor preço agora na ${nomeDaLoja(o)}${o.desconto ? ` (-${o.desconto}%)` : ''}. Toque para comparar as lojas.`,
    jogoId: jogo.id,
    tag: 'teste'
  });
}
