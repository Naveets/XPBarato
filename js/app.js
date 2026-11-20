// XP Barato · MVP (PWA)
// Onda 1: tela de login, comparativo entre lojas e links para as promoções.
// Onda 2: buscador de jogos, gráfico de histórico de preço e selo de gift card.

import * as auth from './auth.js';
import {
  carregarDados, carregarHistorico, encontrarJogo, buscarJogos, serieMenorPreco, recortar, estatisticas, veredito,
  DIAS_MINIMOS_VEREDITO, formatarPreco, formatarDiaCurto, quando, tempoRestante
} from './dados.js';
import { graficoDePreco, ativarGrafico } from './grafico.js';
import { LOJAS, PLATAFORMAS, linkDeBusca, nomeDaLoja } from './lojas.js';
import { registrarEvento } from './metricas.js';
import * as xp from './assinatura.js';
import * as alertas from './alertas.js';

const app = document.getElementById('app');
const barra = document.getElementById('barra');
const aviso = document.getElementById('aviso');
let pedidoDeInstalacao = null;
const estadoBusca = { termo: '', plataforma: null, ordem: 'relevancia' };
const LOJAS_VISIVEIS = 5; // no comparativo, as demais lojas ficam em "Ver mais"

// ------------------------------------------------------------------ utilidades

const esc = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function mostrarAviso(texto) {
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(mostrarAviso.timer);
  mostrarAviso.timer = setTimeout(() => (aviso.hidden = true), 3200);
}

