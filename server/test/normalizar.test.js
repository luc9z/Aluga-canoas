import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectarConservacao, detectarMobilia, encontrarBairro, montarAnuncio, normalizarBairro, paraNumero, tipoApartamento,
} from '../src/lib/normalizar.js';

test('paraNumero entende os formatos de preço dos sites', () => {
  assert.equal(paraNumero('R$ 2.150,50'), 2150.5);
  assert.equal(paraNumero('R$ 2.200'), 2200);
  assert.equal(paraNumero('1800'), 1800);
  assert.equal(paraNumero(1800), 1800);
  assert.equal(paraNumero('51.33'), 51.33);
  assert.equal(paraNumero('0'), null);
  assert.equal(paraNumero('Consulte'), null);
  assert.equal(paraNumero(null), null);
});

test('tipoApartamento aceita só tipos residenciais de apartamento', () => {
  assert.equal(tipoApartamento('Apartamento'), 'Apartamento');
  assert.equal(tipoApartamento('Apartamento - 2 Dormitórios'), 'Apartamento');
  assert.equal(tipoApartamento('Apartamento em Condomínio Residencial'), 'Apartamento');
  assert.equal(tipoApartamento('COBERTURA'), 'Cobertura');
  assert.equal(tipoApartamento('Kitnet'), 'Kitnet');
  assert.equal(tipoApartamento('Loft'), 'Loft');
  assert.equal(tipoApartamento('Casa em Condomínio'), null);
  assert.equal(tipoApartamento('Sala Comercial'), null);
  assert.equal(tipoApartamento('Loft comercial'), null);
  assert.equal(tipoApartamento(''), null);
});

test('normalizarBairro unifica grafias diferentes', () => {
  assert.equal(normalizarBairro('CENTRO'), 'Centro');
  assert.equal(normalizarBairro('Mal. Rondon'), 'Marechal Rondon');
  assert.equal(normalizarBairro('Sao Jose'), 'São José');
  assert.equal(normalizarBairro('NOSSA SENHORA DAS GRACAS'), 'Nossa Senhora das Graças');
  assert.equal(normalizarBairro('vila nova'), 'Vila Nova');
  assert.equal(normalizarBairro('  '), null);
});

test('montarAnuncio calcula o custo total e descarta não-apartamentos', () => {
  const fonte = { id: 'x', nome: 'Imobiliária X' };
  const anuncio = montarAnuncio(fonte, {
    codigo: 10, url: 'https://x/10', tipo: 'Apartamento', aluguel: '1.500', condominio: 300, iptu: '50', bairro: 'centro',
  });
  assert.equal(anuncio.id, 'x:10');
  assert.equal(anuncio.total, 1850);
  assert.equal(anuncio.bairro, 'Centro');
  assert.equal(anuncio.cidade, 'Canoas');
  assert.equal(montarAnuncio(fonte, { codigo: 11, url: 'https://x/11', tipo: 'Casa' }), null);
});

test('detectarMobilia lê mobiliado, semimobiliado e negações no texto', () => {
  assert.equal(detectarMobilia('Apartamento mobiliado com 2 dormitórios'), 'mobiliado');
  assert.equal(detectarMobilia('Apartamento Semi mobiliado'), 'semimobiliado');
  assert.equal(detectarMobilia('Semi-Mobiliado, Ar-condicionado'), 'semimobiliado');
  assert.equal(detectarMobilia('APTO SEMIMOBILIADO NO CENTRO'), 'semimobiliado');
  assert.equal(detectarMobilia('Cozinha mobiliada e área de serviço'), 'semimobiliado');
  assert.equal(detectarMobilia('Loft mobiliado, cozinha mobiliada'), 'mobiliado');
  assert.equal(detectarMobilia('Imóvel não mobiliado'), 'sem');
  assert.equal(detectarMobilia('Mobília Cozinha, Armários Dormitórios'), null);
  assert.equal(detectarMobilia('Apartamento 2 dormitórios'), null);
});

test('detectarConservacao separa imóvel novo de reformado', () => {
  assert.equal(detectarConservacao('Apartamento novo, primeira locação'), 'novo');
  assert.equal(detectarConservacao('1ª locação, nunca habitado'), 'novo');
  assert.equal(detectarConservacao('Lançamento no Centro'), 'novo');
  assert.equal(detectarConservacao('Prédio novo com elevador'), 'novo');
  assert.equal(detectarConservacao('Apartamento todo reformado'), 'reformado');
  assert.equal(detectarConservacao('Passou por reforma completa'), 'reformado');
  assert.equal(detectarConservacao('Próximo a Novo Hamburgo, precisa de reforma'), null);
  assert.equal(detectarConservacao('Apartamento 2 dormitórios', new Date().getFullYear() - 1), 'novo');
  assert.equal(detectarConservacao('Apartamento 2 dormitórios', 1998), null);
});

test('montarAnuncio usa o campo da imobiliária antes do texto', () => {
  const fonte = { id: 'x', nome: 'X' };
  const base = { codigo: 1, url: 'https://x/1', tipo: 'Apartamento' };
  const pelaDescricao = montarAnuncio(fonte, { ...base, descricao: 'Apartamento mobiliado, todo reformado' });
  assert.equal(pelaDescricao.mobilia, 'mobiliado');
  assert.equal(pelaDescricao.conservacao, 'reformado');
  const peloCampo = montarAnuncio(fonte, { ...base, titulo: 'Apartamento mobiliado', mobilia: 'semimobiliado', anoConstrucao: '0' });
  assert.equal(peloCampo.mobilia, 'semimobiliado');
  assert.equal(peloCampo.anoConstrucao, null);
  const pelasCaracteristicas = montarAnuncio(fonte, { ...base, caracteristicas: ['Sacada', 'Semi-Mobiliado'] });
  assert.equal(pelasCaracteristicas.mobilia, 'semimobiliado');
});

test('encontrarBairro acha o bairro em textos e endereços de página', () => {
  assert.equal(encontrarBairro('/imoveis-locacao/160-apartamento-1-quarto-s-mato-grande-canoas-ap160'), 'Mato Grande');
  assert.equal(encontrarBairro('Apartamento no bairro Igara III em Canoas'), 'Igara III');
  assert.equal(encontrarBairro('perto do Mal. Rondon'), 'Marechal Rondon');
  assert.equal(encontrarBairro('Condomínio Vida Viva Clube'), null);
});
