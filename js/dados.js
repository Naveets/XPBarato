// Carrega o catálogo e os preços salvos pelo robô e monta a lista de jogos do app.

import { lojasDoJogo } from './lojas.js';

let cache = null;

async function buscar(caminho) {
  const resposta = await fetch(caminho, { cache: 'no-cache' });
  if (!resposta.ok) throw new Error(`Não foi possível carregar ${caminho}`);
  return resposta.json();
}

export async function carregarDados({ forcar = false } = {}) {
  if (cache && !forcar) return cache;
  const [catalogo, precos] = await Promise.all([
    buscar('dados/catalogo.json'),
    buscar('dados/precos.json').catch(() => ({ jogos: {}, promocoesSteam: [] }))
  ]);

  const jogos = catalogo.jogos.map((base) => montarJogo(base, precos.jogos?.[base.id] ?? {}));
  const promocoes = (precos.promocoesSteam ?? [])
    // não repete na vitrine um jogo que já está no catálogo
    .filter((p) => !catalogo.jogos.some((j) => j.steamAppId === p.appId))
    .map(montarPromocao);

  cache = {
    jogos,
    promocoes,
    atualizadoEm: precos.atualizadoEm ? new Date(precos.atualizadoEm) : null,
    exemplo: precos.fonte !== 'robo'
  };
  return cache;
}

function montarJogo(base, salvo) {
  const ofertas = [...(salvo.ofertas ?? [])].sort((a, b) => a.preco - b.preco);
  return {
    id: base.id,
    nome: base.nome,
    steamAppId: base.steamAppId,
    plataformas: base.plataformas,
    genero: salvo.generos?.[0] ?? base.genero,
    descricao: base.descricao || salvo.descricaoSteam,
    lancamento: salvo.lancamento ?? formatarDataIso(base.lancamento),
    capa: salvo.capa ?? null,
    ofertas,
    melhorOferta: ofertas[0] ?? null,
    lojas: lojasDoJogo(base.plataformas)
  };
}

function montarPromocao(p) {
  const oferta = {
    loja: 'steam',
    preco: p.preco,
    precoOriginal: p.precoOriginal,
    desconto: p.desconto,
    url: p.url,
    fonte: 'steam'
  };
  return {
    id: `steam-${p.appId}`,
    nome: p.nome,
    steamAppId: p.appId,
    plataformas: ['PC'],
    genero: null,
    descricao: null,
    lancamento: null,
    capa: p.capa,
    ofertas: [oferta],
    melhorOferta: oferta,
    lojas: lojasDoJogo(['PC']),
    terminaEm: p.terminaEm ? new Date(p.terminaEm) : null,
    promocaoDoDia: true
  };
}

export function encontrarJogo(dados, id) {
  return dados.jogos.find((j) => j.id === id) ?? dados.promocoes.find((j) => j.id === id) ?? null;
}

// ------------------------------------------------------------------ formatação

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarPreco = (valor) => moeda.format(valor);

function formatarDataIso(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(a, m - 1, d));
}

/** "hoje às 06:02", "ontem às 06:01" ou "18/11 às 06:00". */
export function quando(data, agora = new Date()) {
  if (!data) return '';
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(data);
  const dia = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const ontem = new Date(agora.getTime() - 86400000);
  if (dia(data) === dia(agora)) return `hoje às ${hora}`;
  if (dia(data) === dia(ontem)) return `ontem às ${hora}`;
  const dm = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(data);
  return `${dm} às ${hora}`;
}

/** Tempo que falta até o fim de uma promoção: "termina em 2 dias". */
export function tempoRestante(fim, agora = new Date()) {
  if (!fim) return '';
  const horas = Math.round((fim - agora) / 3600000);
  if (horas <= 0) return 'termina hoje';
  if (horas < 24) return `termina em ${horas} h`;
  const dias = Math.round(horas / 24);
  return `termina em ${dias} dia${dias > 1 ? 's' : ''}`;
}
