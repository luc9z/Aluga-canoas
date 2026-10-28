import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buscar } from '../src/busca.js';
import { marcarBomPreco } from '../src/coletor.js';

// visitas vão para um arquivo temporário
process.env.PASTA_DADOS = await mkdtemp(path.join(os.tmpdir(), 'emalta-'));
delete process.env.GITHUB_TOKEN;
const emAlta = await import('../src/emAlta.js');

const ids = (lista) => lista.map((a) => a.id);

test('marcarBomPreco compara o aluguel com a mediana do bairro para o mesmo número de quartos', () => {
  const anuncios = [
    { id: '1', bairro: 'Centro', aluguel: 1000, quartos: 2 },
    { id: '2', bairro: 'Centro', aluguel: 1500, quartos: 2 },
    { id: '3', bairro: 'Centro', aluguel: 1600, quartos: 2 },
    { id: '4', bairro: 'Centro', aluguel: 2000, quartos: 2 },
    { id: '5', bairro: 'Centro', aluguel: 1400, quartos: 2 },
    { id: '6', bairro: 'Centro', aluguel: 100, quartos: 2 }, // erro de digitação: fica de fora
    { id: '7', bairro: 'Igara', aluguel: 500, quartos: 2 }, // bairro com poucos anúncios
  ];
  marcarBomPreco(anuncios);
  // mediana dos 2 quartos do Centro: (1400 + 1500) / 2 = 1450
  assert.equal(anuncios[0].abaixoDaMedia, 0.31);
  assert.equal(anuncios[4].abaixoDaMedia, 0.03);
  assert.equal(anuncios[1].abaixoDaMedia, undefined);
  assert.equal(anuncios[5].abaixoDaMedia, undefined);
  assert.equal(anuncios[6].abaixoDaMedia, undefined);
  assert.deepEqual(ids(buscar(anuncios, { bomPreco: '1' }).itens), ['1']);
});

test('em alta junta visitas, favoritos e bom preço, com os motivos', () => {
  const anuncios = [
    { id: 'a', aluguel: 1500, foto: 'f', quartos: 2, abaixoDaMedia: 0.3 },
    { id: 'b', aluguel: 1500, foto: 'f', tambemEm: [{ id: 'c' }] },
    { id: 'c', aluguel: 1500, foto: 'f', tambemEm: [{ id: 'b' }] },
    { id: 'd', aluguel: 1500, foto: 'f' },
    { id: 'e', aluguel: null, foto: 'f', abaixoDaMedia: 0.5 },
  ];
  for (let i = 0; i < 7; i++) emAlta.registrarVisita('b');
  emAlta.registrarVisita('c');
  const ranking = emAlta.emAlta(anuncios, { favoritos: new Set(['d']), primeiraColetaEm: null });
  // b (7 visitas) > a (30% abaixo) > d (favorito); c é o mesmo imóvel de b; e não tem preço
  assert.deepEqual(ranking.map((r) => r.anuncio.id), ['b', 'a', 'd']);
  assert.deepEqual(ranking[0].motivos, ['7 visitas na semana']);
  assert.deepEqual(ranking[1].motivos, ['30% abaixo dos de 2 quartos no bairro']);
  const comPreco = anuncios.filter((a) => a.aluguel);
  const pontos = emAlta.pontosEmAlta(comPreco, { favoritos: new Set(), primeiraColetaEm: null });
  assert.deepEqual(ids(buscar(comPreco, { ordem: 'em_alta' }, { pontosEmAlta: pontos }).itens), ['b', 'a', 'c', 'd']);
});
