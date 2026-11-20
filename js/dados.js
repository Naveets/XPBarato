// Carrega o catálogo, os preços salvos pelo robô e os gift cards, e monta a lista de jogos do app.
// Também tem as regras de negócio vindas do protótipo Java (ComparadorService):
// selo de gift card, estatísticas do histórico e veredito "é uma boa hora de comprar?".

import { lojasDoJogo } from './lojas.js';

let cache = null;
let cacheHistorico = null;

async function buscar(caminho) {
  const resposta = await fetch(caminho, { cache: 'no-cache' });
  if (!resposta.ok) throw new Error(`Não foi possível carregar ${caminho}`);
  return resposta.json();
}

export async function carregarDados({ forcar = false } = {}) {
  if (cache && !forcar) return cache;
  const [catalogo, precos, giftcards] = await Promise.all([
    buscar('dados/catalogo.json'),
    buscar('dados/precos.json').catch(() => ({ jogos: {}, extras: {}, promocoesSteam: [] })),
    buscar('dados/giftcards.json').catch(() => ({ cartoes: [] }))
  ]);

  const doCatalogo = catalogo.jogos.map((base) => montarJogo(base, precos.jogos?.[base.id] ?? {}));
  const descobertos = Object.entries(precos.extras ?? {}).map(([id, e]) => montarDescoberto(id, e));
  const porAppId = new Map([...doCatalogo, ...descobertos].filter((j) => j.steamAppId).map((j) => [j.steamAppId, j]));

  // Vitrine: usa o jogo completo quando ele já existe; senão monta um a partir da promoção.
  const promocoes = (precos.promocoesSteam ?? [])
    .filter((p) => !catalogo.jogos.some((j) => j.steamAppId === p.appId))
    .map((p) => {
      const jogo = porAppId.get(p.appId) ?? montarPromocao(p);
      jogo.terminaEm = p.terminaEm ? new Date(p.terminaEm) : null;
      return jogo;
    });

  const cartoes = (giftcards.cartoes ?? []).filter((c) => c.preco > 0 && c.valorFace > 0);
  const todos = [...doCatalogo, ...descobertos];
  for (const p of promocoes) if (!todos.includes(p)) todos.push(p);
  for (const jogo of todos) jogo.selo = seloGiftCard(jogo, cartoes);

  cache = {
    jogos: doCatalogo,
    descobertos,
    promocoes,
    todos,
    cartoes,
    atualizadoEm: precos.atualizadoEm ? new Date(precos.atualizadoEm) : null,
    exemplo: precos.fonte !== 'robo'
  };
  return cache;
}

export async function carregarHistorico() {
  if (!cacheHistorico) {
    cacheHistorico = await buscar('dados/historico.json').catch(() => ({ jogos: {} }));
  }
  return cacheHistorico;
}

const lancamentoLegivel = (texto) => (texto ? texto.replaceAll('/', ' ') : null);

function montarJogo(base, salvo) {
  const ofertas = [...(salvo.ofertas ?? [])].sort((a, b) => a.preco - b.preco);
  return {
    id: base.id,
    nome: base.nome,
    steamAppId: base.steamAppId,
    plataformas: base.plataformas,
    genero: salvo.generos?.[0] ?? base.genero,
    generos: [base.genero, ...(salvo.generos ?? [])].filter(Boolean),
    descricao: base.descricao || salvo.descricaoSteam,
    lancamento: salvo.lancamento ? lancamentoLegivel(salvo.lancamento) : formatarDataIso(base.lancamento),
    capa: salvo.capa ?? null,
    ofertas,
    melhorOferta: ofertas[0] ?? null,
    lojas: lojasDoJogo(base.plataformas),
    doCatalogo: true
  };
}

function montarDescoberto(id, e) {
  const ofertas = [...(e.ofertas ?? [])].sort((a, b) => a.preco - b.preco);
  return {
    id,
    nome: e.nome,
    steamAppId: e.appId,
    plataformas: ['PC'],
    genero: e.generos?.[0] ?? null,
    generos: e.generos ?? [],
    descricao: e.descricaoSteam,
    lancamento: lancamentoLegivel(e.lancamento),
    capa: e.capa,
    ofertas,
    melhorOferta: ofertas[0] ?? null,
    lojas: lojasDoJogo(['PC']),
    origem: e.origem ?? []
  };
}

function montarPromocao(p) {
  const oferta = { loja: 'steam', preco: p.preco, precoOriginal: p.precoOriginal, desconto: p.desconto, url: p.url, fonte: 'steam' };
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
    origem: ['promocao']
  };
}

export function encontrarJogo(dados, id) {
  return dados.todos.find((j) => j.id === id) ?? null;
}

// ------------------------------------------------------------------ selo de gift card

/** Em qual gift card vale o crédito de cada loja oficial. */
const ECOSSISTEMA_DA_LOJA = { steam: 'STEAM', psn: 'PSN', xbox: 'XBOX', eshop: 'NINTENDO' };
/** Economia mínima para o selo aparecer (abaixo disso não vale o trabalho de comprar o cartão). */
export const ECONOMIA_MINIMA_SELO = 5;

