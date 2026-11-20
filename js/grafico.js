// Gráfico de histórico de preço (SVG desenhado à mão, sem biblioteca).
// Recebe a série [{ data: 'AAAA-MM-DD', preco: 99.9 }] com o menor preço de cada dia.

import { formatarDiaCurto, formatarPreco } from './dados.js';

const L = 340;   // largura do desenho (o SVG se ajusta à tela)
const A = 170;   // altura
const M = { topo: 16, dir: 12, base: 26, esq: 12 };

export function graficoDePreco(serie) {
  if (!serie.length) return '';
  const precos = serie.map((p) => p.preco);
  let min = Math.min(...precos);
  let max = Math.max(...precos);
  if (max - min < 1) { min -= 5; max += 5; } // linha reta não fica colada na borda
  const folga = (max - min) * 0.15;
  min = Math.max(0, min - folga);
  max += folga;

  const largura = L - M.esq - M.dir;
  const altura = A - M.topo - M.base;
  const x = (i) => M.esq + (serie.length === 1 ? largura / 2 : (i / (serie.length - 1)) * largura);
  const y = (v) => M.topo + (1 - (v - min) / (max - min)) * altura;

  // Linha em degraus: o preço vale o dia todo e muda de um dia para o outro.
  let caminho = `M ${x(0)} ${y(serie[0].preco)}`;
  for (let i = 1; i < serie.length; i++) caminho += ` H ${x(i)} V ${y(serie[i].preco)}`;
  const area = `${caminho} V ${M.topo + altura} H ${x(0)} Z`;

  const iMin = precos.indexOf(Math.min(...precos));
  const ultimo = serie.length - 1;
  const guias = [0.25, 0.5, 0.75].map((f) => M.topo + f * altura);

  return `
    <svg class="grafico" viewBox="0 0 ${L} ${A}" role="img"
         aria-label="Menor preço por dia, de ${formatarDiaCurto(serie[0].data)} a ${formatarDiaCurto(serie[ultimo].data)}">
      <defs>
        <linearGradient id="preenchimento" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#00e5ff" stop-opacity=".28"/>
          <stop offset="1" stop-color="#00e5ff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${guias.map((g) => `<line x1="${M.esq}" x2="${L - M.dir}" y1="${g}" y2="${g}" class="guia"/>`).join('')}
      ${serie.length > 1 ? `<path d="${area}" fill="url(#preenchimento)"/>` : ''}
      ${serie.length > 1 ? `<path d="${caminho}" class="linha"/>` : ''}
      ${serie.length > 1 && iMin !== ultimo
        ? `<circle cx="${x(iMin)}" cy="${y(precos[iMin])}" r="4" class="ponto-min"/>`
        : ''}
      <circle cx="${x(ultimo)}" cy="${y(precos[ultimo])}" r="5" class="ponto-atual"/>
      <text x="${M.esq}" y="${A - 8}" class="rotulo">${formatarDiaCurto(serie[0].data)}</text>
      ${serie.length > 1 ? `<text x="${L - M.dir}" y="${A - 8}" class="rotulo" text-anchor="end">${formatarDiaCurto(serie[ultimo].data)}</text>` : ''}
    </svg>
    <p class="legenda-grafico">
      <span><i class="cor-atual"></i>Hoje: ${formatarPreco(precos[ultimo])}</span>
      ${serie.length > 1 ? `<span><i class="cor-min"></i>Menor: ${formatarPreco(Math.min(...precos))}</span>` : ''}
    </p>`;
}
