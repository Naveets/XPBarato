// Integração com o IsThereAnyDeal (https://isthereanydeal.com), usada pelo robô de preços.
// Precisa da chave da API no segredo ITAD_API_KEY do GitHub (Settings → Secrets → Actions).
//
// O que ela traz:
//  - preço atual em reais de outras lojas de PC (Epic, Nuuvem, GOG, Fanatical...)
//  - histórico de preços dos últimos 90 dias, para o gráfico já começar cheio
//
// A documentação não fixa a versão de cada endpoint, então o robô testa as versões
// conhecidas em ordem e registra no log qual funcionou.

const BASE = 'https://api.isthereanydeal.com';
const PAIS = 'BR';
const STEAM_SHOP_ID = 61; // id da Steam dentro do IsThereAnyDeal

/** Nome da loja no IsThereAnyDeal → id usado no app (js/lojas.js). */
const LOJA_POR_NOME = {
  'steam': 'steam',
  'epic game store': 'epic',
  'epic games store': 'epic',
  'nuuvem': 'nuuvem',
  'gog': 'gog',
  'gog.com': 'gog',
  'fanatical': 'fanatical',
  'greenmangaming': 'gmg',
  'green man gaming': 'gmg',
  'humble store': 'humble',
  'humble bundle': 'humble',
  'gamesplanet': 'gamesplanet',
  'microsoft store': 'xbox',
  'blizzard': 'battlenet',
  'greenmangaming': 'gmg',
  'ea store': 'ea',
  'gamersgate': 'gamersgate',
  'indiegala store': 'indiegala',
  'microsoft store': 'xbox',
  'ubisoft store': 'ubisoft',
  'ea app': 'ea',
  'battle.net': 'battlenet'
};

