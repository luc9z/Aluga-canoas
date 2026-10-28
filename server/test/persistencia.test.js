// Gravação no GitHub, contra um servidor local que imita a API de conteúdo
// (contents) e de referências (git/refs) do GitHub.
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

const branches = new Map(); // branch → Map(caminho → { content, sha })
let versao = 0;
const pedidos = [];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    pedidos.push(`${req.method} ${url.pathname}`);
    const responder = (status, dados) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(dados));
    };
    if (req.headers.authorization !== 'Bearer token-teste') return responder(401, {});
    const base = '/repos/dono/repo';
    if (req.method === 'GET' && url.pathname === base) return responder(200, { default_branch: 'main' });
    if (req.method === 'GET' && url.pathname === `${base}/git/ref/heads/main`) return responder(200, { object: { sha: 'abc' } });
    if (req.method === 'POST' && url.pathname === `${base}/git/refs`) {
      const nome = JSON.parse(corpo).ref.replace('refs/heads/', '');
      if (branches.has(nome)) return responder(422, {});
      branches.set(nome, new Map());
      return responder(201, {});
    }
    const caminho = url.pathname.replace(`${base}/contents/`, '');
    if (req.method === 'GET') {
      const arquivo = branches.get(url.searchParams.get('ref'))?.get(caminho);
      return arquivo ? responder(200, arquivo) : responder(404, {});
    }
    if (req.method === 'PUT') {
      const dados = JSON.parse(corpo);
      const branch = branches.get(dados.branch);
      if (!branch) return responder(404, { message: 'Branch not found' });
      const atual = branch.get(caminho);
      if (atual && dados.sha !== atual.sha) return responder(409, {});
      const novo = { content: dados.content, sha: `v${++versao}` };
      branch.set(caminho, novo);
      return responder(atual ? 200 : 201, { content: { sha: novo.sha } });
    }
    responder(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
process.env.GITHUB_TOKEN = 'token-teste';
process.env.GITHUB_REPO = 'dono/repo';
process.env.GITHUB_API_URL = `http://127.0.0.1:${servidor.address().port}`;
const { ONDE, documento } = await import('../src/persistencia.js');

test.after(() => servidor.close());

test('cria o branch "dados" na primeira gravação e relê o documento', async () => {
  assert.equal(ONDE, 'github');
  const doc = documento('favoritos');
  assert.equal(await doc.ler(), null);
  await doc.gravar({ 'a:1': { em: 'x' } });
  assert.ok(branches.has('dados'));
  assert.deepEqual(await documento('favoritos').ler(), { 'a:1': { em: 'x' } });
});

test('atualiza com o sha atual mesmo quando outra cópia gravou antes', async () => {
  const primeiro = documento('visitas');
  const segundo = documento('visitas');
  await primeiro.gravar({ dia: 1 });
  await segundo.gravar({ dia: 2 }); // segundo não sabia do sha: relê e grava
  await primeiro.gravar({ dia: 3 }); // primeiro ficou com sha antigo: relê e grava
  assert.deepEqual(await documento('visitas').ler(), { dia: 3 });
  assert.ok(pedidos.filter((p) => p.startsWith('PUT')).length >= 4);
});
