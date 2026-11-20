// Assinatura XP+ (Onda 3): ofertas do dia com desconto extra e cupons exclusivos.
// Mesmas regras do AssinaturaService do protótipo Java:
//   - plano único, R$ 9,90 por mês
//   - 3 ofertas do dia com +5% de desconto, iguais para todos e trocadas à meia-noite
//   - preço para assinante = preço da loja × (1 − 5% se for oferta do dia) × (1 − cupom da loja)
//
// No MVP nada é cobrado e os descontos são simulados: as parcerias com as lojas ainda
// não existem. Cada assinatura conta como sinal de interesse (métrica do Canvas).

import * as auth from './auth.js';
import { registrarEvento } from './metricas.js';
import { nomeDaLoja } from './lojas.js';

export const PRECO_MENSAL = 9.9;
export const OFERTAS_POR_DIA = 3;
export const DESCONTO_DIARIO = 0.05;

const arredondar = (v) => Math.round(v * 100) / 100;
export const hojeEmBrasilia = (agora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

export function ehAssinante(usuario = auth.usuarioAtual()) {
  return Boolean(usuario?.assinante);
}

export function assinar() {
  const usuario = auth.usuarioAtual();
  if (ehAssinante(usuario)) return usuario;
  registrarEvento('assinou-xp');
  return auth.atualizarUsuario({ assinante: true, assinanteDesde: hojeEmBrasilia() });
}

export function cancelar() {
  registrarEvento('cancelou-xp');
  return auth.atualizarUsuario({ assinante: false, assinanteDesde: null });
}

/** Número pseudoaleatório com semente (mulberry32): mesma data → mesmo sorteio para todos. */
function sorteador(texto) {
  let s = 0;
  for (const c of texto) s = (Math.imul(31, s) + c.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Três jogos por dia, sorteados entre os jogos do catálogo e os mais vendidos da Steam
 * que têm preço. A data é a semente: muda todo dia, mas é igual para todo mundo.
 */
export function ofertasDoDia(dados, dia = hojeEmBrasilia()) {
  const candidatos = dados.todos
    .filter((j) => j.melhorOferta && (j.doCatalogo || j.origem?.includes('mais-vendidos')))
    .sort((a, b) => a.id.localeCompare(b.id));
  const aleatorio = sorteador(`xp+${dia}`);
  for (let i = candidatos.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [candidatos[i], candidatos[j]] = [candidatos[j], candidatos[i]];
  }
  return candidatos.slice(0, OFERTAS_POR_DIA);
}

export function cuponsValidos(dados, dia = hojeEmBrasilia()) {
  return (dados.cupons ?? []).filter((c) => !c.validade || c.validade >= dia);
}

export function melhorCupom(dados, loja) {
  return cuponsValidos(dados)
    .filter((c) => c.loja === loja)
    .sort((a, b) => b.percentual - a.percentual)[0] ?? null;
}

/**
 * Preço que o assinante paga em uma oferta, com o que foi aplicado.
 * Devolve null quando o XP+ não muda nada nessa loja.
 */
export function precoXp(dados, jogo, oferta, idsDoDia = new Set(ofertasDoDia(dados).map((j) => j.id))) {
  const doDia = idsDoDia.has(jogo.id);
  const cupom = melhorCupom(dados, oferta.loja);
  if (!doDia && !cupom) return null;
  let preco = oferta.preco;
  if (doDia) preco *= 1 - DESCONTO_DIARIO;
  if (cupom) preco *= 1 - cupom.percentual;
  return { preco: arredondar(preco), doDia, cupom, economia: arredondar(oferta.preco - preco) };
}

/** Melhor preço XP+ entre todas as lojas do jogo (para comparar com o melhor preço normal). */
export function melhorPrecoXp(dados, jogo, idsDoDia) {
  let melhor = null;
  for (const oferta of jogo.ofertas) {
    const xp = precoXp(dados, jogo, oferta, idsDoDia);
    if (xp && (!melhor || xp.preco < melhor.preco)) melhor = { ...xp, oferta };
  }
  return melhor && jogo.melhorOferta && melhor.preco < jogo.melhorOferta.preco ? melhor : null;
}

/** Tempo até a meia-noite (horário de Brasília), quando as ofertas do dia trocam. */
export function tempoAteTrocar(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(agora).split(':').map(Number);
  const minutos = 24 * 60 - (partes[0] * 60 + partes[1]);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

// ------------------------------------------------------------------ cashback (Onda 4)
// Regra do protótipo Java: assinante XP+ ganha 10% da primeira compra feita por um link
// do app, até R$ 30. Num app real a loja/afiliado confirmaria a compra; no MVP o próprio
// usuário confirma quando volta da loja. Saldo simulado.

export const PERCENTUAL_CASHBACK = 0.10;
export const LIMITE_CASHBACK = 30;
const CHAVE_PENDENTE = 'xpb.compraPendente';
const VALIDADE_PENDENTE_MS = 48 * 60 * 60 * 1000;

export const calcularCashback = (valor) => arredondar(Math.min(valor * PERCENTUAL_CASHBACK, LIMITE_CASHBACK));

export function cashbackDisponivel(usuario = auth.usuarioAtual()) {
  return ehAssinante(usuario) && !usuario?.cashbackUtilizado;
}

/** Guarda a compra que o usuário pode ter feito ao tocar em "Ir à loja". */
export function registrarIdaALoja(jogo, oferta, preco) {
  if (!cashbackDisponivel()) return;
  try {
    localStorage.setItem(CHAVE_PENDENTE, JSON.stringify({
      email: auth.usuarioAtual().email,
      jogoId: jogo.id,
      nome: jogo.nome,
      loja: oferta.loja,
      lojaNome: oferta.lojaNome ?? null,
      preco,
      em: Date.now()
    }));
  } catch {
    // sem localStorage: segue sem cashback
  }
}

export function compraPendente() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PENDENTE));
    if (!p) return null;
    const valida = p.email === auth.usuarioAtual()?.email && Date.now() - p.em < VALIDADE_PENDENTE_MS && cashbackDisponivel();
    if (!valida) {
      localStorage.removeItem(CHAVE_PENDENTE);
      return null;
    }
    return { ...p, cashback: calcularCashback(p.preco) };
  } catch {
    return null;
  }
}

export function descartarCompra() {
  try {
    localStorage.removeItem(CHAVE_PENDENTE);
  } catch {
    // ignora
  }
}

/** Confirma a compra pendente e credita o cashback. Devolve o valor creditado. */
export function confirmarCompra() {
  const p = compraPendente();
  descartarCompra();
  if (!p) return null;
  const usuario = auth.usuarioAtual();
  auth.atualizarUsuario({
    cashbackUtilizado: true,
    saldoCashback: arredondar((usuario.saldoCashback ?? 0) + p.cashback),
    cashbackHistorico: [...(usuario.cashbackHistorico ?? []), { jogo: p.nome, loja: nomeDaLoja(p), valor: p.cashback, preco: p.preco, data: hojeEmBrasilia() }]
  });
  registrarEvento('cashback', { titulo: `${p.nome} (${p.cashback})` });
  return p.cashback;
}
