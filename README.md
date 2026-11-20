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
| 2 | Buscador de jogos · Gráfico de histórico de preço · Selo de gift card | ✅ pronta |
| 3 | Assinatura: descontos diários · Assinatura: cupons exclusivos | ✅ pronta (simulada no MVP) |
| 4 | Cashback na primeira compra · Notificações de promoções | ✅ pronta |

## Como os preços ficam atualizados (o robô)

O arquivo [`robo/atualizar-precos.mjs`](robo/atualizar-precos.mjs) roda **todo dia às 06:00** (horário de Brasília)
no GitHub Actions ([`.github/workflows/robo-de-precos.yml`](.github/workflows/robo-de-precos.yml)):

1. lê a lista de jogos em [`dados/catalogo.json`](dados/catalogo.json);
2. descobre mais jogos na Steam: **mais vendidos, lançamentos e promoções do dia** (até 60; cada um fica no app por 30 dias);
3. consulta o preço de cada jogo na **Steam, em reais** (API pública da loja, região Brasil);
4. salva em `dados/precos.json` e acrescenta o dia em `dados/historico.json` (base do gráfico de histórico).

Se a Steam não responder, o robô mantém o último preço salvo. Para rodar na hora:
aba **Actions → Robô de preços → Run workflow**.

Lojas sem API aberta (PlayStation Store, Xbox, eShop, Amazon, Mercado Livre e outras de PC) aparecem com o botão
**Ver preço**, que abre a busca do jogo no site oficial. As próximas fontes planejadas são o IsThereAnyDeal
(lojas de PC e histórico) e a API do Mercado Livre (consoles).

## Como atualizar o preço dos gift cards (Selo de gift card)

Abra [`dados/giftcards.json`](dados/giftcards.json), confira o preço do cartão no site da revenda (link em `url`),
troque o `preco` e coloque a data em `conferidoEm` (ex.: `"2026-11-25"`). O app mostra o selo quando comprar o
gift card e usar o crédito na loja oficial deixa o jogo pelo menos R$ 5 mais barato.

## Assinatura XP+ (Onda 3)

Mesmas regras do `AssinaturaService` do protótipo Java: plano único de **R$ 9,90/mês**, **3 ofertas do dia** com
+5% de desconto (sorteadas pela data, iguais para todos e trocadas à meia-noite) e **cupons exclusivos** por loja.
Preço para assinante = preço da loja × (1 − 5% se for oferta do dia) × (1 − cupom da loja).

No MVP **nada é cobrado** e os descontos e cupons aparecem como **simulados**, porque as parcerias com as lojas ainda
não existem. Cada assinatura é registrada como evento (`assinou-xp`) para a métrica do Canvas.

Os cupons ficam em [`dados/cupons.json`](dados/cupons.json). Quando houver um cupom real, troque o código e mude
`exemplo` para `false`.

## Notificações de promoções e cashback (Onda 4)

**Alertas de preço:** no jogo, toque em **🔔 Avisar quando baixar** (qualquer queda ou um preço-alvo). Sem servidor,
o app confere os preços do robô sempre que é aberto ou volta do segundo plano e, se baixou, mostra uma
**notificação do sistema**. Com o app instalado no Android, o Chrome também confere algumas vezes por dia em segundo
plano (*Periodic Background Sync*; o navegador decide a frequência). A tela **Alertas** (sino no início ou na Conta)
tem o botão **Testar notificação**, útil na apresentação.

**Cashback (XP+):** 10% da primeira compra feita por um link do app, até R$ 30 (regra do protótipo Java). Como a loja
não avisa o app sobre a compra, ao voltar da loja o app pergunta **"Você comprou?"**. Saldo simulado no MVP.

Contas, assinatura, alertas e cashback ficam salvos **no aparelho** (não há servidor), então cada celular tem os seus.

## Como adicionar um jogo

Edite `dados/catalogo.json`, copie um bloco e troque os dados. O `steamAppId` é o número do link da Steam
(`store.steampowered.com/app/NÚMERO`). Ao salvar, o robô roda sozinho e busca o preço.

## Estrutura

```
index.html, css/, js/       o app (HTML, CSS e JavaScript, sem servidor)
  js/auth.js                login e cadastro (senha guardada como SHA-256 + salt, no próprio aparelho)
  js/dados.js               junta catálogo + preços do robô; busca, selo de gift card e veredito
  js/grafico.js             gráfico de histórico de preço (SVG interativo)
  js/assinatura.js          XP+: ofertas do dia, cupons, preço para assinante e cashback
  js/alertas.js             alertas de preço e notificações
  js/lojas.js               lojas e links de busca
  js/metricas.js            eventos do piloto (cliques nas lojas, cadastros)
manifest.webmanifest, sw.js deixam o app instalável e funcionando sem internet
dados/                      catálogo e preços salvos pelo robô
robo/                       o robô de preços
```

Os dados de jogos, lojas e regras vieram do protótipo em Java do grupo (`BancoDeDados`, `ComparadorService`,
`AutenticacaoService`). Capas e preços são da loja Steam; o app não tem relação oficial com as lojas.
