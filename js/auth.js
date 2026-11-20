// Tela de login: cadastro, entrada e saída.
// Como o MVP não tem servidor, as contas ficam salvas no próprio celular (localStorage).
// Mesmo assim a senha nunca é guardada: guardamos SHA-256(salt + senha), como no protótipo Java.

const CHAVE_USUARIOS = 'xpb.usuarios';
const CHAVE_SESSAO = 'xpb.sessao';
export const EMAIL_DEMO = 'demo@xpbarato.com';
export const SENHA_DEMO = '123456';
const ERRO_LOGIN = 'E-mail ou senha incorretos.';
const EMAIL_VALIDO = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

function ler(chave, padrao) {
  try {
    return JSON.parse(localStorage.getItem(chave)) ?? padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // modo anônimo ou sem espaço: segue sem salvar
  }
}

const paraBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function gerarHash(senha, salt) {
  const senhaBytes = new TextEncoder().encode(senha);
  const junto = new Uint8Array(salt.length + senhaBytes.length);
  junto.set(salt);
  junto.set(senhaBytes, salt.length);
  return paraBase64(await crypto.subtle.digest('SHA-256', junto));
}

const normalizar = (email) => (email ?? '').trim().toLowerCase();

export async function cadastrar(nome, email, senha, confirmacao) {
  const nomeLimpo = (nome ?? '').trim();
  const emailLimpo = normalizar(email);
  if (nomeLimpo.length < 2) throw new Error('Informe seu nome.');
  if (!EMAIL_VALIDO.test(emailLimpo)) throw new Error('Informe um e-mail válido.');
  if (!senha || senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if (senha !== confirmacao) throw new Error('As senhas não conferem.');

  const usuarios = ler(CHAVE_USUARIOS, {});
  if (usuarios[emailLimpo]) throw new Error('Já existe uma conta com este e-mail.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  usuarios[emailLimpo] = {
    nome: nomeLimpo,
    email: emailLimpo,
    salt: paraBase64(salt),
    hash: await gerarHash(senha, salt),
    criadoEm: new Date().toISOString()
  };
  gravar(CHAVE_USUARIOS, usuarios);
  gravar(CHAVE_SESSAO, emailLimpo);
  return usuarios[emailLimpo];
}

export async function entrar(email, senha) {
  if (!email?.trim() || !senha) throw new Error('Preencha e-mail e senha.');
  const usuario = ler(CHAVE_USUARIOS, {})[normalizar(email)];
  if (!usuario) throw new Error(ERRO_LOGIN);
  const hash = await gerarHash(senha, deBase64(usuario.salt));
  if (hash !== usuario.hash) throw new Error(ERRO_LOGIN);
  gravar(CHAVE_SESSAO, usuario.email);
  return usuario;
}

export function sair() {
  try {
    localStorage.removeItem(CHAVE_SESSAO);
  } catch {
    // ignora
  }
}

export function usuarioAtual() {
  const email = ler(CHAVE_SESSAO, null);
  return email ? ler(CHAVE_USUARIOS, {})[email] ?? null : null;
}

/** Altera dados do usuário logado (ex.: assinatura) e devolve o usuário atualizado. */
export function atualizarUsuario(mudancas) {
  const email = ler(CHAVE_SESSAO, null);
  const usuarios = ler(CHAVE_USUARIOS, {});
  if (!email || !usuarios[email]) return null;
  usuarios[email] = { ...usuarios[email], ...mudancas };
  gravar(CHAVE_USUARIOS, usuarios);
  return usuarios[email];
}

/** Cria a conta de demonstração usada na apresentação, se ainda não existir. */
export async function garantirUsuarioDemo() {
  const usuarios = ler(CHAVE_USUARIOS, {});
  if (usuarios[EMAIL_DEMO]) return;
  const sessao = ler(CHAVE_SESSAO, null);
  await cadastrar('Jogador Demo', EMAIL_DEMO, SENHA_DEMO, SENHA_DEMO);
  if (sessao) gravar(CHAVE_SESSAO, sessao);
  else sair();
}
