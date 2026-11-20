// Robô de preços do XP Barato
// ------------------------------------------------------------------
// Roda todo dia no GitHub Actions (veja .github/workflows/robo-de-precos.yml).
// 1. Lê a lista de jogos em dados/catalogo.json (os jogos escolhidos pelo grupo)
// 2. Descobre mais jogos na Steam: mais vendidos, lançamentos e promoções do dia
// 3. Consulta o preço de cada jogo na Steam, em reais (cc=br)
// 4. Salva tudo em dados/precos.json e acrescenta o dia em dados/historico.json
//
// Se uma consulta falhar, o robô mantém o último preço salvo daquele jogo,
// assim o app nunca fica sem dados.
//
// Para rodar no seu computador:  node robo/atualizar-precos.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { criarCliente, mesclarHistorico } from './itad.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARQ_CATALOGO = path.join(RAIZ, 'dados', 'catalogo.json');
const ARQ_PRECOS = path.join(RAIZ, 'dados', 'precos.json');
const ARQ_HISTORICO = path.join(RAIZ, 'dados', 'historico.json');

const STEAM = 'https://store.steampowered.com/api';
const PAIS = 'br';
const IDIOMA = 'brazilian';
const PAUSA_MS = 1500;          // espera entre consultas, para não sobrecarregar a Steam
const DIAS_DE_HISTORICO = 365;  // quantos dias o histórico guarda
const MAX_PROMOCOES = 12;       // cartões na vitrine "Promoções do dia"
const MAX_EXTRAS = 60;          // jogos descobertos na Steam, além do catálogo
const DIAS_MANTER_EXTRA = 30;   // um jogo descoberto continua no app por 30 dias depois de sair das listas
const DIAS_IMPORTAR_ITAD = 90;  // quantos dias de histórico trazer do IsThereAnyDeal
const MAX_IMPORTACOES = 80;     // históricos importados por execução (o resto fica para o dia seguinte)

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
    tipo: d.type ?? 'game',
    nome: d.name,
    capa: d.header_image || null,
    lancamento: textoLancamento(d.release_date),
    descricaoSteam: d.short_description || null,
    generos: Array.isArray(d.genres) ? d.genres.map((g) => g.description) : [],
    gratuito: Boolean(d.is_free),
    oferta
  };
}

/** Listas da página inicial da Steam brasileira: promoções, mais vendidos e lançamentos. */
export async function consultarListasSteam() {
  const json = await buscarJson(`${STEAM}/featuredcategories?cc=${PAIS}&l=${IDIOMA}`);
  const itens = (chave) => (json?.[chave]?.items ?? []).filter((i) => i && i.id && (i.type === undefined || i.type === 0));
  const vistos = new Set();

  const promocoes = itens('specials')
    .filter((i) => i.discounted && i.currency === 'BRL')
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

  const origens = new Map(); // appId -> ['mais-vendidos', 'lancamento', 'promocao']
  const marcar = (lista, origem) => {
    for (const i of lista) {
      if (!origens.has(i.id)) origens.set(i.id, []);
      if (!origens.get(i.id).includes(origem)) origens.get(i.id).push(origem);
    }
  };
  marcar(itens('top_sellers'), 'mais-vendidos');
  marcar(itens('new_releases'), 'lancamento');
  marcar(itens('specials').filter((i) => i.discounted), 'promocao');

  return { promocoes, origens };
}

/** Data de hoje no horário de Brasília, no formato AAAA-MM-DD. */
function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

function registrarHistorico(historico, id, ofertas, dia) {
  if (!ofertas?.length) return;
  const serie = (historico.jogos[id] ??= []);
  const registro = { data: dia };
  for (const o of ofertas) registro[o.loja] = o.preco;
  const ultimo = serie[serie.length - 1];
  if (ultimo?.data === dia) serie[serie.length - 1] = registro; // rodou 2x no mesmo dia
  else serie.push(registro);
  if (serie.length > DIAS_DE_HISTORICO) serie.splice(0, serie.length - DIAS_DE_HISTORICO);
}

