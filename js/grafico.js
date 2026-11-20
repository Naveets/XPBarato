// Gráfico de histórico de preço (SVG desenhado à mão, sem biblioteca).
// Série: [{ data: 'AAAA-MM-DD', preco, loja, steam }] com o menor preço de cada dia.
//
// - linha cheia: menor preço do dia entre todas as lojas
// - linha tracejada cinza: preço na Steam (quando é diferente do menor)
// - linha tracejada amarela: média do período
// - tocar/arrastar no gráfico mostra o dia, o preço e a loja

import { formatarPreco } from './dados.js';
import { nomeDaLoja } from './lojas.js';

const L = 340;   // largura do desenho (o SVG se ajusta à tela)
const A = 200;   // altura
const M = { topo: 14, dir: 8, base: 22, esq: 44 };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const diaMes = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dataLonga = (iso) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const reaisCurto = (v) => (v >= 1000 ? `R$${(v / 1000).toFixed(1).replace('.', ',')}k` : `R$${Math.round(v)}`);

/** Escolhe um passo "redondo" (5, 10, 20, 25, 50…) para as linhas do eixo de preço. */
function passoRedondo(intervalo, marcas = 3) {
  const bruto = intervalo / marcas;
  const base = 10 ** Math.floor(Math.log10(bruto || 1));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * base >= bruto) return m * base;
  return 10 * base;
}

function escala(serie, media) {
  const valores = [...serie.map((p) => p.preco), ...serie.map((p) => p.steam).filter((v) => v != null), media];
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (max - min < 2) { min -= 5; max += 5; }
  const passo = passoRedondo(max - min);
  min = Math.max(0, Math.floor((min - passo * 0.3) / passo) * passo);
  max = Math.ceil((max + passo * 0.2) / passo) * passo;
  const largura = L - M.esq - M.dir;
  const altura = A - M.topo - M.base;
  return {
    passo, min, max, largura, altura,
    x: (i) => M.esq + (serie.length === 1 ? largura / 2 : (i / (serie.length - 1)) * largura),
    y: (v) => M.topo + (1 - (v - min) / (max - min)) * altura
  };
}

/** Linha em degraus: o preço vale o dia todo e muda de um dia para o outro. */
function degraus(serie, campo, e) {
  let caminho = '';
  let ultimo = null;
  serie.forEach((p, i) => {
    const v = p[campo];
    if (v == null) { ultimo = null; return; }
    caminho += ultimo == null ? ` M ${e.x(i)} ${e.y(v)}` : ` H ${e.x(i)} V ${e.y(v)}`;
    ultimo = v;
  });
  return caminho.trim();
}

/** Marcas do eixo das datas: início de cada mês (períodos longos) ou a cada semana. */
function marcasDeData(serie) {
  if (serie.length > 45) {
    return serie
      .map((p, i) => ({ i, p }))
      .filter(({ p, i }) => i > 0 && p.data.endsWith('-01'))
      .map(({ i, p }) => ({ i, texto: MESES[Number(p.data.slice(5, 7)) - 1] }));
  }
  const pulo = Math.max(1, Math.round(serie.length / 4));
  const marcas = [];
  for (let i = 0; i < serie.length; i += pulo) marcas.push({ i, texto: diaMes(serie[i].data) });
  return marcas;
}

