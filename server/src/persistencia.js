// Documentos JSON que precisam sobreviver aos reinícios do servidor
// (favoritos, visitas). O disco do plano gratuito do Render é apagado a cada
// reinício, então, com GITHUB_TOKEN definido, cada documento vira um arquivo
// no branch "dados" do próprio repositório do projeto. Sem token, fica num
// arquivo local em PASTA_DADOS.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = process.env.PASTA_DADOS ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const TOKEN = process.env.GITHUB_TOKEN;
// o Render informa o repositório em RENDER_GIT_REPO_SLUG ("dono/repo")
const REPO = process.env.GITHUB_REPO ?? process.env.RENDER_GIT_REPO_SLUG;
const BRANCH = process.env.GITHUB_BRANCH_DADOS ?? 'dados';
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';

export const ONDE = TOKEN && REPO ? 'github' : 'arquivo';

const pendentes = new Set();

async function github(caminho, { method = 'GET', body } = {}) {
  const resp = await fetch(`${API}/repos/${REPO}${caminho}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'aluga-canoas',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const corpo = await resp.json().catch(() => ({}));
  return { status: resp.status, corpo };
}

/** Cria o branch de dados a partir do branch principal do repositório. */
async function criarBranch() {
  const repo = await github('');
  if (repo.status !== 200) throw new Error(`GitHub: repositório ${REPO} inacessível (HTTP ${repo.status})`);
  const ref = await github(`/git/ref/heads/${repo.corpo.default_branch}`);
  if (ref.status !== 200) throw new Error(`GitHub: branch principal inacessível (HTTP ${ref.status})`);
  const criado = await github('/git/refs', { method: 'POST', body: { ref: `refs/heads/${BRANCH}`, sha: ref.corpo.object.sha } });
  if (criado.status !== 201 && criado.status !== 422) throw new Error(`GitHub: não criou o branch ${BRANCH} (HTTP ${criado.status})`);
}

/**
 * Um documento JSON com nome fixo. `gravar` junta as alterações feitas dentro
 * de `atrasoMs` numa escrita só (no GitHub, cada escrita é um commit).
 */
export function documento(nome, { atrasoMs = 0 } = {}) {
  const arquivo = path.join(PASTA, `${nome}.json`);
  const caminho = `/contents/${nome}.json`;
  let sha = null; // versão atual do arquivo no GitHub
  let valor;
  let timer = null;
  let fila = Promise.resolve();

  async function lerGithub() {
    const r = await github(`${caminho}?ref=${encodeURIComponent(BRANCH)}`);
    if (r.status === 404) {
      sha = null; // branch ou arquivo ainda não existem
      return null;
    }
    if (r.status !== 200) throw new Error(`GitHub: leitura de ${nome}.json falhou (HTTP ${r.status})`);
    sha = r.corpo.sha;
    return JSON.parse(Buffer.from(r.corpo.content, 'base64').toString('utf8'));
  }

  async function gravarGithub(dados, tentativa = 1) {
    const r = await github(caminho, {
      method: 'PUT',
      body: {
        message: `dados: atualiza ${nome}.json`,
        content: Buffer.from(JSON.stringify(dados, null, 1)).toString('base64'),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      },
    });
    if (r.status === 200 || r.status === 201) {
      sha = r.corpo.content.sha;
      return;
    }
    const recuperavel = [404, 409, 422].includes(r.status); // sem branch, sha antigo ou faltando
    if (!recuperavel || tentativa > 2) throw new Error(`GitHub: gravação de ${nome}.json falhou (HTTP ${r.status})`);
    // relê para pegar o sha atual; se nem o arquivo existir, garante o branch
    if ((await lerGithub()) === null) await criarBranch();
    return gravarGithub(dados, tentativa + 1);
  }

  async function gravarArquivo(dados) {
    await mkdir(PASTA, { recursive: true });
    const temporario = `${arquivo}.tmp`;
    await writeFile(temporario, JSON.stringify(dados));
    await rename(temporario, arquivo);
  }

  function descarregar() {
    clearTimeout(timer);
    timer = null;
    pendentes.delete(descarregar);
    const dados = valor;
    // grava em sequência, para uma escrita não atropelar a outra
    fila = fila
      .catch(() => {})
      .then(() => (ONDE === 'github' ? gravarGithub(dados) : gravarArquivo(dados)));
    return fila;
  }

  return {
    async ler() {
      try {
        return ONDE === 'github' ? await lerGithub() : JSON.parse(await readFile(arquivo, 'utf8'));
      } catch (erro) {
        if (erro.code !== 'ENOENT') console.warn(`Não foi possível ler ${nome}:`, erro.message);
        return null;
      }
    },
    /**
     * Sem atraso, a promessa resolve quando a gravação termina. Com atraso,
     * a gravação fica agendada e um erro dela só vai para o log.
     */
    gravar(dados) {
      valor = dados;
      if (!atrasoMs) return descarregar();
      pendentes.add(descarregar);
      if (!timer) {
        timer = setTimeout(() => descarregar().catch((erro) => console.error(erro.message)), atrasoMs);
        timer.unref(); // não segura o processo aberto; ao desligar, gravarPendentes() grava
      }
      return fila;
    },
  };
}

/** Grava já o que estiver esperando (ex.: antes de o servidor desligar). */
export function gravarPendentes() {
  return Promise.allSettled([...pendentes].map((descarregar) => descarregar()));
}
