// XP Barato · MVP (PWA)
// Onda 1: tela de login, comparativo entre lojas e links para as promoções.

import * as auth from './auth.js';
import { carregarDados, encontrarJogo, formatarPreco, quando, tempoRestante } from './dados.js';
import { LOJAS, PLATAFORMAS, linkDeBusca } from './lojas.js';
import { registrarEvento } from './metricas.js';

const app = document.getElementById('app');
const barra = document.getElementById('barra');
const aviso = document.getElementById('aviso');
let pedidoDeInstalacao = null;

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

function precoResumo(jogo) {
  const o = jogo.melhorOferta;
  if (!o) return `<div class="preco-resumo sem-preco">Ver preços nas lojas</div>`;
  const desconto = o.desconto > 0 ? `<span class="desconto">-${o.desconto}%</span>` : '';
  return `<div class="preco-resumo">${desconto}<strong>${formatarPreco(o.preco)}</strong><small>na ${esc(LOJAS[o.loja]?.nome)}</small></div>`;
}

// ------------------------------------------------------------------ telas

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

async function telaInicio() {
  const usuario = auth.usuarioAtual();
  const dados = await carregarDados();
  const jogos = [...dados.jogos].sort((a, b) =>
    (b.melhorOferta?.desconto ?? -1) - (a.melhorOferta?.desconto ?? -1) || a.nome.localeCompare(b.nome));

  const status = dados.exemplo
    ? `<div class="status alerta">Dados de exemplo: o robô de preços ainda não rodou.</div>`
    : `<div class="status"><span class="ponto" aria-hidden="true"></span>Preços da Steam atualizados ${esc(quando(dados.atualizadoEm))}</div>`;

  const instalar = pedidoDeInstalacao && !estaInstalado()
    ? `<button class="cartao-instalar" data-instalar>
         <img src="icons/icon-192.png" alt="" width="40" height="40">
         <span><strong>Instale o XP Barato</strong><small>Fica na tela inicial e abre como app.</small></span>
         <span class="seta" aria-hidden="true">›</span>
       </button>`
    : '';

  const vitrine = dados.promocoes.length
    ? `<h2 class="titulo-secao">Promoções do dia na Steam</h2>
       <div class="vitrine">
         ${dados.promocoes.map((p) => `
           <a class="cartao-promo" href="#/jogo/${esc(p.id)}">
             ${capa(p, 'larga')}
             <span class="nome">${esc(p.nome)}</span>
             <span class="linha-preco"><span class="desconto">-${p.melhorOferta.desconto}%</span><strong>${formatarPreco(p.melhorOferta.preco)}</strong></span>
             ${p.terminaEm ? `<small>${esc(tempoRestante(p.terminaEm))}</small>` : ''}
           </a>`).join('')}
       </div>`
    : '';

  app.innerHTML = `
    <header class="topo">
      <div>
        <p class="ola">Olá, ${esc(usuario.nome.split(' ')[0])}</p>
        <h1>Qual jogo você quer pagar menos?</h1>
      </div>
    </header>
    ${status}
    ${instalar}
    ${vitrine}
    <h2 class="titulo-secao">Jogos monitorados</h2>
    <ul class="lista-jogos">
      ${jogos.map((j) => `
        <li><a class="item-jogo" href="#/jogo/${esc(j.id)}">
          ${capa(j)}
          <div class="info">
            <span class="nome">${esc(j.nome)}</span>
            <span class="chips">${chipsPlataforma(j.plataformas)}</span>
            ${precoResumo(j)}
          </div>
        </a></li>`).join('')}
    </ul>`;

  app.querySelector('[data-instalar]')?.addEventListener('click', instalarApp);
}

