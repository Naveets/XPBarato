// Métricas do piloto (Canvas MVP, bloco 6): buscas, cliques nos links e assinaturas.
// Por enquanto só registra no console. Quando o grupo criar a conta no contador de
// visitas (ex.: GoatCounter), é só enviar o evento aqui que todos os cliques passam a contar.

export function registrarEvento(nome, detalhes = {}) {
  try {
    console.debug('[métrica]', nome, detalhes);
    if (window.goatcounter?.count) {
      window.goatcounter.count({ path: `evento/${nome}`, title: detalhes.titulo ?? nome, event: true });
    }
  } catch {
    // métricas nunca podem quebrar o app
  }
}
