# XP Barato · MVP

App de celular (PWA) que compara o preço dos jogos entre as lojas e leva o usuário direto para a promoção.
Trabalho de APS · protótipo acadêmico.

**Abrir o app:** https://naveets.github.io/XPBarato/
No Chrome do Android, toque em **Instalar app** (ou no menu ⋮ → *Instalar app*) para ele ir para a tela inicial.

Conta de demonstração: `demo@xpbarato.com` / `123456`

## O que o MVP entrega (Sequenciador)

| Onda | Funcionalidades | Situação |
|---|---|---|
| 1 | Tela de login · Links para as promoções · Comparativo entre lojas | ✅ pronta |
| 2 | Buscador de jogos · Gráfico de histórico de preço · Selo de gift card | em breve |
| 3 | Assinatura: descontos diários · Assinatura: cupons exclusivos | em breve |
| 4 | Cashback na primeira compra · Notificações de promoções | em breve |

## Como os preços ficam atualizados (o robô)

O arquivo [`robo/atualizar-precos.mjs`](robo/atualizar-precos.mjs) roda **todo dia às 06:00** (horário de Brasília)
no GitHub Actions ([`.github/workflows/robo-de-precos.yml`](.github/workflows/robo-de-precos.yml)):

1. lê a lista de jogos em [`dados/catalogo.json`](dados/catalogo.json);
2. consulta o preço de cada jogo na **Steam, em reais** (API pública da loja, região Brasil);
3. busca as **promoções do dia** da Steam;
4. salva em `dados/precos.json` e acrescenta o dia em `dados/historico.json` (base do gráfico da Onda 2).

Se a Steam não responder, o robô mantém o último preço salvo. Para rodar na hora:
aba **Actions → Robô de preços → Run workflow**.

Lojas sem API aberta (PlayStation Store, Xbox, eShop, Amazon, Mercado Livre e outras de PC) aparecem com o botão
**Ver preço**, que abre a busca do jogo no site oficial. As próximas fontes planejadas são o IsThereAnyDeal
(lojas de PC e histórico) e a API do Mercado Livre (consoles).

## Como adicionar um jogo

Edite `dados/catalogo.json`, copie um bloco e troque os dados. O `steamAppId` é o número do link da Steam
(`store.steampowered.com/app/NÚMERO`). Ao salvar, o robô roda sozinho e busca o preço.

## Estrutura

```
index.html, css/, js/       o app (HTML, CSS e JavaScript, sem servidor)
  js/auth.js                login e cadastro (senha guardada como SHA-256 + salt, no próprio aparelho)
  js/dados.js               junta catálogo + preços do robô
  js/lojas.js               lojas e links de busca
  js/metricas.js            eventos do piloto (cliques nas lojas, cadastros)
manifest.webmanifest, sw.js deixam o app instalável e funcionando sem internet
dados/                      catálogo e preços salvos pelo robô
robo/                       o robô de preços
```

Os dados de jogos, lojas e regras vieram do protótipo em Java do grupo (`BancoDeDados`, `ComparadorService`,
`AutenticacaoService`). Capas e preços são da loja Steam; o app não tem relação oficial com as lojas.
