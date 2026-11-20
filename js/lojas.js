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
  mercadolivre: { nome: 'Mercado Livre',     tipo: 'Console', busca: 'https://lista.mercadolivre.com.br/%s' }
};

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