export function idDaLoja(nome) {
  // versões regionais da mesma loja ("GamesPlanet US", "GamesPlanet UK"...) viram uma só
  const chave = String(nome ?? '').trim().toLowerCase().replace(/\s+(us|uk|de|fr|eu|br)$/, '');
  return LOJA_POR_NOME[chave] ?? chave.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const valor = (v) => (typeof v === 'number' ? v : Number(v?.amount));
const moedaOk = (v) => !v?.currency || v.currency === 'BRL';

export function criarCliente(chave, { log = console.log } = {}) {
  const versaoQueFuncionou = {};

  async function chamar(nome, caminhos, { metodo = 'GET', query = {}, corpo } = {}) {
    const ordem = versaoQueFuncionou[nome] ? [versaoQueFuncionou[nome]] : caminhos;
    let ultimoErro;
    for (const caminho of ordem) {
      const url = new URL(BASE + caminho);
      url.searchParams.set('key', chave);
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
      const resposta = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'XPBarato-robo/1.0 (trabalho academico)' },
        body: corpo ? JSON.stringify(corpo) : undefined
      });
      if (resposta.status === 404 || resposta.status === 405) {
        ultimoErro = new Error(`${caminho}: HTTP ${resposta.status}`);
        continue; // tenta a próxima versão
      }
      if (resposta.status === 401 || resposta.status === 403) {
        const erro = new Error('a chave da API foi recusada (HTTP ' + resposta.status + '). Confira o segredo ITAD_API_KEY.');
        erro.chaveInvalida = true;
        throw erro;
      }
      if (!resposta.ok) {
        const texto = await resposta.text().catch(() => '');
        throw new Error(`${caminho}: HTTP ${resposta.status} ${texto.slice(0, 160)}`);
      }
      if (!versaoQueFuncionou[nome]) {
        versaoQueFuncionou[nome] = caminho;
        log(`  IsThereAnyDeal: ${nome} → ${caminho}`);
      }
      return resposta.json();
    }
    throw ultimoErro ?? new Error(`${nome}: nenhuma versão respondeu`);
  }

  /** Steam appid → id do jogo no IsThereAnyDeal. Devolve um Map(appId → uuid | null). */
  async function mapearSteam(appIds) {
    const mapa = new Map();
    if (!appIds.length) return mapa;
    try {
      const json = await chamar('lookup por loja', [`/lookup/id/shop/${STEAM_SHOP_ID}/v1`], {
        metodo: 'POST',
        corpo: appIds.map((id) => `app/${id}`)
      });
      for (const id of appIds) mapa.set(id, json?.[`app/${id}`] ?? null);
      return mapa;
    } catch (erro) {
      if (erro.chaveInvalida) throw erro; // não adianta tentar um por um
      log(`  IsThereAnyDeal: lookup em lote falhou (${erro.message}); tentando um por um`);
    }
    for (const id of appIds) {
      try {
        const json = await chamar('lookup por appid', ['/games/lookup/v1'], { query: { appid: id } });
        mapa.set(id, json?.found ? json.game?.id ?? null : null);
      } catch {
        mapa.set(id, null);
      }
    }
    return mapa;
  }

  /** Preço atual em reais por loja. Devolve Map(uuid → [{loja, lojaNome, preco, precoOriginal, desconto, url}]). */
  async function precosAtuais(uuids) {
    const resultado = new Map();
    for (let i = 0; i < uuids.length; i += 100) {
      const lote = uuids.slice(i, i + 100);
      const json = await chamar('preços', ['/games/prices/v3', '/games/prices/v2'], {
        metodo: 'POST',
        query: { country: PAIS, deals: 'false', vouchers: 'false' },
        corpo: lote
      });
      for (const jogo of json ?? []) {
        const ofertas = [];
        for (const d of jogo.deals ?? []) {
          if (!moedaOk(d.price)) continue; // só reais
          const preco = valor(d.price);
          const original = valor(d.regular);
          if (!(preco > 0)) continue;
          ofertas.push({
            loja: idDaLoja(d.shop?.name),
            lojaNome: d.shop?.name,
            preco,
            precoOriginal: original > 0 ? original : preco,
            desconto: Number(d.cut) || 0,
            url: d.url || null,
            fonte: 'isthereanydeal'
          });
        }
        resultado.set(jogo.id, ofertas);
      }
    }
    return resultado;
  }

  /**
   * Todas as mudanças de preço do jogo: [{ timestamp, loja, preco }], só em reais.
   * Pede o histórico completo (sem "since") porque um jogo que não mudou de preço no período
   * não teria nenhum registro, e precisamos saber o preço que estava valendo.
   */
  async function historico(uuid) {
    const json = await chamar('histórico', ['/games/history/v2', '/games/history/v1'], {
      query: { id: uuid, country: PAIS }
    });
    return (json ?? [])
      .filter((e) => e?.timestamp && e.deal && moedaOk(e.deal.price))
      .map((e) => ({ timestamp: e.timestamp, loja: idDaLoja(e.shop?.name), preco: valor(e.deal.price) }))
      .filter((e) => e.preco > 0);
  }

  return { mapearSteam, precosAtuais, historico };
}

const diaEmBrasilia = (data) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(data);

/**
 * Converte a lista de mudanças de preço em um registro por dia (o mesmo formato do historico.json):
 * em cada dia, o preço que estava valendo em cada loja. Dias já registrados pelo robô são mantidos.
 */
export function mesclarHistorico(serieAtual, mudancas, { desde, ate, lojasAtivas = null }) {
  const porData = new Map((serieAtual ?? []).map((r) => [r.data, r]));
  const eventos = mudancas
    .filter((e) => !lojasAtivas || lojasAtivas.has(e.loja)) // ignora lojas que não vendem mais o jogo
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const vigente = {};
  let i = 0;
  for (let dia = new Date(desde); diaEmBrasilia(dia) <= diaEmBrasilia(ate); dia = new Date(dia.getTime() + 86400000)) {
    const data = diaEmBrasilia(dia);
    while (i < eventos.length && diaEmBrasilia(new Date(eventos[i].timestamp)) <= data) {
      vigente[eventos[i].loja] = eventos[i].preco;
      i++;
    }
    if (porData.has(data) || !Object.keys(vigente).length) continue;
    porData.set(data, { data, ...vigente });
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}