/**
 * Igual ao protótipo Java: para cada loja oficial que vende o jogo, procura o gift card
 * mais barato daquele ecossistema. Preço efetivo = preço na loja × (preço pago ÷ valor do cartão).
 * Se ficar abaixo da melhor oferta direta, o jogo ganha o selo.
 */
export function seloGiftCard(jogo, cartoes) {
  if (!jogo.melhorOferta) return null;
  const melhorDireto = jogo.melhorOferta.preco;
  let melhor = null;
  for (const oferta of jogo.ofertas) {
    const ecossistema = ECOSSISTEMA_DA_LOJA[oferta.loja];
    if (!ecossistema) continue;
    for (const cartao of cartoes.filter((c) => c.ecossistema === ecossistema)) {
      const fator = cartao.preco / cartao.valorFace;
      if (fator >= 1) continue; // cartão sem desconto não ajuda
      const efetivo = arredondar(oferta.preco * fator);
      if (melhorDireto - efetivo >= ECONOMIA_MINIMA_SELO && (!melhor || efetivo < melhor.precoEfetivo)) {
        melhor = {
          cartao,
          oferta,
          precoEfetivo: efetivo,
          economia: arredondar(melhorDireto - efetivo),
          quantidade: Math.ceil(oferta.preco / cartao.valorFace)
        };
      }
    }
  }
  return melhor;
}

// ------------------------------------------------------------------ histórico

/** Para cada dia, o menor preço entre as lojas (base do gráfico). */
export function serieMenorPreco(registros = []) {
  return registros
    .map((r) => {
      const valores = Object.entries(r).filter(([k, v]) => k !== 'data' && typeof v === 'number').map(([, v]) => v);
      return valores.length ? { data: r.data, preco: Math.min(...valores) } : null;
    })
    .filter(Boolean);
}

export function estatisticas(serie) {
  if (!serie.length) return null;
  const precos = serie.map((p) => p.preco);
  return {
    minimo: Math.min(...precos),
    maximo: Math.max(...precos),
    media: arredondar(precos.reduce((a, b) => a + b, 0) / precos.length),
    atual: precos[precos.length - 1],
    dias: serie.length
  };
}

export const DIAS_MINIMOS_VEREDITO = 7;

/** Mesmas faixas do ComparadorService.veredito() do protótipo Java. */
export function veredito(e) {
  if (!e || e.dias < DIAS_MINIMOS_VEREDITO) return null;
  if (e.atual <= e.minimo * 1.02) return { tipo: 'recorde', titulo: 'Preço recorde', texto: 'É o menor preço já registrado. Ótima hora de comprar.' };
  if (e.atual <= e.media * 0.92) return { tipo: 'bom', titulo: 'Bom preço', texto: 'Está abaixo da média do período.' };
  if (e.atual <= e.media * 1.03) return { tipo: 'comum', titulo: 'Preço comum', texto: 'Perto da média. Vale esperar uma promoção.' };
  return { tipo: 'alto', titulo: 'Acima da média', texto: 'Costuma ficar mais barato. Espere uma promoção.' };
}

// ------------------------------------------------------------------ busca

/** Tira acentos e símbolos para a busca achar "pokemon" em "Pokémon™". */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©:'’.\-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buscarJogos(jogos, termo, { plataforma = null, ordem = 'relevancia' } = {}) {
  const t = normalizar(termo);
  const palavras = t ? t.split(' ') : [];
  let resultado = jogos.filter((j) => {
    if (plataforma && !j.plataformas.includes(plataforma)) return false;
    if (!palavras.length) return true;
    // cada palavra digitada precisa ser o começo de alguma palavra do nome ou do gênero
    const alvo = normalizar(`${j.nome} ${(j.generos ?? [j.genero]).join(' ')}`).split(' ');
    return palavras.every((p) => alvo.some((w) => w.startsWith(p)));
  });

  const preco = (j) => j.melhorOferta?.preco ?? Infinity;
  const desconto = (j) => j.melhorOferta?.desconto ?? -1;
  if (ordem === 'menor-preco') resultado.sort((a, b) => preco(a) - preco(b));
  else if (ordem === 'desconto') resultado.sort((a, b) => desconto(b) - desconto(a) || preco(a) - preco(b));
  else {
    const pontos = (j) => (t && normalizar(j.nome).startsWith(t) ? 3 : 0) + (j.doCatalogo ? 1 : 0) + (desconto(j) > 0 ? 0.5 : 0);
    resultado.sort((a, b) => pontos(b) - pontos(a) || a.nome.localeCompare(b.nome));
  }
  return resultado;
}

// ------------------------------------------------------------------ formatação

const arredondar = (v) => Math.round(v * 100) / 100;
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatarPreco = (valor) => moeda.format(valor);

function formatarDataIso(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(a, m - 1, d));
}

export function formatarDiaCurto(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(a, m - 1, d));
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
