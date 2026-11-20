// Robô de preços do XP Barato
// ------------------------------------------------------------------
// Roda todo dia no GitHub Actions (veja .github/workflows/robo-de-precos.yml).
// 1. Lê a lista de jogos em dados/catalogo.json
// 2. Consulta o preço de cada jogo na Steam, em reais (cc=br)
// 3. Busca as promoções do dia na Steam
// 4. Salva tudo em dados/precos.json e acrescenta o dia em dados/historico.json
//
// Se uma consulta falhar, o robô mantém o último preço salvo daquele jogo,
// assim o app nunca fica sem dados.
//
// Para rodar no seu computador:  node robo/atualizar-precos.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ_CATALOGO = path.join(RAIZ, 'dados', 'catalogo.json');
const ARQ_PRECOS = path.join(RAIZ, 'dados', 'precos.json');
const ARQ_HISTORICO = path.join(RAIZ, 'dados', 'historico.json');

const STEAM = 'https://store.steampowered.com/api';
const PAIS = 'br';
const IDIOMA = 'brazilian';
const PAUSA_MS = 1500;          // espera entre consultas, para não sobrecarregar a Steam
const DIAS_DE_HISTORICO = 365;  // quantos dias o histórico guarda
const MAX_PROMOCOES = 12;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const centavos = (v) => Math.round(Number(v)) / 100;

async function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(await readFile(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

async function buscarJson(url) {
  const resposta = await fetch(url, {
    headers: {
      'User-Agent': 'XPBarato-robo/1.0 (trabalho academico; github.com/Naveets/XPBarato)',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    }
  });
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} em ${url}`);
  }
  return resposta.json();
}

/** Converte a data da Steam ("10 dez. 2020", "Dec 10, 2020"...) em texto simples. */
function textoLancamento(releaseDate) {
  if (!releaseDate) return null;
  if (releaseDate.coming_soon) return 'Em breve';
  return releaseDate.date || null;
}

/** Consulta detalhes + preço de um jogo na Steam. */
export async function consultarSteam(appId) {
  const url = `${STEAM}/appdetails?appids=${appId}&cc=${PAIS}&l=${IDIOMA}`;
  const json = await buscarJson(url);
  const item = json?.[appId];
  if (!item?.success || !item.data) {
    throw new Error(`Steam não encontrou o app ${appId}`);
  }
  const d = item.data;
  const preco = d.price_overview;
  const oferta = preco && preco.currency === 'BRL'
    ? {
        loja: 'steam',
        preco: centavos(preco.final),
        precoOriginal: centavos(preco.initial),
        desconto: Number(preco.discount_percent) || 0,
        url: `https://store.steampowered.com/app/${appId}/`,
        fonte: 'steam'
      }
    : null;

  return {
    nome: d.name,
    capa: d.header_image || null,
    lancamento: textoLancamento(d.release_date),
    descricaoSteam: d.short_description || null,
    generos: Array.isArray(d.genres) ? d.genres.map((g) => g.description) : [],
    gratuito: Boolean(d.is_free),
    oferta
  };
}

/** Promoções do dia na Steam brasileira. */
export async function consultarPromocoesSteam() {
  const json = await buscarJson(`${STEAM}/featuredcategories?cc=${PAIS}&l=${IDIOMA}`);
  const itens = json?.specials?.items ?? [];
  const vistos = new Set();
  return itens
    .filter((i) => i && i.id && i.discounted && i.currency === 'BRL')
    .filter((i) => (vistos.has(i.id) ? false : vistos.add(i.id)))
    .slice(0, MAX_PROMOCOES)
    .map((i) => ({
      appId: i.id,
      nome: i.name,
      capa: i.header_image || i.large_capsule_image || null,
      preco: centavos(i.final_price),
      precoOriginal: centavos(i.original_price),
      desconto: Number(i.discount_percent) || 0,
      terminaEm: i.discount_expiration ? new Date(i.discount_expiration * 1000).toISOString() : null,
      url: `https://store.steampowered.com/app/${i.id}/`
    }));
}

