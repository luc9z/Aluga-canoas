import assert from 'node:assert/strict';
import { test } from 'node:test';

// sem chave da Anthropic o assistente usa o intérprete local
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
const { MODO, conversar, filtrosDaFerramenta, interpretarPedido } = await import('../src/assistente.js');

const BAIRROS = ['Centro', 'Igara', 'Marechal Rondon', 'São José'];

test('interpretarPedido entende quartos, valor, bairro, mobília e vaga', () => {
  const { filtros } = interpretarPedido('quero um ap de 2 quartos mobiliado até 2 mil no centro com vaga', BAIRROS);
  assert.deepEqual(filtros, { quartos: '2', precoMax: '2000', vagas: '1', mobilia: 'mobiliado', bairro: 'Centro' });
  assert.deepEqual(interpretarPedido('entre 1.500 e 2,5 mil em Marechal Rondon ou São José', BAIRROS).filtros, {
    precoMin: '1500',
    precoMax: '2500',
    bairro: 'Marechal Rondon,São José',
  });
  assert.deepEqual(interpretarPedido('kitnet semi mobiliada barata', BAIRROS).filtros, {
    tipo: 'Kitnet',
    mobilia: 'semimobiliado',
    ordem: 'total_asc',
  });
  assert.equal(interpretarPedido('apartamento novo ou reformado', BAIRROS).filtros.conservacao, 'novo,reformado');
  assert.equal(interpretarPedido('nova busca: em alta no Igara', BAIRROS).filtros.conservacao, undefined);
  assert.equal(interpretarPedido('3 quartos, mais de 50 m2', BAIRROS).filtros.precoMin, undefined);
});

test('filtrosDaFerramenta converte a entrada do Claude nos parâmetros da busca', () => {
  assert.deepEqual(filtrosDaFerramenta({ precoMax: 2000.4, quartos: '2', bairros: ['marechal rondon'], bomPreco: true, texto: 'piscina' }), {
    precoMax: '2000',
    quartos: '2',
    bairro: 'Marechal Rondon',
    bomPreco: '1',
    q: 'piscina',
  });
  assert.deepEqual(filtrosDaFerramenta({ quartos: -1, bairros: [] }), {});
});

test('sem IA, responde com a busca e afrouxa o que não deu resultado', async () => {
  assert.equal(MODO, 'local');
  const anuncios = [
    { id: 'a:1', tipo: 'Apartamento', bairro: 'Centro', aluguel: 1800, total: 2100, quartos: 2 },
    { id: 'a:2', tipo: 'Apartamento', bairro: 'Igara', aluguel: 1500, total: 1500, quartos: 2, mobilia: 'mobiliado' },
  ];
  const contexto = { anuncios, bairros: BAIRROS, pontosEmAlta: new Map() };
  const r = await conversar({ mensagem: '2 quartos mobiliado no Centro', ip: 'x' }, contexto);
  assert.equal(r.modo, 'local');
  assert.deepEqual(r.imoveis.map((a) => a.id), ['a:1']);
  assert.match(r.resposta, /sem a mobília/);
  // a mensagem seguinte refina a mesma busca
  const r2 = await conversar({ sessaoId: r.sessao, mensagem: 'até 1.700', ip: 'x' }, contexto);
  assert.deepEqual(r2.filtros, { quartos: '2', bairro: 'Centro', precoMax: '1700' });
  assert.equal(r2.total, 0);
});