export function graficoDePreco(serie, est) {
  if (!serie.length) return '';
  const e = escala(serie, est.media);
  const ultimo = serie.length - 1;
  const temSteam = serie.some((p) => p.steam != null && Math.abs(p.steam - p.preco) > 0.009);
  const iMin = serie.map((p) => p.preco).lastIndexOf(est.minimo);

  const linhasPreco = [];
  for (let v = e.min; v <= e.max + 0.001; v += e.passo) linhasPreco.push(v);

  const menor = degraus(serie, 'preco', e);
  const area = serie.length > 1 ? `${menor} V ${M.topo + e.altura} H ${e.x(0)} Z` : '';
  const yMedia = e.y(est.media);
  // rótulo do menor preço não pode sair da área do gráfico
  const xRotuloMin = Math.min(Math.max(e.x(iMin), M.esq + 30), L - M.dir - 30);

  return `
    <div class="grafico-caixa">
      <div class="dica" aria-live="polite"></div>
      <svg class="grafico" viewBox="0 0 ${L} ${A}" role="img"
           aria-label="Menor preço por dia, de ${dataLonga(serie[0].data)} a ${dataLonga(serie[ultimo].data)}. Menor ${formatarPreco(est.minimo)}, média ${formatarPreco(est.media)}, hoje ${formatarPreco(est.atual)}.">
        <defs>
          <linearGradient id="preenchimento" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#00e5ff" stop-opacity=".25"/>
            <stop offset="1" stop-color="#00e5ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${linhasPreco.map((v) => `
          <line x1="${M.esq}" x2="${L - M.dir}" y1="${e.y(v)}" y2="${e.y(v)}" class="guia"/>
          <text x="${M.esq - 6}" y="${e.y(v) + 3.5}" class="rotulo" text-anchor="end">${reaisCurto(v)}</text>`).join('')}
        ${marcasDeData(serie).map((m) => `
          <line x1="${e.x(m.i)}" x2="${e.x(m.i)}" y1="${M.topo}" y2="${M.topo + e.altura}" class="guia vertical"/>
          <text x="${e.x(m.i)}" y="${A - 6}" class="rotulo" text-anchor="middle">${m.texto}</text>`).join('')}
        ${area ? `<path d="${area}" fill="url(#preenchimento)"/>` : ''}
        ${temSteam ? `<path d="${degraus(serie, 'steam', e)}" class="linha-steam"/>` : ''}
        <line x1="${M.esq}" x2="${L - M.dir}" y1="${yMedia}" y2="${yMedia}" class="linha-media"/>
        ${serie.length > 1 ? `<path d="${menor}" class="linha"/>` : ''}
        ${serie.length > 1 && iMin !== ultimo ? `
          <circle cx="${e.x(iMin)}" cy="${e.y(est.minimo)}" r="4" class="ponto-min"/>
          <text x="${xRotuloMin}" y="${e.y(est.minimo) + 15}" class="rotulo-min" text-anchor="middle">${formatarPreco(est.minimo)}</text>` : ''}
        <circle cx="${e.x(ultimo)}" cy="${e.y(est.atual)}" r="5" class="ponto-atual"/>
        <g class="cursor" hidden>
          <line y1="${M.topo}" y2="${M.topo + e.altura}"/>
          <circle r="5"/>
        </g>
        <rect class="area-toque" x="${M.esq}" y="0" width="${e.largura}" height="${A}" fill="transparent"/>
      </svg>
    </div>
    <p class="legenda-grafico">
      <span><i class="cor-linha"></i>Menor preço</span>
      ${temSteam ? '<span><i class="cor-steam"></i>Steam</span>' : ''}
      <span><i class="cor-media"></i>Média</span>
      ${serie.length > 1 && iMin !== ultimo ? '<span><i class="cor-min"></i>Menor do período</span>' : ''}
    </p>`;
}

/** Liga o toque/arraste: mostra o dia, o preço e a loja do ponto escolhido. */
export function ativarGrafico(caixa, serie, est) {
  const svg = caixa.querySelector('svg.grafico');
  if (!svg) return;
  const dica = caixa.querySelector('.dica');
  const cursor = svg.querySelector('.cursor');
  const [linha, ponto] = cursor.children;
  const e = escala(serie, est.media);

  const mostrar = (i) => {
    const p = serie[i];
    const x = e.x(i);
    const y = e.y(p.preco);
    linha.setAttribute('x1', x);
    linha.setAttribute('x2', x);
    ponto.setAttribute('cx', x);
    ponto.setAttribute('cy', y);
    cursor.hidden = false;
    const steam = p.steam != null && Math.abs(p.steam - p.preco) > 0.009 ? `<small>Steam: ${formatarPreco(p.steam)}</small>` : '';
    dica.innerHTML = `<strong>${formatarPreco(p.preco)}</strong> <span>na ${nomeDaLoja({ loja: p.loja })}</span><small>${dataLonga(p.data)}${i === serie.length - 1 ? ' · hoje' : ''}</small>${steam}`;
    // posiciona a dica sobre o ponto, sem sair da caixa
    const pos = (x / L) * caixa.clientWidth;
    dica.style.left = `${Math.min(Math.max(pos, 70), caixa.clientWidth - 70)}px`;
    dica.classList.add('visivel');
  };

  const indiceNoPonto = (ev) => {
    const r = svg.getBoundingClientRect();
    const xSvg = ((ev.clientX - r.left) / r.width) * L;
    const frac = (xSvg - M.esq) / e.largura;
    return Math.min(serie.length - 1, Math.max(0, Math.round(frac * (serie.length - 1))));
  };

  const area = svg.querySelector('.area-toque');
  area.addEventListener('pointerdown', (ev) => mostrar(indiceNoPonto(ev)));
  area.addEventListener('pointermove', (ev) => mostrar(indiceNoPonto(ev)));
  mostrar(serie.length - 1); // começa mostrando o dia de hoje
}