export async function executar({ agora = new Date(), pausaMs = PAUSA_MS } = {}) {
  const catalogo = await lerJson(ARQ_CATALOGO, { jogos: [] });
  const anterior = await lerJson(ARQ_PRECOS, { jogos: {}, extras: {} });
  const historico = await lerJson(ARQ_HISTORICO, { jogos: {} });
  historico.jogos ??= {};

  const agoraIso = agora.toISOString();
  const dia = hojeEmBrasilia(agora);
  const erros = [];
  let atualizados = 0;

  // ---------- 1. jogos do catálogo do grupo
  const jogos = {};
  for (const jogo of catalogo.jogos) {
    const salvo = anterior.jogos?.[jogo.id];
    if (!jogo.steamAppId) {
      jogos[jogo.id] = { ofertas: [], atualizadoEm: null }; // ex.: exclusivos da Nintendo
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
        atualizadoEm: agoraIso
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

  // ---------- 2. listas da Steam (promoções, mais vendidos, lançamentos)
  let promocoesSteam = anterior.promocoesSteam ?? [];
  let origensHoje = new Map();
  try {
    const listas = await consultarListasSteam();
    promocoesSteam = listas.promocoes;
    origensHoje = listas.origens;
    console.log(`✔ Listas da Steam: ${promocoesSteam.length} promoções, ${origensHoje.size} jogos em destaque`);
  } catch (erro) {
    erros.push(`Listas da Steam: ${erro.message}`);
    console.warn(`✖ Listas da Steam: ${erro.message} (mantendo as anteriores)`);
  }

  // ---------- 3. jogos descobertos ("extras"): os de hoje + os vistos nos últimos 30 dias
  const noCatalogo = new Set(catalogo.jogos.map((j) => j.steamAppId).filter(Boolean));
  const limite = agora.getTime() - DIAS_MANTER_EXTRA * 86400000;
  const candidatos = new Map();
  for (const [appId, origem] of origensHoje) {
    if (!noCatalogo.has(appId)) candidatos.set(appId, { origem, vistoEm: agoraIso });
  }
  for (const extra of Object.values(anterior.extras ?? {})) {
    if (candidatos.has(extra.appId) || noCatalogo.has(extra.appId)) continue;
    if (new Date(extra.vistoEm).getTime() >= limite) candidatos.set(extra.appId, { origem: extra.origem ?? [], vistoEm: extra.vistoEm });
  }

  const extras = {};
  for (const [appId, info] of [...candidatos].slice(0, MAX_EXTRAS)) {
    const id = `steam-${appId}`;
    const salvo = anterior.extras?.[id];
    try {
      const s = await consultarSteam(appId);
      if (s.tipo !== 'game' || s.gratuito || !s.oferta) {
        await esperar(pausaMs);
        continue; // pula DLCs, trilhas sonoras, jogos gratuitos e itens sem preço
      }
      extras[id] = {
        appId,
        nome: s.nome,
        capa: s.capa,
        lancamento: s.lancamento,
        descricaoSteam: s.descricaoSteam,
        generos: s.generos,
        origem: info.origem,
        vistoEm: info.vistoEm,
        ofertas: [s.oferta],
        atualizadoEm: agoraIso
      };
      atualizados++;
    } catch (erro) {
      erros.push(`${salvo?.nome ?? appId}: ${erro.message}`);
      if (salvo) extras[id] = { ...salvo, origem: info.origem, vistoEm: info.vistoEm };
    }
    await esperar(pausaMs);
  }
  console.log(`✔ Jogos descobertos na Steam: ${Object.keys(extras).length}`);

  // ---------- 4. IsThereAnyDeal: outras lojas de PC + histórico (só com a chave configurada)
  const fontes = ['steam'];
  const chaveItad = process.env.ITAD_API_KEY?.trim();
  if (chaveItad) {
    try {
      const resumo = await enriquecerComItad({ chave: chaveItad, catalogo, jogos, extras, historico, agora, agoraIso, erros });
      fontes.push('isthereanydeal');
      console.log(`✔ IsThereAnyDeal: ${resumo.mapeados} jogos encontrados, ${resumo.comOutrasLojas} com preço em outras lojas, ${resumo.importados} históricos importados`);
    } catch (erro) {
      erros.push(`IsThereAnyDeal: ${erro.message}`);
      console.warn(`✖ IsThereAnyDeal: ${erro.message}`);
    }
  } else {
    console.log('ℹ IsThereAnyDeal: sem chave (segredo ITAD_API_KEY), usando só a Steam');
  }

  // ---------- 5. registra o dia de hoje no histórico (todas as lojas com preço)
  for (const [id, dados] of [...Object.entries(jogos), ...Object.entries(extras)]) {
    if (dados.atualizadoEm === agoraIso) registrarHistorico(historico, id, dados.ofertas, dia);
  }

  // Se nada deu certo, não sobrescreve os dados bons de ontem.
  if (atualizados === 0) {
    console.error('Nenhum preço foi atualizado. Os arquivos não foram alterados.');
    return { atualizados, erros, gravou: false };
  }

  const precos = {
    atualizadoEm: agoraIso,
    fonte: 'robo',
    fontes,
    jogos,
    extras,
    promocoesSteam,
    erros
  };
  historico.atualizadoEm = agoraIso;

  await writeFile(ARQ_PRECOS, JSON.stringify(precos, null, 2) + '\n');
  await writeFile(ARQ_HISTORICO, JSON.stringify(historico) + '\n');
  console.log(`\nPronto: ${atualizados} jogo(s) atualizado(s), ${erros.length} erro(s).`);
  return { atualizados, erros, gravou: true };
}

async function enriquecerComItad({ chave, catalogo, jogos, extras, historico, agora, agoraIso, erros }) {
  const cliente = criarCliente(chave);

  // Todos os jogos com versão na Steam: id no app → appid da Steam
  const alvos = [
    ...catalogo.jogos.filter((j) => j.steamAppId && jogos[j.id]).map((j) => ({ id: j.id, appId: j.steamAppId, dados: jogos[j.id] })),
    ...Object.entries(extras).map(([id, e]) => ({ id, appId: e.appId, dados: e }))
  ];
  const mapa = await cliente.mapearSteam(alvos.map((a) => a.appId));
  const comId = alvos.filter((a) => mapa.get(a.appId)).map((a) => ({ ...a, uuid: mapa.get(a.appId) }));

  // Preço atual nas outras lojas (a Steam continua vindo direto da Steam)
  const precos = await cliente.precosAtuais(comId.map((a) => a.uuid));
  let comOutrasLojas = 0;
  for (const alvo of comId) {
    const daSteam = (alvo.dados.ofertas ?? []).filter((o) => o.loja === 'steam');
    const outras = new Map();
    for (const o of precos.get(alvo.uuid) ?? []) {
      if (o.loja === 'steam') continue;
      if (!outras.has(o.loja) || o.preco < outras.get(o.loja).preco) outras.set(o.loja, o);
    }
    if (outras.size) comOutrasLojas++;
    alvo.dados.ofertas = [...daSteam, ...outras.values()].sort((a, b) => a.preco - b.preco);
    alvo.dados.itadId = alvo.uuid;
    if (outras.size && alvo.dados.atualizadoEm !== agoraIso) alvo.dados.atualizadoEm = agoraIso;
  }

  // Histórico dos últimos 90 dias: importa uma vez por jogo
  historico.importadoItad ??= {};
  const desde = new Date(agora.getTime() - DIAS_IMPORTAR_ITAD * 86400000);
  const ontem = new Date(agora.getTime() - 86400000);
  let importados = 0;
  for (const alvo of comId) {
    if (historico.importadoItad[alvo.id] || importados >= MAX_IMPORTACOES) continue;
    try {
      const mudancas = await cliente.historico(alvo.uuid);
      const lojasAtivas = new Set(alvo.dados.ofertas.map((o) => o.loja));
      historico.jogos[alvo.id] = mesclarHistorico(historico.jogos[alvo.id], mudancas, { desde, ate: ontem, lojasAtivas });
      historico.importadoItad[alvo.id] = agoraIso;
      importados++;
    } catch (erro) {
      erros.push(`Histórico ${alvo.dados.nome ?? alvo.id}: ${erro.message}`);
    }
    await esperar(200);
  }
  return { mapeados: comId.length, comOutrasLojas, importados };
}

// Executa quando chamado direto pelo terminal (e não quando importado nos testes).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  executar().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