async function telaJogo(id) {
  const dados = await carregarDados();
  const jogo = encontrarJogo(dados, id);
  if (!jogo) {
    app.innerHTML = `<div class="vazio"><p>Jogo não encontrado.</p><a class="botao principal" href="#/inicio">Voltar ao início</a></div>`;
    return;
  }
  registrarEvento('ver-jogo', { titulo: jogo.nome });

  const comPreco = jogo.ofertas;
  const lojasComPreco = new Set(comPreco.map((o) => o.loja));
  const semPreco = jogo.lojas.filter((l) => !lojasComPreco.has(l));
  const menor = jogo.melhorOferta?.preco;

  const linhaComPreco = (o, i) => `
    <li class="oferta ${i === 0 ? 'melhor' : ''}">
      <div class="loja">
        <strong>${esc(LOJAS[o.loja]?.nome ?? o.loja)}</strong>
        ${i === 0 ? '<span class="selo-menor">Menor preço</span>' : `<small>+ ${formatarPreco(o.preco - menor)}</small>`}
      </div>
      <div class="valores">
        ${o.desconto > 0 ? `<s>${formatarPreco(o.precoOriginal)}</s>` : ''}
        <span>${o.desconto > 0 ? `<em class="desconto">-${o.desconto}%</em>` : ''}<strong>${formatarPreco(o.preco)}</strong></span>
      </div>
      <a class="botao ir" href="${esc(o.url)}" target="_blank" rel="noopener" data-loja="${esc(o.loja)}">Ir à loja</a>
    </li>`;

  const linhaSemPreco = (lojaId) => `
    <li class="oferta sem-preco">
      <div class="loja">
        <strong>${esc(LOJAS[lojaId].nome)}</strong>
        <small>Preço ainda não monitorado</small>
      </div>
      <a class="botao ir secundario" href="${esc(linkDeBusca(lojaId, jogo.nome))}" target="_blank" rel="noopener" data-loja="${esc(lojaId)}">Ver preço</a>
    </li>`;

  app.innerHTML = `
    <div class="cabecalho-jogo">
      <a class="voltar" href="#/inicio" aria-label="Voltar">‹</a>
      ${capa(jogo, 'destaque')}
    </div>
    <section class="detalhe">
      <h1>${esc(jogo.nome)}</h1>
      <p class="chips">${chipsPlataforma(jogo.plataformas)}${jogo.genero ? `<span class="chip suave">${esc(jogo.genero)}</span>` : ''}</p>
      ${jogo.descricao ? `<p class="descricao">${esc(jogo.descricao)}</p>` : ''}
      ${jogo.lancamento ? `<p class="meta">Lançamento: ${esc(jogo.lancamento)}</p>` : ''}
      ${jogo.terminaEm ? `<p class="meta destaque-texto">Promoção da Steam ${esc(tempoRestante(jogo.terminaEm))}</p>` : ''}

      <h2 class="titulo-secao">Comparativo entre lojas</h2>
      ${comPreco.length
        ? `<ul class="ofertas">${comPreco.map(linhaComPreco).join('')}</ul>`
        : `<p class="meta">Ainda não monitoramos o preço deste jogo. Confira direto nas lojas:</p>`}
      ${semPreco.length ? `
        ${comPreco.length ? '<h3 class="subtitulo">Confira também</h3>' : ''}
        <ul class="ofertas">${semPreco.map(linhaSemPreco).join('')}</ul>` : ''}
      <p class="nota">${comPreco.length && !dados.exemplo
        ? `Preço da Steam consultado pelo robô ${esc(quando(dados.atualizadoEm))}. `
        : ''}O botão "Ver preço" abre a busca do jogo no site oficial da loja.</p>
    </section>`;

  app.querySelectorAll('a.ir').forEach((a) =>
    a.addEventListener('click', () => registrarEvento('clique-loja', { titulo: `${jogo.nome} → ${a.dataset.loja}` })));
}

function telaConta() {
  const usuario = auth.usuarioAtual();
  app.innerHTML = `
    <header class="topo"><h1>Sua conta</h1></header>
    <section class="cartao-conta">
      <div class="avatar" style="--h:${corDoNome(usuario.nome)}">${esc(iniciais(usuario.nome))}</div>
      <div><strong>${esc(usuario.nome)}</strong><small>${esc(usuario.email)}</small></div>
    </section>
    ${pedidoDeInstalacao && !estaInstalado() ? '<button class="botao principal largo" data-instalar>Instalar o app no celular</button>' : ''}
    ${estaInstalado() ? '<p class="meta centro">App instalado neste aparelho ✔</p>' : ''}
    <button class="botao secundario largo" data-sair>Sair</button>
    <p class="rodape-login">XP Barato · MVP Onda 1<br>Trabalho de APS · protótipo acadêmico</p>`;
  app.querySelector('[data-sair]').addEventListener('click', () => {
    auth.sair();
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
  barra.querySelectorAll('a').forEach((a) =>
    a.classList.toggle('ativo', a.dataset.aba === (rota === 'jogo' ? 'inicio' : rota)));

  try {
    if (rota === 'login') await telaLogin();
    else if (rota === 'jogo') await telaJogo(decodeURIComponent(parametro ?? ''));
    else if (rota === 'conta') telaConta();
    else await telaInicio();
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.addEventListener('hashchange', rotear);
await auth.garantirUsuarioDemo();
rotear();
