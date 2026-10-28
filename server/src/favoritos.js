// Favoritos compartilhados: todo mundo que abre o site vê e altera a mesma
// lista. Cada favorito guarda uma cópia do anúncio, para continuar aparecendo
// (como "não está mais anunciado") depois que sair do site da imobiliária.
// Ficam no GitHub ou num arquivo local (veja persistencia.js).
import { ONDE, documento } from './persistencia.js';

const LIMITE = 500;

export class ErroFavoritos extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

// no GitHub cada gravação é um commit: junta os cliques de alguns segundos
const doc = documento('favoritos', { atrasoMs: ONDE === 'github' ? 3000 : 0 });

/** id do anúncio → { em: data ISO, anuncio: cópia do anúncio } */
let favoritos = new Map();

export async function carregar() {
  favoritos = new Map(Object.entries((await doc.ler()) ?? {}));
}

/** Grava (item) ou apaga (null) um favorito; se a gravação falhar, nada muda. */
async function salvar(id, item) {
  const anterior = favoritos.get(id);
  if (item) favoritos.set(id, item);
  else favoritos.delete(id);
  try {
    await doc.gravar(Object.fromEntries(favoritos));
  } catch (erro) {
    if (anterior) favoritos.set(id, anterior);
    else favoritos.delete(id);
    throw erro;
  }
}

export function ids() {
  return [...favoritos.keys()];
}

export async function adicionar(anuncio) {
  if (favoritos.has(anuncio.id)) return;
  if (favoritos.size >= LIMITE) throw new ErroFavoritos(`Limite de ${LIMITE} favoritos atingido`, 409);
  const { tambemEm, ...copia } = anuncio;
  await salvar(anuncio.id, { em: new Date().toISOString(), anuncio: copia });
}

export async function remover(id) {
  if (favoritos.has(id)) await salvar(id, null);
}

/** A cópia guardada de um anúncio favoritado, ou undefined. */
export function copia(id) {
  return favoritos.get(id)?.anuncio;
}

/**
 * Os anúncios favoritados: a versão atual quando o anúncio ainda está nos
 * sites, ou a cópia guardada (com indisponivel: true) quando saiu.
 */
export function anunciosFavoritos(anunciosAtuais) {
  const atuais = new Map(anunciosAtuais.map((a) => [a.id, a]));
  return [...favoritos].map(([id, { anuncio }]) => atuais.get(id) ?? { ...anuncio, indisponivel: true });
}
