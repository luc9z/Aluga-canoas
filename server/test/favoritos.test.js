import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// sem Upstash configurado, os favoritos vão para um arquivo na PASTA_DADOS
const pasta = await mkdtemp(path.join(os.tmpdir(), 'favoritos-'));
process.env.PASTA_DADOS = pasta;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
const favoritos = await import('../src/favoritos.js');

test('favoritos ficam salvos no arquivo e voltam ao recarregar', async () => {
  await favoritos.adicionar({ id: 'a:1', titulo: 'Apto', aluguel: 1500, tambemEm: [{ id: 'b:1' }] });
  await favoritos.adicionar({ id: 'a:2', titulo: 'Cobertura' });
  await favoritos.remover('a:2');
  assert.deepEqual(favoritos.ids(), ['a:1']);
  const salvo = JSON.parse(await readFile(path.join(pasta, 'favoritos.json'), 'utf8'));
  assert.equal(salvo['a:1'].anuncio.titulo, 'Apto');
  assert.equal(salvo['a:1'].anuncio.tambemEm, undefined);
  await favoritos.carregar();
  assert.deepEqual(favoritos.ids(), ['a:1']);
});

test('favorito que saiu dos sites aparece pela cópia, marcado como indisponível', () => {
  const atual = { id: 'a:1', titulo: 'Apto (preço novo)', aluguel: 1400 };
  assert.deepEqual(favoritos.anunciosFavoritos([atual]), [atual]);
  const [copia] = favoritos.anunciosFavoritos([]);
  assert.equal(copia.titulo, 'Apto');
  assert.equal(copia.indisponivel, true);
});