function iniciais(nome) {
  return nome.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function corDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

/** Capa do jogo. Se a imagem não carregar (ou não existir), mostra as iniciais. */
function capa(jogo, classe = '') {
  const img = jogo.capa
    ? `<img src="${esc(jogo.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : '';
  return `<div class="capa ${classe}" style="--h:${corDoNome(jogo.nome)}"><span>${esc(iniciais(jogo.nome))}</span>${img}</div>`;
}

const chipsPlataforma = (plataformas) =>
  plataformas.map((p) => `<span class="chip">${esc(PLATAFORMAS[p] ?? p)}</span>`).join('');

const seloPequeno = (jogo) => (jogo.selo ? `<span class="selo-gift" title="Sai mais barato com gift card">🎁 Gift card</span>` : '');

function precoResumo(jogo) {
  const o = jogo.melhorOferta;
  if (!o) return `<div class="preco-resumo sem-preco">Ver preços nas lojas</div>`;
  const desconto = o.desconto > 0 ? `<span class="desconto">-${o.desconto}%</span>` : '';
  return `<div class="preco-resumo">${desconto}<strong>${formatarPreco(o.preco)}</strong><small>na ${esc(nomeDaLoja(o))}</small></div>`;
}

const itemDaLista = (j) => `
  <li><a class="item-jogo" href="#/jogo/${esc(j.id)}">
    ${capa(j)}
    <div class="info">
      <span class="nome">${esc(j.nome)}</span>
      <span class="chips">${chipsPlataforma(j.plataformas)}${seloPequeno(j)}</span>
      ${precoResumo(j)}
    </div>
  </a></li>`;

// ------------------------------------------------------------------ login

async function telaLogin({ modo = 'entrar' } = {}) {
  barra.hidden = true;
  const cadastro = modo === 'cadastro';
  app.innerHTML = `
    <section class="login">
      <div class="marca">
        <img src="icons/icon-192.png" alt="" width="72" height="72">
        <h1>XP <span>Barato</span></h1>
        <p>O menor preço do seu jogo, sem abrir loja por loja.</p>
      </div>
      <div class="abas" role="tablist">
        <button role="tab" aria-selected="${!cadastro}" data-modo="entrar">Entrar</button>
        <button role="tab" aria-selected="${cadastro}" data-modo="cadastro">Criar conta</button>
      </div>
      <form class="formulario" novalidate>
        ${cadastro ? `<label>Nome<input name="nome" autocomplete="name" required></label>` : ''}
        <label>E-mail<input name="email" type="email" autocomplete="email" inputmode="email" required></label>
        <label>Senha<input name="senha" type="password" autocomplete="${cadastro ? 'new-password' : 'current-password'}" required></label>
        ${cadastro ? `<label>Confirmar senha<input name="confirmacao" type="password" autocomplete="new-password" required></label>` : ''}
        <p class="erro" role="alert" hidden></p>
        <button class="botao principal" type="submit">${cadastro ? 'Criar conta' : 'Entrar'}</button>
        ${cadastro ? '' : `<button class="botao secundario" type="button" data-demo>Entrar com a conta demo</button>`}
      </form>
      <p class="rodape-login">Protótipo acadêmico · MVP do trabalho de APS</p>
    </section>`;

  app.querySelectorAll('[data-modo]').forEach((b) =>
    b.addEventListener('click', () => telaLogin({ modo: b.dataset.modo })));

  const form = app.querySelector('form');
  const erro = form.querySelector('.erro');
  const enviar = async (acao) => {
    erro.hidden = true;
    form.querySelector('[type=submit]').disabled = true;
    try {
      const usuario = await acao();
      registrarEvento(cadastro ? 'cadastro' : 'login');
      alertas.sincronizar();
      mostrarAviso(`Bem-vindo, ${usuario.nome.split(' ')[0]}!`);
      location.hash = '#/inicio';
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
    } finally {
      form.querySelector('[type=submit]').disabled = false;
    }
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    enviar(() => cadastro
      ? auth.cadastrar(f.get('nome'), f.get('email'), f.get('senha'), f.get('confirmacao'))
      : auth.entrar(f.get('email'), f.get('senha')));
  });

  form.querySelector('[data-demo]')?.addEventListener('click', () => {
    form.email.value = auth.EMAIL_DEMO;
    form.senha.value = auth.SENHA_DEMO;
    enviar(() => auth.entrar(auth.EMAIL_DEMO, auth.SENHA_DEMO));
  });
}

// ------------------------------------------------------------------ início

async function telaInicio() {
  const usuario = auth.usuarioAtual();
  const dados = await carregarDados();
  const jogos = [...dados.jogos].sort((a, b) =>
    (b.melhorOferta?.desconto ?? -1) - (a.melhorOferta?.desconto ?? -1) || a.nome.localeCompare(b.nome));
  const maisVendidos = dados.descobertos.filter((j) => j.origem.includes('mais-vendidos')).slice(0, 10);

  const status = dados.exemplo
    ? `<div class="status alerta">Dados de exemplo: o robô de preços ainda não rodou.</div>`
    : `<div class="status"><span class="ponto" aria-hidden="true"></span>Preços atualizados ${esc(quando(dados.atualizadoEm))}</div>`;

  const instalar = pedidoDeInstalacao && !estaInstalado()
    ? `<button class="cartao-instalar" data-instalar>
         <img src="icons/icon-192.png" alt="" width="40" height="40">
         <span><strong>Instale o XP Barato</strong><small>Fica na tela inicial e abre como app.</small></span>
         <span class="seta" aria-hidden="true">›</span>
       </button>`
    : '';

  const cartaoVitrine = (p) => `
    <a class="cartao-promo" href="#/jogo/${esc(p.id)}">
      ${capa(p, 'larga')}
      <span class="nome">${esc(p.nome)}</span>
      <span class="linha-preco">${p.melhorOferta.desconto > 0 ? `<span class="desconto">-${p.melhorOferta.desconto}%</span>` : ''}<strong>${formatarPreco(p.melhorOferta.preco)}</strong></span>
      ${p.terminaEm ? `<small>${esc(tempoRestante(p.terminaEm))}</small>` : ''}
    </a>`;

  const vitrine = (titulo, lista) => (lista.length
    ? `<h2 class="titulo-secao">${titulo}</h2><div class="vitrine">${lista.map(cartaoVitrine).join('')}</div>`
    : '');

  app.innerHTML = `
    <header class="topo com-acao">
      <div>
        <p class="ola">Olá, ${esc(usuario.nome.split(' ')[0])}</p>
        <h1>Qual jogo você quer pagar menos?</h1>
      </div>
      <a class="botao-sino" href="#/alertas" aria-label="Alertas de preço">🔔${alertas.listar().length ? `<span class="contador">${alertas.listar().length}</span>` : ''}</a>
    </header>
    <a class="campo-busca falso" href="#/buscar"><span aria-hidden="true">⌕</span>Buscar</a>
    ${status}
    ${instalar}
    ${cartaoXpInicio(dados)}
    ${vitrine('Promoções do dia na Steam', dados.promocoes)}
    ${vitrine('Mais vendidos na Steam', maisVendidos)}
    <h2 class="titulo-secao">Jogos monitorados</h2>
    <ul class="lista-jogos">${jogos.map(itemDaLista).join('')}</ul>`;

  app.querySelector('[data-instalar]')?.addEventListener('click', instalarApp);
}

// ------------------------------------------------------------------ buscador (Onda 2)

async function telaBuscar() {
  const dados = await carregarDados();
  app.innerHTML = `
    <header class="topo"><h1>Buscar jogos</h1></header>
    <form class="busca" role="search">
      <label class="campo-busca">
        <span aria-hidden="true">⌕</span>
        <input type="search" name="termo" placeholder="Nome do jogo ou gênero" autocomplete="off" enterkeyhint="search" value="${esc(estadoBusca.termo)}">
      </label>
      <div class="filtros" role="group" aria-label="Plataforma">
        <button type="button" data-plataforma="" aria-pressed="${!estadoBusca.plataforma}">Todas</button>
        ${Object.entries(PLATAFORMAS).map(([id, nome]) =>
          `<button type="button" data-plataforma="${id}" aria-pressed="${estadoBusca.plataforma === id}">${nome}</button>`).join('')}
      </div>
      <label class="ordem">Ordenar por
        <select name="ordem">
          <option value="relevancia">Relevância</option>
          <option value="menor-preco">Menor preço</option>
          <option value="desconto">Maior desconto</option>
        </select>
      </label>
    </form>
    <p class="contagem" aria-live="polite"></p>
    <ul class="lista-jogos resultados"></ul>`;

  const form = app.querySelector('form');
  const campo = form.termo;
  const lista = app.querySelector('.resultados');
  const contagem = app.querySelector('.contagem');
  form.ordem.value = estadoBusca.ordem;

  const atualizar = () => {
    const achados = buscarJogos(dados.todos, estadoBusca.termo, estadoBusca);
    contagem.textContent = estadoBusca.termo
      ? `${achados.length} resultado${achados.length === 1 ? '' : 's'} para "${estadoBusca.termo}"`
      : `${achados.length} jogos`;
    lista.innerHTML = achados.length
      ? achados.map(itemDaLista).join('')
      : `<li class="vazio-busca">Nenhum jogo encontrado.<br><small>O XP Barato monitora os jogos do catálogo e os destaques da Steam do dia.</small></li>`;
  };

  let espera;
  campo.addEventListener('input', () => {
    estadoBusca.termo = campo.value.trim();
    atualizar();
    clearTimeout(espera);
    if (estadoBusca.termo.length >= 3) espera = setTimeout(() => registrarEvento('busca', { titulo: estadoBusca.termo }), 1200);
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    campo.blur();
  });
  form.ordem.addEventListener('change', () => {
    estadoBusca.ordem = form.ordem.value;
    atualizar();
  });
  form.querySelectorAll('[data-plataforma]').forEach((b) => b.addEventListener('click', () => {
    estadoBusca.plataforma = b.dataset.plataforma || null;
    form.querySelectorAll('[data-plataforma]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    atualizar();
  }));

  atualizar();
  if (!estadoBusca.termo) campo.focus();
}

// ------------------------------------------------------------------ detalhe do jogo

async function telaJogo(id) {
  const dados = await carregarDados();
  const jogo = encontrarJogo(dados, id);
  if (!jogo) {
    app.innerHTML = `<div class="vazio"><p>Jogo não encontrado.</p><a class="botao principal" href="#/inicio">Voltar ao início</a></div>`;
    return;
  }
  registrarEvento('ver-jogo', { titulo: jogo.nome });
  const assinante = xp.ehAssinante();
  const idsDoDia = new Set(xp.ofertasDoDia(dados).map((j) => j.id));
  const ofertaDoDia = idsDoDia.has(jogo.id);
  const melhorXp = xp.melhorPrecoXp(dados, jogo, idsDoDia);

  const comPreco = jogo.ofertas;
  const lojasComPreco = new Set(comPreco.map((o) => o.loja));
  const semPreco = jogo.lojas.filter((l) => !lojasComPreco.has(l));
  const menor = jogo.melhorOferta?.preco;

  const linhaComPreco = (o, i) => `
    <li class="oferta ${i === 0 ? 'melhor' : ''}">
      <div class="loja">
        <strong>${esc(nomeDaLoja(o))}</strong>
        ${i === 0 ? '<span class="selo-menor">Menor preço</span>' : `<small>+ ${formatarPreco(o.preco - menor)}</small>`}
      </div>
      <div class="valores">
        ${o.desconto > 0 ? `<s>${formatarPreco(o.precoOriginal)}</s>` : ''}
        <span>${o.desconto > 0 ? `<em class="desconto">-${o.desconto}%</em>` : ''}<strong>${formatarPreco(o.preco)}</strong></span>
      </div>
      <a class="botao ir" href="${esc(o.url || linkDeBusca(o.loja, jogo.nome))}" target="_blank" rel="noopener" data-loja="${esc(o.loja)}">Ir à loja</a>
      ${assinante ? linhaXp(xp.precoXp(dados, jogo, o, idsDoDia)) : ''}
    </li>`;

  const linhaSemPreco = (lojaId) => `
    <li class="oferta sem-preco">
      <div class="loja">
        <strong>${esc(LOJAS[lojaId].nome)}</strong>
        <small>Preço ainda não monitorado</small>
      </div>
      <a class="botao ir secundario" href="${esc(linkDeBusca(lojaId, jogo.nome))}" target="_blank" rel="noopener" data-loja="${esc(lojaId)}">Ver preço</a>
    </li>`;

  const s = jogo.selo;
  const blocoSelo = s ? `
    <section class="cartao-selo">
      <p class="selo-titulo">🎁 Com gift card sai mais barato</p>
      <p>Comprando <strong>${s.quantidade > 1 ? `${s.quantidade} × ` : ''}${esc(s.cartao.nome)}</strong> por
        ${formatarPreco(s.cartao.preco)}${s.quantidade > 1 ? ' cada' : ''} na ${esc(s.cartao.revenda)} e usando o crédito na ${esc(nomeDaLoja(s.oferta))},
        o jogo sai por <strong class="verde">${formatarPreco(s.precoEfetivo)}</strong>
        (economia de ${formatarPreco(s.economia)}).</p>
      <a class="botao ir secundario" href="${esc(s.cartao.url)}" target="_blank" rel="noopener" data-loja="giftcard-${esc(s.cartao.revenda)}">Ver gift card</a>
      <small>${s.cartao.conferidoEm
        ? `Preço do gift card conferido em ${esc(formatarDiaCurto(s.cartao.conferidoEm))}.`
        : 'Valor do gift card de exemplo: o grupo ainda não conferiu na revenda.'}
        ${s.quantidade > 1 || s.oferta.preco % s.cartao.valorFace !== 0 ? ' O crédito que sobrar fica na sua conta da loja.' : ''}</small>
    </section>` : '';

  app.innerHTML = `
    <div class="cabecalho-jogo">
      <a class="voltar" href="#/${jogo.doCatalogo ? 'inicio' : 'buscar'}" aria-label="Voltar" data-voltar>‹</a>
      ${capa(jogo, 'destaque')}
    </div>
    <section class="detalhe">
      <h1>${esc(jogo.nome)}</h1>
      <p class="chips">${chipsPlataforma(jogo.plataformas)}${jogo.genero ? `<span class="chip suave">${esc(jogo.genero)}</span>` : ''}</p>
      ${jogo.melhorOferta ? `<div id="alerta-jogo"></div>` : ''}
      ${jogo.descricao ? `<p class="descricao">${esc(jogo.descricao)}</p>` : ''}
      ${jogo.lancamento ? `<p class="meta">Lançamento: ${esc(jogo.lancamento)}</p>` : ''}
      ${jogo.terminaEm ? `<p class="meta destaque-texto">Promoção da Steam ${esc(tempoRestante(jogo.terminaEm))}</p>` : ''}

      <h2 class="titulo-secao">Comparativo entre lojas</h2>
      ${comPreco.length
        ? `<ul class="ofertas">${comPreco.slice(0, LOJAS_VISIVEIS).map(linhaComPreco).join('')}</ul>
           ${comPreco.length > LOJAS_VISIVEIS ? `
             <details class="mais-lojas">
               <summary>Ver mais ${comPreco.length - LOJAS_VISIVEIS} loja${comPreco.length - LOJAS_VISIVEIS > 1 ? 's' : ''}</summary>
               <ul class="ofertas">${comPreco.slice(LOJAS_VISIVEIS).map((o, i) => linhaComPreco(o, i + LOJAS_VISIVEIS)).join('')}</ul>
             </details>` : ''}`
        : `<p class="meta">Ainda não monitoramos o preço deste jogo. Confira direto nas lojas:</p>`}
      ${blocoXp(jogo, { assinante, ofertaDoDia, melhorXp })}
      ${xp.cashbackDisponivel() && jogo.melhorOferta ? `
        <p class="dica-cashback">💸 Sua primeira compra por um link do app dá <strong>10% de cashback</strong> (até R$ 30).
          Comprando na ${esc(nomeDaLoja((melhorXp?.oferta) ?? jogo.melhorOferta))}, são <strong>${formatarPreco(xp.calcularCashback((melhorXp ?? jogo.melhorOferta).preco))}</strong>. Simulado no MVP.</p>` : ''}
      ${blocoSelo}
      <div id="historico"></div>
      ${semPreco.length ? `
        <h3 class="subtitulo">${comPreco.length ? 'Confira também' : ''}</h3>
        <ul class="ofertas">${semPreco.map(linhaSemPreco).join('')}</ul>` : ''}
      <p class="nota">${comPreco.length && !dados.exemplo
        ? `Preços consultados pelo robô ${esc(quando(dados.atualizadoEm))} (${esc(dados.fontes.join(' e '))}). `
        : ''}O botão "Ver preço" abre a busca do jogo no site oficial da loja.</p>
    </section>`;

  app.querySelector('[data-voltar]').addEventListener('click', (ev) => {
    if (history.length > 1) {
      ev.preventDefault();
      history.back();
    }
  });
  app.querySelectorAll('a.ir').forEach((a) =>
    a.addEventListener('click', () => {
      registrarEvento('clique-loja', { titulo: `${jogo.nome} → ${a.dataset.loja}` });
      const oferta = jogo.ofertas.find((o) => o.loja === a.dataset.loja);
      if (oferta) xp.registrarIdaALoja(jogo, oferta, xp.precoXp(dados, jogo, oferta, idsDoDia)?.preco ?? oferta.preco);
    }));
  if (jogo.melhorOferta) mostrarBotaoAlerta(jogo);

  if (comPreco.length) mostrarHistorico(jogo);
}

const PERIODOS = [
  { dias: 30, nome: '30 dias' },
  { dias: 90, nome: '90 dias' },
  { dias: null, nome: 'Tudo' }
];
let periodoEscolhido = 90;

const porcento = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const nomeLoja = (id) => nomeDaLoja({ loja: id });

async function mostrarHistorico(jogo) {
  const alvo = document.getElementById('historico');
  const historico = await carregarHistorico();
  if (!alvo.isConnected) return;
  const serieCompleta = serieMenorPreco(historico.jogos?.[jogo.id]);
  if (!serieCompleta.length) return;

  // só oferece os períodos que fazem sentido para o tamanho do histórico
  const periodos = PERIODOS.filter((p, i) => i === 0 || !p.dias || serieCompleta.length > PERIODOS[i - 1].dias)
    .filter((p) => p.dias || serieCompleta.length > 100);

  const desenhar = () => {
    const serie = recortar(serieCompleta, periodoEscolhido);
    const e = estatisticas(serie);
    const v = veredito(estatisticas(serieCompleta)); // o veredito usa todo o histórico
    const faltam = DIAS_MINIMOS_VEREDITO - serieCompleta.length;
    const abaixo = e.vsMedia <= -0.005;

    alvo.innerHTML = `
      <h2 class="titulo-secao">Histórico de preço</h2>
      <section class="cartao-historico">
        ${v
          ? `<p class="veredito ${v.tipo}"><strong>${v.titulo}</strong> · ${v.texto}</p>`
          : `<p class="veredito formando"><strong>Histórico em formação</strong> · o robô registra um preço por dia desde ${esc(formatarDiaCurto(serieCompleta[0].data))}.
               ${faltam > 0 ? `Em ${faltam} dia${faltam > 1 ? 's' : ''} o app já diz se é uma boa hora de comprar.` : ''}</p>`}
        ${periodos.length > 1 ? `
          <div class="periodos" role="group" aria-label="Período do gráfico">
            ${periodos.map((p) => `<button type="button" data-dias="${p.dias ?? ''}" aria-pressed="${p.dias === periodoEscolhido}">${p.nome}</button>`).join('')}
          </div>` : ''}
        ${graficoDePreco(serie, e)}
        <p class="dica-uso">Toque ou arraste no gráfico para ver o preço de cada dia.</p>
        <dl class="numeros">
          <div><dt>Hoje</dt><dd>${formatarPreco(e.atual)}</dd><small>na ${esc(nomeLoja(e.lojaAtual))}</small></div>
          <div class="destaque-min"><dt>Menor</dt><dd>${formatarPreco(e.minimo)}</dd><small>${esc(formatarDiaCurto(e.dataMinimo))} · ${esc(nomeLoja(e.lojaMinimo))}</small></div>
          <div><dt>Maior</dt><dd>${formatarPreco(e.maximo)}</dd><small>preço cheio</small></div>
          <div><dt>Média</dt><dd>${formatarPreco(e.media)}</dd><small>${e.dias} dias</small></div>
          <div><dt>Hoje × média</dt><dd class="${abaixo ? 'verde' : e.vsMedia > 0.005 ? 'vermelho' : ''}">${porcento(e.vsMedia)}</dd><small>${abaixo ? 'abaixo da média' : e.vsMedia > 0.005 ? 'acima da média' : 'na média'}</small></div>
          <div><dt>Em promoção</dt><dd>${e.diasPromocao} de ${e.dias}</dd><small>dias no período</small></div>
        </dl>
        ${e.promocoes.length ? `
          <h3 class="subtitulo">Promoções no período</h3>
          <ul class="promocoes">
            ${e.promocoes.slice(0, 6).map((p) => `
              <li>
                <span class="datas">${esc(formatarDiaCurto(p.inicio))}${p.fim !== p.inicio ? ` – ${p.emAndamento ? 'hoje' : esc(formatarDiaCurto(p.fim))}` : ''}</span>
                <span class="valor"><em class="desconto">-${p.desconto}%</em> ${formatarPreco(p.preco)}</span>
                <small>${esc(nomeLoja(p.loja))}${p.emAndamento ? ' · <b>em andamento</b>' : ''}</small>
              </li>`).join('')}
          </ul>
          ${e.promocoes.length > 6 ? `<p class="meta">e mais ${e.promocoes.length - 6} promoç${e.promocoes.length - 6 > 1 ? 'ões' : 'ão'} no período.</p>` : ''}`
          : `<p class="meta">Nenhuma promoção neste período: o preço ficou estável.</p>`}
        <p class="nota">Preço normal = maior preço do período. Promoção = pelo menos 5% abaixo dele. Lojas estrangeiras com preço convertido para reais pelo IsThereAnyDeal.</p>
      </section>`;

    ativarGrafico(alvo.querySelector('.grafico-caixa'), serie, e);
    alvo.querySelectorAll('[data-dias]').forEach((b) => b.addEventListener('click', () => {
      periodoEscolhido = b.dataset.dias ? Number(b.dataset.dias) : null;
      desenhar();
    }));
  };
  desenhar();
}

// ------------------------------------------------------------------ XP+ (Onda 3)

const AVISO_MVP = 'MVP em teste: nenhuma cobrança é feita e os descontos e cupons são simulados até o XP Barato fechar parcerias com as lojas.';

/** Texto "XP+ R$ 71,22 · cupom XP10NUUVEM" embaixo do preço, para assinantes. */
function linhaXp(info) {
  if (!info) return '';
  const motivos = [info.doDia ? 'oferta do dia' : null, info.cupom ? `cupom ${info.cupom.codigo}` : null].filter(Boolean).join(' + ');
  return `<small class="preco-xp">XP+ ${formatarPreco(info.preco)} · ${esc(motivos)}</small>`;
}

function blocoXp(jogo, { assinante, ofertaDoDia, melhorXp }) {
  if (assinante) {
    return ofertaDoDia
      ? `<section class="cartao-xp"><p class="xp-titulo"><span class="marca-xp">XP<b>+</b></span> Oferta do dia</p>
           <p>Hoje este jogo tem <strong>+5% de desconto</strong> para assinantes${melhorXp ? `: sai por <strong class="verde">${formatarPreco(melhorXp.preco)}</strong> na ${esc(nomeDaLoja(melhorXp.oferta))}` : ''}.</p>
           <small>Troca em ${esc(xp.tempoAteTrocar())}. Desconto simulado no MVP.</small></section>`
      : '';
  }
  if (!melhorXp) return '';
  return `
    <a class="cartao-xp chamada" href="#/xp">
      <p class="xp-titulo"><span class="marca-xp">XP<b>+</b></span> Com XP+ sai mais barato</p>
      <p>Assinantes pagam <strong class="verde">${formatarPreco(melhorXp.preco)}</strong> na ${esc(nomeDaLoja(melhorXp.oferta))}
        (economia de ${formatarPreco(melhorXp.economia)})${melhorXp.doDia ? ', porque hoje ele é oferta do dia' : ''}.</p>
      <span class="botao principal">Conhecer o XP+ · ${formatarPreco(xp.PRECO_MENSAL)}/mês</span>
    </a>`;
}

function cartaoXpInicio(dados) {
  const doDia = xp.ofertasDoDia(dados);
  if (!doDia.length) return '';
  const ids = new Set(doDia.map((j) => j.id));
  if (!xp.ehAssinante()) {
    return `
      <a class="cartao-xp chamada inicio" href="#/xp">
        <p class="xp-titulo"><span class="marca-xp">XP<b>+</b></span> Pague ainda menos</p>
        <p>3 ofertas por dia com +5% de desconto e cupons exclusivos por ${formatarPreco(xp.PRECO_MENSAL)}/mês.</p>
      </a>`;
  }
  return `
    <h2 class="titulo-secao"><span class="marca-xp">XP<b>+</b></span> Ofertas do dia <small class="troca">trocam em ${esc(xp.tempoAteTrocar())}</small></h2>
    <ul class="lista-jogos">${doDia.map((j) => itemOfertaDoDia(dados, j, ids)).join('')}</ul>`;
}

function itemOfertaDoDia(dados, j, ids) {
  const melhor = xp.melhorPrecoXp(dados, j, ids);
  return `
    <li><a class="item-jogo xp" href="#/jogo/${esc(j.id)}">
      ${capa(j)}
      <div class="info">
        <span class="nome">${esc(j.nome)}</span>
        <div class="preco-resumo"><s>${formatarPreco(j.melhorOferta.preco)}</s>
          <strong class="verde">${formatarPreco(melhor?.preco ?? j.melhorOferta.preco)}</strong>
          <small>na ${esc(nomeDaLoja(melhor?.oferta ?? j.melhorOferta))}</small></div>
      </div>
    </a></li>`;
}

async function telaXp() {
  const dados = await carregarDados();
  const usuario = auth.usuarioAtual();
  const assinante = xp.ehAssinante(usuario);
  const doDia = xp.ofertasDoDia(dados);
  const ids = new Set(doDia.map((j) => j.id));
  const cupons = xp.cuponsValidos(dados);

  const listaCupons = cupons.map((c) => `
    <li class="cupom">
      <div>
        <strong>${esc(c.descricao)}</strong>
        <small>${esc(LOJAS[c.loja]?.nome ?? c.loja)} · válido até ${esc(formatarDiaCurto(c.validade))}${c.exemplo ? ' · <em>simulado</em>' : ''}</small>
      </div>
      ${assinante
        ? `<button class="codigo" data-copiar="${esc(c.codigo)}" aria-label="Copiar o código ${esc(c.codigo)}">${esc(c.codigo)} <span aria-hidden="true">⧉</span></button>`
        : `<span class="codigo bloqueado" aria-label="Disponível para assinantes">•••••• 🔒</span>`}
    </li>`).join('');

  app.innerHTML = `
    <header class="topo xp-topo">
      <p class="ola">${assinante ? `Assinante desde ${esc(formatarDiaCurto(usuario.assinanteDesde))}` : 'Assinatura'}</p>
      <h1><span class="marca-xp grande">XP<b>+</b></span></h1>
      <p class="meta">Para quem quer pagar o mínimo possível nos jogos.</p>
    </header>
    ${assinante ? '' : `
      <section class="cartao-plano">
        <p class="preco-plano"><strong>${formatarPreco(xp.PRECO_MENSAL)}</strong> por mês</p>
        <ul class="beneficios">
          <li><span aria-hidden="true">🎮</span><span>3 ofertas por dia com <strong>+5% de desconto</strong></span></li>
          <li><span aria-hidden="true">🏷️</span><span><strong>Cupons exclusivos</strong> nas lojas parceiras</span></li>
          <li><span aria-hidden="true">💸</span><span><strong>10% de cashback</strong> na primeira compra (até R$ 30)</span></li>
        </ul>
        <button class="botao principal largo" data-assinar>Assinar o XP+</button>
        <p class="aviso-mvp">${AVISO_MVP}</p>
      </section>`}
    ${assinante ? cartaoCashback(usuario) : ''}
    <h2 class="titulo-secao">Ofertas do dia <small class="troca">trocam em ${esc(xp.tempoAteTrocar())}</small></h2>
    <ul class="lista-jogos">${doDia.map((j) => itemOfertaDoDia(dados, j, ids)).join('')}</ul>
    <h2 class="titulo-secao">Cupons exclusivos</h2>
    <ul class="cupons">${listaCupons || '<li class="meta">Nenhum cupom válido no momento.</li>'}</ul>
    ${assinante ? `
      <p class="aviso-mvp">${AVISO_MVP}</p>
      <button class="botao secundario largo" data-cancelar>Cancelar assinatura</button>` : ''}`;

  app.querySelector('[data-assinar]')?.addEventListener('click', () => {
    xp.assinar();
    mostrarAviso('Bem-vindo ao XP+! 🎉');
    telaXp();
  });
  app.querySelector('[data-cancelar]')?.addEventListener('click', () => {
    if (!confirmarCancelamento()) return;
    xp.cancelar();
    mostrarAviso('Assinatura cancelada.');
    telaXp();
  });
  app.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copiar);
      mostrarAviso(`Código ${b.dataset.copiar} copiado`);
    } catch {
      mostrarAviso(`Código: ${b.dataset.copiar}`);
    }
    registrarEvento('copiou-cupom', { titulo: b.dataset.copiar });
  }));
}

/** Segundo toque confirma o cancelamento (sem caixa de diálogo do navegador). */
function confirmarCancelamento() {
  const botao = app.querySelector('[data-cancelar]');
  if (botao.dataset.confirmar) return true;
  botao.dataset.confirmar = '1';
  botao.textContent = 'Toque de novo para confirmar';
  setTimeout(() => {
    if (botao.isConnected) {
      delete botao.dataset.confirmar;
      botao.textContent = 'Cancelar assinatura';
    }
  }, 4000);
  return false;
}

// ------------------------------------------------------------------ cashback (Onda 4)

function cartaoCashback(usuario) {
  const saldo = usuario.saldoCashback ?? 0;
  const ultimo = usuario.cashbackHistorico?.at(-1);
  return `
    <section class="cartao-cashback">
      <span class="ico-cashback" aria-hidden="true">💸</span>
      <div>${usuario.cashbackUtilizado
        ? `<strong>Saldo de cashback: ${formatarPreco(saldo)}</strong>
           <small>${ultimo ? `${esc(ultimo.jogo)} · ${esc(ultimo.loja)} · ${esc(formatarDiaCurto(ultimo.data))}` : ''} · simulado no MVP</small>`
        : `<strong>Cashback disponível</strong>
           <small>10% da sua primeira compra por um link do app, até R$ 30 (simulado no MVP).</small>`}</div>
    </section>`;
}

/** Ao voltar da loja: "Você comprou?" para liberar o cashback da primeira compra. */
function perguntarCompra() {
  const p = xp.compraPendente();
  const existente = document.getElementById('folha');
  if (!p || existente) return;
  const folha = document.createElement('div');
  folha.id = 'folha';
  folha.className = 'folha';
  folha.setAttribute('role', 'dialog');
  folha.setAttribute('aria-label', 'Confirmar compra');
  folha.innerHTML = `
    <div class="folha-conteudo">
      <p class="folha-titulo">💸 Você comprou ${esc(p.nome)}?</p>
      <p>Se você comprou na <strong>${esc(nomeDaLoja(p))}</strong> por ${formatarPreco(p.preco)}, confirme para ganhar
         <strong class="verde">${formatarPreco(p.cashback)}</strong> de cashback da primeira compra XP+.</p>
      <small>No MVP a loja não avisa o app sobre a compra, por isso perguntamos. Cashback simulado.</small>
      <div class="folha-botoes">
        <button class="botao secundario" data-nao>Não comprei</button>
        <button class="botao principal" data-sim>Sim, comprei</button>
      </div>
    </div>`;
  document.body.appendChild(folha);
  folha.querySelector('[data-nao]').addEventListener('click', () => {
    xp.descartarCompra();
    folha.remove();
  });
  folha.querySelector('[data-sim]').addEventListener('click', () => {
    const valor = xp.confirmarCompra();
    folha.remove();
    if (valor) mostrarAviso(`Você ganhou ${formatarPreco(valor)} de cashback! 🎉`);
    if (['xp', 'conta'].includes(location.hash.split('/')[1])) rotear();
  });
}

// ------------------------------------------------------------------ alertas de preço (Onda 4)

let ultimaVerificacao = 0;

/** Depois de abrir qualquer tela: confere alertas (no máximo 1x por minuto) e compra pendente. */
async function aposAbrir() {
  perguntarCompra();
  if (Date.now() - ultimaVerificacao < 60000) return;
  ultimaVerificacao = Date.now();
  try {
    const disparados = await alertas.verificar(await carregarDados());
    if (disparados.length) {
      const d = disparados[0];
      mostrarAviso(`🔔 ${d.jogo.nome} baixou para ${formatarPreco(d.jogo.melhorOferta.preco)}`);
    }
  } catch {
    // alertas nunca podem quebrar o app
  }
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !auth.usuarioAtual()) return;
  ultimaVerificacao = 0;
  await carregarDados({ forcar: true }).catch(() => {});
  aposAbrir();
});

function mostrarBotaoAlerta(jogo) {
  const alvo = document.getElementById('alerta-jogo');
  if (!alvo) return;
  const atual = alertas.seguindo(jogo.id);
  if (atual) {
    alvo.innerHTML = `
      <div class="alerta-ativo">
        <span>🔔 <strong>Alerta ativo</strong> · ${atual.alvo ? `quando chegar a ${formatarPreco(atual.alvo)}` : 'qualquer queda de preço'}</span>
        <button class="link" data-remover>Remover</button>
      </div>`;
    alvo.querySelector('[data-remover]').addEventListener('click', async () => {
      await alertas.deixarDeSeguir(jogo.id);
      mostrarAviso('Alerta removido');
      mostrarBotaoAlerta(jogo);
    });
    return;
  }
  const sugestao = Math.floor(jogo.melhorOferta.preco * 0.8);
  alvo.innerHTML = `
    <details class="criar-alerta">
      <summary class="botao secundario">🔔 Avisar quando baixar</summary>
      <form class="painel-alerta">
        <label><input type="radio" name="tipo" value="queda" checked> Qualquer queda de preço</label>
        <label><input type="radio" name="tipo" value="alvo"> Quando chegar a
          <span class="campo-alvo">R$ <input name="alvo" type="number" inputmode="decimal" min="1" step="0.01" value="${sugestao}" aria-label="Preço-alvo em reais"></span></label>
        <button class="botao principal" type="submit">Ativar alerta</button>
        <small>${alertas.permissao() === 'denied'
          ? 'As notificações estão bloqueadas neste navegador; o aviso aparece dentro do app.'
          : 'Vamos pedir permissão para mostrar notificações no celular.'}</small>
      </form>
    </details>`;
  const form = alvo.querySelector('form');
  form.alvo.addEventListener('focus', () => (form.tipo.value = 'alvo'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const valor = form.tipo.value === 'alvo' ? Number(form.alvo.value) : null;
    if (form.tipo.value === 'alvo' && !(valor > 0)) return;
    await alertas.seguir(jogo, valor);
    const permissao = await alertas.pedirPermissao();
    mostrarAviso(permissao === 'granted' ? '🔔 Alerta ativado' : '🔔 Alerta ativado (aviso dentro do app)');
    mostrarBotaoAlerta(jogo);
  });
}

async function telaAlertas() {
  const dados = await carregarDados();
  const lista = alertas.listar();
  const permissao = alertas.permissao();
  const estado = {
    granted: '<span class="verde">ativadas</span>',
    denied: '<span class="vermelho">bloqueadas</span> (libere nas configurações do navegador)',
    default: 'ainda não ativadas',
    unsupported: 'não suportadas neste navegador'
  }[permissao];

  app.innerHTML = `
    <header class="topo"><h1>Alertas de preço</h1>
      <p class="meta">Siga um jogo e avisamos quando o preço baixar.</p></header>
    <section class="cartao-historico">
      <p>Notificações no celular: ${estado}</p>
      ${permissao === 'default' ? '<button class="botao principal" data-permitir>Ativar notificações</button>' : ''}
      ${permissao === 'granted' ? '<button class="botao secundario" data-testar>Testar notificação</button>' : ''}
      <small class="meta">O app confere os preços do robô sempre que é aberto. Com o app instalado no Android,
        o Chrome também confere algumas vezes por dia em segundo plano.</small>
    </section>
    <h2 class="titulo-secao">Jogos que você segue</h2>
    ${lista.length ? `<ul class="lista-jogos">${lista.map((a) => {
      const j = dados.todos.find((x) => x.id === a.jogoId);
      if (!j) return '';
      return `
        <li class="item-alerta">
          <a class="item-jogo" href="#/jogo/${esc(j.id)}">
            ${capa(j)}
            <div class="info">
              <span class="nome">${esc(j.nome)}</span>
              ${precoResumo(j)}
              <small class="meta">${a.alvo ? `Aviso em ${formatarPreco(a.alvo)}` : 'Aviso em qualquer queda'}${a.avisadoEm ? ` · último aviso ${esc(quando(new Date(a.avisadoEm)))}` : ''}</small>
            </div>
          </a>
          <button class="link" data-remover="${esc(j.id)}" aria-label="Parar de seguir ${esc(j.nome)}">Remover</button>
        </li>`;
    }).join('')}</ul>`
    : `<p class="vazio-busca">Você ainda não segue nenhum jogo.<br><small>Abra um jogo e toque em 🔔 Avisar quando baixar.</small></p>`}`;

  app.querySelector('[data-permitir]')?.addEventListener('click', async () => {
    await alertas.pedirPermissao();
    telaAlertas();
  });
  app.querySelector('[data-testar]')?.addEventListener('click', async () => {
    const seguido = lista.map((a) => dados.todos.find((x) => x.id === a.jogoId)).find((j) => j?.melhorOferta);
    const jogo = seguido ?? dados.promocoes[0] ?? dados.jogos.find((j) => j.melhorOferta);
    await alertas.testar(jogo);
    mostrarAviso('Notificação enviada: confira a barra do celular');
  });
  app.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', async () => {
    await alertas.deixarDeSeguir(b.dataset.remover);
    telaAlertas();
  }));
}

// ------------------------------------------------------------------ conta

function telaConta() {
  const usuario = auth.usuarioAtual();
  app.innerHTML = `
    <header class="topo"><h1>Sua conta</h1></header>
    <section class="cartao-conta">
      <div class="avatar" style="--h:${corDoNome(usuario.nome)}">${esc(iniciais(usuario.nome))}</div>
      <div><strong>${esc(usuario.nome)}</strong><small>${esc(usuario.email)}</small></div>
    </section>
    <a class="cartao-xp-conta" href="#/xp">
      <span class="marca-xp">XP<b>+</b></span>
      <span>${xp.ehAssinante(usuario)
        ? `<strong>Assinante XP+</strong><small>desde ${esc(formatarDiaCurto(usuario.assinanteDesde))}</small>`
        : `<strong>Conheça o XP+</strong><small>ofertas do dia e cupons exclusivos</small>`}</span>
      <span class="seta" aria-hidden="true">›</span>
    </a>
    ${xp.ehAssinante(usuario) ? cartaoCashback(usuario) : ''}
    <a class="cartao-xp-conta alertas" href="#/alertas">
      <span class="sino-grande" aria-hidden="true">🔔</span>
      <span><strong>Alertas de preço</strong><small>${alertas.listar().length
        ? `seguindo ${alertas.listar().length} jogo${alertas.listar().length > 1 ? 's' : ''}`
        : 'avisamos quando um jogo baixar'}</small></span>
      <span class="seta" aria-hidden="true">›</span>
    </a>
    ${pedidoDeInstalacao && !estaInstalado() ? '<button class="botao principal largo" data-instalar>Instalar o app no celular</button>' : ''}
    ${estaInstalado() ? '<p class="meta centro">App instalado neste aparelho ✔</p>' : ''}
    <button class="botao secundario largo" data-sair>Sair</button>
    <p class="rodape-login">XP Barato · MVP Onda 4<br>Trabalho de APS · protótipo acadêmico</p>`;
  app.querySelector('[data-sair]').addEventListener('click', () => {
    auth.sair();
    alertas.sincronizar(); // o segundo plano passa a não ter alertas de ninguém
    location.hash = '#/login';
  });
  app.querySelector('[data-instalar]')?.addEventListener('click', instalarApp);
}

// ------------------------------------------------------------------ navegação

async function rotear() {
  const [, rota = 'inicio', parametro] = location.hash.split('/');
  const logado = Boolean(auth.usuarioAtual());

  if (!logado && rota !== 'login') {
    location.replace('#/login');
    return;
  }
  if (logado && rota === 'login') {
    location.replace('#/inicio');
    return;
  }

  window.scrollTo(0, 0);
  barra.hidden = rota === 'login';
  const aba = rota === 'jogo' ? (barra.dataset.ultima ?? 'inicio') : rota;
  if (['inicio', 'buscar', 'xp', 'conta'].includes(rota)) barra.dataset.ultima = rota;
  barra.querySelectorAll('a').forEach((a) => a.classList.toggle('ativo', a.dataset.aba === aba));

  try {
    if (rota === 'login') await telaLogin();
    else if (rota === 'jogo') await telaJogo(decodeURIComponent(parametro ?? ''));
    else if (rota === 'buscar') await telaBuscar();
    else if (rota === 'xp') await telaXp();
    else if (rota === 'alertas') await telaAlertas();
    else if (rota === 'conta') telaConta();
    else await telaInicio();
    if (rota !== 'login') aposAbrir();
  } catch (erro) {
    console.error(erro);
    app.innerHTML = `<div class="vazio"><p>Não foi possível carregar os preços agora.</p>
      <button class="botao principal" onclick="location.reload()">Tentar de novo</button></div>`;
  }
}

// ------------------------------------------------------------------ instalação (PWA)

function estaInstalado() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

async function instalarApp() {
  if (!pedidoDeInstalacao) return;
  pedidoDeInstalacao.prompt();
  const { outcome } = await pedidoDeInstalacao.userChoice;
  registrarEvento(outcome === 'accepted' ? 'instalou-app' : 'recusou-instalar');
  pedidoDeInstalacao = null;
  rotear();
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  pedidoDeInstalacao = ev;
  if (['inicio', 'conta', ''].includes(location.hash.split('/')[1] ?? '')) rotear();
});

window.addEventListener('appinstalled', () => mostrarAviso('XP Barato instalado!'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      // App instalado costuma ficar aberto em segundo plano: ao voltar para ele, procura versão nova.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registro.update().catch(() => {});
      });
    } catch {
      // sem service worker o app funciona igual, só não fica disponível sem internet
    }
  });
}

window.addEventListener('hashchange', rotear);
await auth.garantirUsuarioDemo();
rotear();
if (alertas.permissao() === 'granted') alertas.registrarSegundoPlano();
