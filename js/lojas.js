// Lojas comparadas pelo XP Barato e o link de busca de cada uma.
// %s é trocado pelo nome do jogo. (Mesmas lojas do protótipo em Java.)

export const LOJAS = {
  steam:        { nome: 'Steam',             tipo: 'PC',      busca: 'https://store.steampowered.com/search/?term=%s' },
  epic:         { nome: 'Epic Games Store',  tipo: 'PC',      busca: 'https://store.epicgames.com/pt-BR/browse?q=%s' },
  nuuvem:       { nome: 'Nuuvem',            tipo: 'PC',      busca: 'https://www.nuuvem.com/br-pt/catalog/search/%s' },
  psn:          { nome: 'PlayStation Store', tipo: 'PS',      busca: 'https://store.playstation.com/pt-br/search/%s' },
  xbox:         { nome: 'Xbox Store',        tipo: 'XB',      busca: 'https://www.xbox.com/pt-BR/search?q=%s' },
  eshop:        { nome: 'Nintendo eShop',    tipo: 'SW',      busca: 'https://www.nintendo.com/pt-br/search/#q=%s' },
  amazon:       { nome: 'Amazon',            tipo: 'Console', busca: 'https://www.amazon.com.br/s?k=%s' },
  mercadolivre: { nome: 'Mercado Livre',     tipo: 'Console', busca: 'https://lista.mercadolivre.com.br/%s' },
  // Lojas de PC que chegam pelo IsThereAnyDeal
  gog:          { nome: 'GOG',               tipo: 'PC',      busca: 'https://www.gog.com/pt/games?query=%s' },
  fanatical:    { nome: 'Fanatical',         tipo: 'PC',      busca: 'https://www.fanatical.com/pt/search?search=%s' },
  gmg:          { nome: 'Green Man Gaming',  tipo: 'PC',      busca: 'https://www.greenmangaming.com/search?query=%s' },
  humble:       { nome: 'Humble Store',      tipo: 'PC',      busca: 'https://www.humblebundle.com/store/search?search=%s' },
  gamesplanet:  { nome: 'Gamesplanet',       tipo: 'PC',      busca: 'https://us.gamesplanet.com/search?query=%s' },
  gamersgate:   { nome: 'GamersGate',        tipo: 'PC',      busca: 'https://www.gamersgate.com/games/?query=%s' },
  indiegala:    { nome: 'IndieGala',         tipo: 'PC',      busca: 'https://www.indiegala.com/search/%s' },
  ubisoft:      { nome: 'Ubisoft Store',     tipo: 'PC',      busca: 'https://store.ubisoft.com/br/search?q=%s' },
  ea:           { nome: 'EA app',            tipo: 'PC',      busca: 'https://www.ea.com/pt-br/games/library?q=%s' },
  battlenet:    { nome: 'Battle.net',        tipo: 'PC',      busca: 'https://shop.battle.net/pt-br/search?q=%s' },
  gamebillet:   { nome: 'GameBillet',        tipo: 'PC',      busca: 'https://www.gamebillet.com/search?q=%s' },
  wingamestore: { nome: 'WinGameStore',      tipo: 'PC',      busca: 'https://www.wingamestore.com/search/?SearchWord=%s' }
};

/** Nome da loja para mostrar na tela (lojas novas que o robô trouxer usam o nome recebido). */
export const nomeDaLoja = (oferta) => LOJAS[oferta.loja]?.nome ?? oferta.lojaNome ?? oferta.loja;

export const PLATAFORMAS = {
  PC: 'PC',
  PS: 'PlayStation',
  XB: 'Xbox',
  SW: 'Switch'
};

/** Lojas onde faz sentido procurar o jogo, de acordo com as plataformas dele. */
export function lojasDoJogo(plataformas = []) {
  const ids = [];
  if (plataformas.includes('PC')) ids.push('steam', 'epic', 'nuuvem');
  if (plataformas.includes('PS')) ids.push('psn');
  if (plataformas.includes('XB')) ids.push('xbox');
  if (plataformas.includes('SW')) ids.push('eshop');
  if (plataformas.some((p) => p !== 'PC')) ids.push('amazon', 'mercadolivre');
  return ids;
}

/** Link que abre a busca do jogo no site da loja. */
export function linkDeBusca(lojaId, termo) {
  const loja = LOJAS[lojaId];
  if (!loja) return '#';
  return loja.busca.replace('%s', encodeURIComponent(termo));
}