/** Data de hoje no horário de Brasília, no formato AAAA-MM-DD. */
function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

export async function executar({ agora = new Date(), pausaMs = PAUSA_MS } = {}) {
  const catalogo = await lerJson(ARQ_CATALOGO, { jogos: [] });
  const anterior = await lerJson(ARQ_PRECOS, { jogos: {} });
  const historico = await lerJson(ARQ_HISTORICO, { jogos: {} });

  const jogos = {};
  const erros = [];
  let atualizados = 0;

  for (const jogo of catalogo.jogos) {
    const salvo = anterior.jogos?.[jogo.id];
    if (!jogo.steamAppId) {
      // Jogo sem versão na Steam (ex.: exclusivos da Nintendo): só links por enquanto.
      jogos[jogo.id] = { ofertas: [], atualizadoEm: null };
      continue;
    }
    try {
      const s = await consultarSteam(jogo.steamAppId);
      jogos[jogo.id] = {
        nomeSteam: s.nome,
        capa: s.capa,
        lancamento: s.lancamento,
        descricaoSteam: s.descricaoSteam,
        generos: s.generos,
        ofertas: s.oferta ? [s.oferta] : [],
        atualizadoEm: agora.toISOString()
      };
      atualizados++;
      console.log(`✔ ${jogo.nome}: ${s.oferta ? 'R$ ' + s.oferta.preco.toFixed(2) : 'sem preço'}`);
    } catch (erro) {
      erros.push(`${jogo.nome}: ${erro.message}`);
      console.warn(`✖ ${jogo.nome}: ${erro.message} (mantendo o último preço salvo)`);
      jogos[jogo.id] = salvo ?? { ofertas: [], atualizadoEm: null };
    }
    await esperar(pausaMs);
  }

  let promocoesSteam = anterior.promocoesSteam ?? [];
  try {
    promocoesSteam = await consultarPromocoesSteam();
    console.log(`✔ Promoções do dia: ${promocoesSteam.length}`);
  } catch (erro) {
    erros.push(`Promoções da Steam: ${erro.message}`);
    console.warn(`✖ Promoções da Steam: ${erro.message} (mantendo as anteriores)`);
  }

  // Se nada deu certo, não sobrescreve os dados bons de ontem.
  if (atualizados === 0 && catalogo.jogos.some((j) => j.steamAppId)) {
    console.error('Nenhum preço foi atualizado. Os arquivos não foram alterados.');
    return { atualizados, erros, gravou: false };
  }

  const precos = {
    atualizadoEm: agora.toISOString(),
    fonte: 'robo',
    fontes: ['steam'],
    jogos,
    promocoesSteam,
    erros
  };

  // Histórico: um registro por dia com o preço de cada loja.
  const dia = hojeEmBrasilia(agora);
  historico.jogos ??= {};
  for (const [id, dados] of Object.entries(jogos)) {
    if (!dados.ofertas?.length || dados.atualizadoEm !== agora.toISOString()) continue;
    const serie = (historico.jogos[id] ??= []);
    const registro = { data: dia };
    for (const o of dados.ofertas) registro[o.loja] = o.preco;
    const ultimo = serie[serie.length - 1];
    if (ultimo?.data === dia) serie[serie.length - 1] = registro; // rodou 2x no mesmo dia
    else serie.push(registro);
    if (serie.length > DIAS_DE_HISTORICO) serie.splice(0, serie.length - DIAS_DE_HISTORICO);
  }
  historico.atualizadoEm = agora.toISOString();

  await writeFile(ARQ_PRECOS, JSON.stringify(precos, null, 2) + '\n');
  await writeFile(ARQ_HISTORICO, JSON.stringify(historico, null, 2) + '\n');
  console.log(`\nPronto: ${atualizados} jogo(s) atualizado(s), ${erros.length} erro(s).`);
  return { atualizados, erros, gravou: true };
}

// Executa quando chamado direto pelo terminal (e não quando importado nos testes).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executar().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
