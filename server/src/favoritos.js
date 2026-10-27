// Favoritos compartilhados: todo mundo que abre o site vê e altera a mesma
// lista. Cada favorito guarda uma cópia do anúncio, para continuar aparecendo
// (como "não está mais anunciado") depois que sair do site da imobiliária.
//
// Com UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN definidos, ficam no
// Upstash Redis e sobrevivem aos reinícios do servidor (o disco do plano
// gratuito do Render é apagado a cada reinício). Sem eles, num arquivo JSON.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = process.env.PASTA_DADOS ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ARQUIVO = path.join(PASTA, 'favoritos.json');
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CHAVE_REDIS = 'aluga-canoas:favoritos';
const LIMITE = 500;

export const ARMAZENAMENTO = UPSTASH_URL && UPSTASH_TOKEN ? 'upstash' : 'arquivo';

export class ErroFavoritos extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

/** id do anúncio → { em: data ISO, anuncio: cópia do anúncio } */
let favoritos = new Map();

async function redis(...comando) {
  const resp = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(comando),
    signal: AbortSignal.timeout(10000),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok || corpo.error) throw new Error(`Upstash: ${corpo.error ?? `HTTP ${resp.status}`}`);
  return corpo.result;
}

export async function carregar() {
  try {
    if (ARMAZENAMENTO === 'upstash') {
      // HGETALL devolve [id1, valor1, id2, valor2, ...]
      const plano = (await redis('HGETALL', CHAVE_REDIS)) ?? [];
      const mapa = new Map();
      for (let i = 0; i < plano.length; i += 2) mapa.set(plano[i], JSON.parse(plano[i + 1]));
      favoritos = mapa;
    } else {
      favoritos = new Map(Object.entries(JSON.parse(await readFile(ARQUIVO, 'utf8'))));
    }
  } catch (erro) {
    if (erro.code !== 'ENOENT') console.warn('Não foi possível ler os favoritos:', erro.message);
  }
}

// grava em sequência, para uma escrita não atropelar a outra
let fila = Promise.resolve();
function gravarArquivo() {
  fila = fila
    .catch(() => {})
    .then(async () => {
      await mkdir(PASTA, { recursive: true });
      const temporario = `${ARQUIVO}.tmp`;
      await writeFile(temporario, JSON.stringify(Object.fromEntries(favoritos)));
      await rename(temporario, ARQUIVO);
    });
  return fila;
}

/** Grava (item) ou apaga (null) um favorito; em caso de erro nada muda. */
async function salvar(id, item) {
  if (ARMAZENAMENTO === 'upstash') {
    await (item ? redis('HSET', CHAVE_REDIS, id, JSON.stringify(item)) : redis('HDEL', CHAVE_REDIS, id));
  }
  const anterior = favoritos.get(id);
  if (item) favoritos.set(id, item);
  else favoritos.delete(id);
  if (ARMAZENAMENTO === 'arquivo') {
    try {
      await gravarArquivo();
    } catch (erro) {
      if (anterior) favoritos.set(id, anterior);
      else favoritos.delete(id);
      throw erro;
    }
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

/**
 * Os anúncios favoritados: a versão atual quando o anúncio ainda está nos
 * sites, ou a cópia guardada (com indisponivel: true) quando saiu.
 */
export function anunciosFavoritos(anunciosAtuais) {
  const atuais = new Map(anunciosAtuais.map((a) => [a.id, a]));
  return [...favoritos].map(([id, { anuncio }]) => atuais.get(id) ?? { ...anuncio, indisponivel: true });
}
