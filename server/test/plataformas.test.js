// Testes dos leitores de cada plataforma, com trechos reduzidos do HTML/JSON
// real dos sites (out/2026).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lerCardsAgora, lerCardsKasa, lerCardsOpen, lerCardsPagina1, lerCardsPenteado } from '../src/fontes/plataformas/html.js';
import { complementosAuxiliadora, extrairJsonLd, listingParaAnuncio } from '../src/fontes/plataformas/jsonld.js';
import { sobressaiParaAnuncio } from '../src/fontes/plataformas/sobressai.js';
import { extrairImoveisVistaDoHtml, vistaParaAnuncio } from '../src/fontes/plataformas/vista.js';
import { montarAnuncio } from '../src/lib/normalizar.js';

const fonte = { id: 'teste', nome: 'Teste' };

test('JSON-LD: lê RealEstateListing (Auxiliadora)', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'RealEstateListing',
        '@id': 'https://www.auxiliadorapredial.com.br/imovel/aluguel/722136',
        name: 'Apartamento - Centro - Canoas',
        url: 'https://www.auxiliadorapredial.com.br/imovel/aluguel/722136',
        identifier: '722136',
        image: { '@type': 'ImageObject', url: 'https://gestor.auxiliadorapredial.com.br/foto.jpg' },
        offers: [{
          '@type': 'Offer',
          price: 2500,
          itemOffered: {
            '@type': 'Accommodation',
            address: { streetAddress: 'Brasil', addressLocality: 'Canoas' },
            geo: { latitude: '-29.91', longitude: '-51.18' },
            floorSize: { value: 51.33 },
            numberOfBedrooms: 2,
            numberOfBathroomsTotal: 1,
            amenityFeature: [{ name: 'Vagas de Garagem', value: '1' }],
            accommodationCategory: 'Apartamento',
          },
        }],
      },
    ],
  })}</script>`;
  const [listing] = extrairJsonLd(html);
  const a = listingParaAnuncio(fonte, listing);
  assert.equal(a.codigo, '722136');
  assert.equal(a.bairro, 'Centro');
  assert.equal(a.aluguel, 2500);
  assert.equal(a.quartos, 2);
  assert.equal(a.vagas, 1);
  assert.equal(a.area, 51.33);
  assert.equal(a.latitude, -29.91);
  assert.equal(a.foto, 'https://gestor.auxiliadorapredial.com.br/foto.jpg');
});

test('Vista: extrai imóveis do payload do Next.js (Gallina)', () => {
  const objeto = {
    Codigo: 'APTO4154', TituloSite: 'ALUGUEL APARTAMENTO CANOAS RS!', AreaPrivativa: 100, Dormitorios: 2,
    TotalBanheiros: 2, Vagas: 1, FotoDestaque: 'https://cdn.vistahost.com.br/f.jpg', ValorLocacao: 2000,
    TipoEndereco: 'Rua', Endereco: 'Araújo Lima', Bairro: 'CENTRO', Cidade: 'CANOAS', Status: 'Aluguel',
    DescricaoWeb: '$undefined', DescricaoWebResumo: 'Amplo apartamento', Categoria: 'Apartamento',
  };
  const linha = `5:["$","div",null,{"imoveis":[${JSON.stringify(objeto)}]}]`;
  const html = `<a href="/imovel/apartamento-centro-canoas-rs-2-quartos-100m2-APTO4154">x</a>
    <script>self.__next_f.push([1,${JSON.stringify(linha)}])</script>`;
  const [imovel] = extrairImoveisVistaDoHtml(html);
  assert.equal(imovel.Codigo, 'APTO4154');
  const a = vistaParaAnuncio(fonte, imovel, 'https://gallinaimoveis.com.br/imovel/x-APTO4154');
  assert.equal(a.bairro, 'Centro');
  assert.equal(a.cidade, 'Canoas');
  assert.equal(a.endereco, 'Rua Araújo Lima');
  assert.equal(a.aluguel, 2000);
  assert.equal(a.descricao, 'Amplo apartamento');
});

test('Sobressai: monta URL e trata "Apartamento - 2 Dormitórios" (Moresco)', () => {
  const a = sobressaiParaAnuncio(
    fonte,
    {
      id: 3631599, referencia: '162253', titulo: 'Apartamento 02 dorm', tipo: { nome: 'Apartamento - 2 Dormitórios' },
      bairro: { nome: 'Mal. Rondon' }, cidade: { nome: 'Canoas' }, dormitorios: 2, garagems: 1,
      preco_locacao: 2600, exibir_preco_locacao: true, fotos: { url_foto: 'https://fotos/1.jpg' },
    },
    { site: 'https://www.morescoimoveis.com.br', cidadeSlug: 'canoas' },
  );
  assert.equal(a.tipo, 'Apartamento');
  assert.equal(a.bairro, 'Marechal Rondon');
  assert.equal(a.url, 'https://www.morescoimoveis.com.br/imoveis/aluguel/canoas/mal-rondon/-/apartamento/162253/imovel/3631599');
  assert.equal(a.foto, 'https://fotos/1.jpg');
});

test('Sobressai: preço oculto pela imobiliária vira null', () => {
  const a = sobressaiParaAnuncio(
    fonte,
    { id: 1, referencia: 'C1', tipo: { nome: 'Apartamento' }, preco_locacao: 1500, exibir_preco_locacao: false },
    { site: 'https://x', cidadeSlug: 'canoas' },
  );
  assert.equal(a.aluguel, null);
});

test('HTML OPEN: lê o card sem colar o código no número de quartos', () => {
  const html = `<article><a data-ll-code="5777" href="/imoveis/apartamento-para-alugar-2-quartos-centro-canoas-5777">
    <img alt="Apartamento 2 quartos para alugar, 98m², Centro - Canoas" src="https://cdn/f.jpg"/>
    <div><span>Centro</span></div>
    <div><div><span>Apartamento</span><span>5777</span></div>
    <div><span>2<!-- --> <!-- -->quartos</span><span>98<!-- --> m²</span><span>1<!-- --> <!-- -->vaga</span></div>
    <div><span><span>Para alugar</span><span>R$ 2.200<span>/mês</span></span></span></div></div>
  </a></article>
  <article><a data-ll-code="7527" href="/imoveis/sala-comercial-para-alugar-centro-canoas-7527">x</a></article>`;
  const itens = lerCardsOpen(html, 'https://openimobiliaria.com.br');
  assert.equal(itens.length, 2);
  const [apto] = itens;
  assert.equal(apto.url, 'https://openimobiliaria.com.br/imoveis/apartamento-para-alugar-2-quartos-centro-canoas-5777');
  assert.equal(apto.tipo, 'apartamento');
  assert.equal(apto.quartos, '2');
  assert.equal(apto.vagas, '1');
  assert.equal(apto.area, '98');
  assert.equal(apto.aluguel, '2.200');
  assert.equal(apto.bairro, 'Centro');
  assert.equal(apto.cidade, 'Canoas');
});

test('HTML Ágora: lê bairro, preço e características do card', () => {
  const html = `<div class="card shadow-hover-5">
    <img class="carousel" src="https://agora.imb.br/storage/imovel-galeria/1190/a.jpg">
    <span class="badge"><span class="fs-10 position-relative">Estância Velha</span></span>
    <span class="badge"><span class="fs-10">COD.: 1190</span></span>
    <div class="card-body">
      <h2 class="card-title"><a href="https://agora.imb.br/locacao/imoveis/1190/apartamento-de-02-quartos">Apartamento de 02 quartos</a></h2>
      <p class="card-text">Apartamento com 2 quartos, 1 vaga</p>
      <ul><li title="0 Suítes"><span>2 Dormitórios</span></li><li title="1 Garagem"> 1 Garagem </li></ul>
    </div>
    <div class="card-footer"><p class="fs-17"> R$ 1.100,00 </p><span>por mês mais encargos</span></div>
  </div>`;
  const [item] = lerCardsAgora(html);
  assert.equal(item.codigo, '1190');
  assert.equal(item.bairro, 'Estância Velha');
  assert.equal(item.aluguel, '1.100,00');
  assert.equal(item.quartos, '2');
  assert.equal(item.vagas, '1');
  assert.equal(item.suites, '0');
  assert.equal(item.foto, 'https://agora.imb.br/storage/imovel-galeria/1190/a.jpg');
});

test('JSON-LD Auxiliadora: complementa com condomínio, IPTU e mobília do payload', () => {
  const lista = [{
    codigo: '722136', suites: '0',
    valores: { valor: 2500, valorCondominio: 567, valorIptu: 81 },
    caracteristicaImovel: [{ nome: 'Ar-condicionado', slug: 'ar-condicionado' }, { nome: 'Semi-Mobiliado', slug: 'semi-mobiliado' }],
    campanhas: [{ nome: 'Lançamento', slug: 'lancamento' }],
  }];
  const linha = `1e:["$","$L1f",null,{"initialData":${JSON.stringify(lista)}}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(linha)}])</script>`;
  const complemento = complementosAuxiliadora(html).get('722136');
  assert.equal(complemento.condominio, 567);
  const a = listingParaAnuncio(fonte, {
    '@type': 'RealEstateListing', name: 'Apartamento - Centro - Canoas', identifier: '722136',
    url: 'https://www.auxiliadorapredial.com.br/imovel/aluguel/722136',
    offers: [{ price: 2500, itemOffered: { accommodationCategory: 'Apartamento' } }],
  }, complemento);
  assert.equal(a.total, 3148);
  assert.equal(a.mobilia, 'semimobiliado');
  assert.equal(a.conservacao, 'novo');
});

test('Vista API: usa os campos Mobiliado e AnoConstrucao (Prime Class)', () => {
  const a = vistaParaAnuncio(
    fonte,
    { Codigo: '9345', Categoria: 'Apartamento', Mobiliado: 'Sim', SemiMobiliado: 'Nao', AnoConstrucao: '2010', DescricaoWeb: 'Amplo' },
    'https://primeclassimobiliaria.com.br/imovel/apartamento/9345',
  );
  assert.equal(a.mobilia, 'mobiliado');
  assert.equal(a.anoConstrucao, 2010);
  assert.equal(a.conservacao, null);
});

test('HTML Penteado: lê o card e soma condomínio + IPTU', () => {
  const html = `<div class="property-card">
    <a href="detalhes-imovel-locacao.php?id_imovel=PE01546"><img class="property-card__image" src="https://cdn.vistahost.com.br/penteado/f.jpg"></a>
    <div class="property-card__id"><span class="property-card__id-label">CÓD. PE01546</span></div>
    <div class="property-card__body">
      <div class="property-card__type-tag">Apartamento</div>
      <h3 class="property-card__title"><a href="detalhes-imovel-locacao.php?id_imovel=PE01546">Mato Grande</a></h3>
      <p class="property-card__location"><span>Canoas/RS</span></p>
      <div class="property-card__features">
        <div class="property-card__feature"><div><span class="property-card__feature-value">50</span><span class="property-card__feature-label">m²</span></div></div>
        <div class="property-card__feature"><div><span class="property-card__feature-value">2</span><span class="property-card__feature-label">Dormitórios</span></div></div>
        <div class="property-card__feature"><div><span class="property-card__feature-value">1</span><span class="property-card__feature-label">Vaga</span></div></div>
      </div>
      <div class="property-card__pricing">
        <a href="#"><div class="property-card__price-main"><span class="property-card__price-type">Alugar</span><span class="property-card__price-value">R$ 950</span></div></a>
        <div class="property-card__price-main"><span class="property-card__price-type">Condomínio + IPTU</span><span class="property-card__price-value">R$ 295</span></div>
      </div>
    </div>
  </div>`;
  const [item] = lerCardsPenteado(html, 'https://penteadoimoveis.com.br');
  assert.equal(item.codigo, 'PE01546');
  assert.equal(item.url, 'https://penteadoimoveis.com.br/detalhes-imovel-locacao.php?id_imovel=PE01546');
  assert.equal(item.bairro, 'Mato Grande');
  assert.equal(item.quartos, '2');
  assert.equal(item.vagas, '1');
  assert.equal(item.area, '50');
  assert.equal(item.banheiros, null);
  const a = montarAnuncio(fonte, item);
  assert.equal(a.cidade, 'Canoas');
  assert.equal(a.total, 1245);
});

test('HTML Kasa: lê o card e o tipo "Apartamento Semi mobiliado"', () => {
  const html = `<div class="box_destaques">
    <a href="detalhes_loc.php?imovel=1493&Google=CENTRO+Apartamento Semi mobiliado">
      <img src="http://www.kasaimoveis.com.br/sim/aluguel/foto_001493_01.jpg" class="img_destaques" />
      <div class="fluid tipo">Apartamento Semi mobiliado</div>
      <div class="fluid finalidade">Cod 1493</div>
    </a>
    <div class="fluid area_descricao">
      <section class="local_destaque"><span>CANOAS</span><p>CENTRO</p></section>
      <section class="txt_destaque">Kasa Imóveis aluga: apartamento com 02 dormitórios...</p></section>
      <section class="ficha_destaque">
        <li><img src="imagens/icons/area.svg">80,00m²</li>
        <li><img src="imagens/icons/dorm.svg">2 dorms</li>
        <li><img src="imagens/icons/vaga.svg">1 vagas</li>
      </section>
      <section class="valor_destaque"><p>Aluguel</p><span>R$ 1.200,00</span></section>
    </div>
  </div>`;
  const [item] = lerCardsKasa(html, 'https://www.kasaimoveis.com.br');
  assert.equal(item.url, 'https://www.kasaimoveis.com.br/detalhes_loc.php?imovel=1493');
  assert.equal(item.foto, 'https://www.kasaimoveis.com.br/sim/aluguel/foto_001493_01.jpg');
  assert.equal(item.quartos, '2');
  assert.equal(item.vagas, '1');
  assert.equal(item.area, '80,00');
  const a = montarAnuncio(fonte, item);
  assert.equal(a.tipo, 'Apartamento');
  assert.equal(a.bairro, 'Centro');
  assert.equal(a.aluguel, 1200);
  assert.equal(a.mobilia, 'semimobiliado');
});

test('HTML Página 1: lê o preço de aluguel, as características e as fotos', () => {
  const html = `<div class="featured-thumb mb-4 item hover-zoomer">
    <div class="carousel-inner">
      <div class="carousel-item active"><a href="/imoveis-locacao/160-apartamento-para-aluguel-1-quarto-s-mato-grande-canoas-ap160">
        <img class="lazyload" src="/templates/loadings/spinningwheel.gif" data-src="https://storage.widesys.com.br/objects/1"></a></div>
      <div class="carousel-item"><a href="/imoveis-locacao/160-apartamento-para-aluguel-1-quarto-s-mato-grande-canoas-ap160">
        <img class="lazyload" src="/templates/loadings/spinningwheel.gif" data-src="https://storage.widesys.com.br/objects/2"></a></div>
    </div>
    <div class="price text-white hasTooltip">
      <span class="hasTooltip" title="Aluguel"> R$ 700,00 /mês </span>
      <span class="hasTooltip" title="Venda"> R$ 120.000,00 </span>
    </div>
    <a href="/imoveis-locacao/160-apartamento-para-aluguel-1-quarto-s-mato-grande-canoas-ap160">
      <div class="featured-thumb-data bg-white shadow-one">
        <h5 class="text-secondary"> Apartamento </h5>
        <p class="product-title"> Página 1 Imóveis anuncia apartamento mobiliado no bairro Mato Grande em Canoas/RS. </p>
        <ul class="mb-0">
          <li class="hasTooltip" title="Dormitório(s)"> <span> 1 </span> Dormitório(s) </li>
          <li class="hasTooltip" title="Vagas(s)"> <span> 1 </span> Vagas(s) </li>
          <li class="hasTooltip" title="Banheiro(s)"> <span> 1 </span> Banheiro(s) </li>
          <li class="hasTooltip" title="Área total"> <span> 77 </span> m² </li>
        </ul>
      </div>
    </a>
  </div>`;
  const [item] = lerCardsPagina1(html, 'https://pagina1.imb.br');
  assert.equal(item.url, 'https://pagina1.imb.br/imoveis-locacao/160-apartamento-para-aluguel-1-quarto-s-mato-grande-canoas-ap160');
  assert.equal(item.bairro, 'Mato Grande');
  assert.equal(item.area, '77');
  const a = montarAnuncio(fonte, item);
  assert.equal(a.aluguel, 700);
  assert.equal(a.quartos, 1);
  assert.equal(a.mobilia, 'mobiliado');
  assert.deepEqual(a.fotos, ['https://storage.widesys.com.br/objects/1', 'https://storage.widesys.com.br/objects/2']);
  assert.equal(a.foto, 'https://storage.widesys.com.br/objects/1');
});
