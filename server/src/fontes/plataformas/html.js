// Sites sem API nem dados estruturados: os anúncios são lidos dos cards HTML
// da página de busca. Cada site tem seu próprio "leitor de card".
import * as cheerio from 'cheerio';
import { buscarTexto, esperar } from '../../lib/http.js';
import { montarAnuncio, tipoApartamento } from '../../lib/normalizar.js';

const numeroAntes = (texto, palavra) => texto.match(new RegExp(`(\\d+)\\s*${palavra}`, 'i'))?.[1] ?? null;
const precoDe = (texto) => texto.match(/R\$\s*([\d.]+(?:,\d{2})?)/)?.[1] ?? null;
const areaDe = (texto) => texto.match(/([\d.,]+)\s*m²/)?.[1] ?? null;

// .text() do cheerio cola os textos de elementos vizinhos ("5777" + "2 quartos"
// vira "57772 quartos"); aqui cada nó de texto é separado por espaço.
function textoSeparado($, el) {
  const partes = [];
  $(el)
    .find('*')
    .addBack()
    .contents()
    .each((_, no) => {
      if (no.type === 'text') partes.push(no.data);
    });
  return partes.join(' ').replace(/\s+/g, ' ');
}

/**
 * Coleta genérica por páginas: chama lerPagina(html) em cada página até
 * não aparecer nenhum código novo ou urlDaPagina(n) devolver null.
 * Com `variantes` (ex.: tipos de imóvel), percorre as páginas de cada uma
 * chamando urlDaPagina(n, variante).
 */
export function fonteHtml({ id, nome, site, urlDaPagina, lerPagina, maxPaginas = 60, variantes = [null] }) {
  const fonte = { id, nome, site };
  return {
    ...fonte,
    plataforma: 'HTML (cards)',
    async coletar() {
      const anuncios = [];
      const vistos = new Set();
      for (const variante of variantes) {
        for (let pagina = 1; pagina <= maxPaginas; pagina++) {
          const url = urlDaPagina(pagina, variante);
          if (!url) break;
          const html = await buscarTexto(url);
          const itens = lerPagina(html, site).filter((d) => !vistos.has(d.codigo));
          if (!itens.length) break;
          for (const dados of itens) {
            vistos.add(dados.codigo);
            const anuncio = montarAnuncio(fonte, dados);
            if (anuncio) anuncios.push(anuncio);
          }
          await esperar(800);
        }
      }
      return anuncios;
    },
  };
}

/** OPEN Imobiliária: <article><a data-ll-code="5777" href="/imoveis/apartamento-para-alugar-...">. */
export function lerCardsOpen(html, site) {
  const $ = cheerio.load(html);
  const itens = [];
  $('a[data-ll-code]').each((_, el) => {
    const a = $(el);
    const href = a.attr('href') ?? '';
    if (!/para-alugar/.test(href)) return;
    const texto = textoSeparado($, el);
    const img = a.find('img').first();
    // alt: "Apartamento 2 quartos para alugar, 98m², Centro - Canoas"
    const alt = img.attr('alt') ?? '';
    const [, localizacao = ''] = alt.match(/,\s*([^,]+)$/) ?? [];
    const [bairro, cidade] = localizacao.split(' - ');
    itens.push({
      codigo: a.attr('data-ll-code'),
      url: new URL(href, site).href,
      titulo: alt || null,
      tipo: href.split('/').pop().split('-para-alugar')[0].replace(/-/g, ' '),
      bairro,
      cidade,
      aluguel: precoDe(texto),
      quartos: numeroAntes(texto, 'quartos?'),
      vagas: numeroAntes(texto, 'vagas?'),
      area: areaDe(texto),
      foto: img.attr('src'),
    });
  });
  return itens;
}

/** Ágora Cia Imobiliária: cards Bootstrap com link /locacao/imoveis/{código}/{slug}. */
export function lerCardsAgora(html) {
  const $ = cheerio.load(html);
  const itens = [];
  $('.card').each((_, el) => {
    const card = $(el);
    const link = card.find('a[href*="/locacao/imoveis/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const codigo = href.match(/\/locacao\/imoveis\/(\d+)/)?.[1];
    const texto = textoSeparado($, el);
    const titulo = card.find('.card-title').text().trim() || link.text().trim();
    const foto = card.find('img.carousel').first().attr('src') ?? card.find('img').first().attr('src');
    itens.push({
      codigo,
      url: href,
      titulo,
      // a busca já é filtrada por categorias de apartamento; o título só refina (Cobertura, Loft...)
      tipo: tipoApartamento(titulo) ? titulo : 'Apartamento',
      // o bairro aparece num selo sobre a foto, antes do "COD.:"
      bairro: card.find('span.fs-10.position-relative').first().text().trim() || null,
      cidade: 'Canoas',
      aluguel: precoDe(textoSeparado($, card.find('.card-footer'))) ?? precoDe(texto),
      quartos: numeroAntes(texto, 'Dormit[óo]rios?') ?? numeroAntes(texto, 'quartos?'),
      suites: card.find('[title$="Suítes"]').attr('title')?.match(/\d+/)?.[0],
      banheiros: numeroAntes(texto, 'Banheiros?'),
      vagas: numeroAntes(texto, 'Garage(?:m|ns)') ?? numeroAntes(texto, 'vagas?'),
      area: areaDe(texto),
      foto,
      descricao: card.find('.card-body p.card-text').last().text(),
    });
  });
  return itens;
}

/** Penteado Imóveis: cards .property-card com "CÓD. 1945" sobre a foto. */
export function lerCardsPenteado(html, site) {
  const $ = cheerio.load(html);
  const itens = [];
  $('.property-card').each((_, el) => {
    const card = $(el);
    const codigo = card.find('.property-card__id-label').text().replace(/^\s*C[ÓO]D\.?/i, '').trim();
    if (!codigo) return;
    const caracteristica = (regex) => {
      const item = card
        .find('.property-card__feature')
        .toArray()
        .find((f) => regex.test($(f).find('.property-card__feature-label').text()));
      return item ? $(item).find('.property-card__feature-value').text().trim() : null;
    };
    // pares "Alugar" → "R$ 950", "Condomínio + IPTU" → "R$ 295"
    const valores = card
      .find('.property-card__price-main')
      .toArray()
      .map((p) => [$(p).find('.property-card__price-type').text().trim(), $(p).find('.property-card__price-value').text().trim()]);
    const aluguel = valores.find(([rotulo]) => /alug/i.test(rotulo))?.[1];
    // condomínio e IPTU vêm somados num valor só; o custo total fica certo
    const [rotuloEncargos, encargos] = valores.find(([rotulo]) => /condom|iptu/i.test(rotulo)) ?? [];
    itens.push({
      codigo,
      url: new URL(`detalhes-imovel-locacao.php?id_imovel=${encodeURIComponent(codigo)}`, `${site}/`).href,
      tipo: card.find('.property-card__type-tag').text().trim(),
      bairro: card.find('.property-card__title').text().trim(),
      cidade: card.find('.property-card__location').text().split('/')[0],
      aluguel,
      condominio: /condom/i.test(rotuloEncargos ?? '') ? encargos : null,
      iptu: rotuloEncargos && !/condom/i.test(rotuloEncargos) ? encargos : null,
      quartos: caracteristica(/dormit|quarto/i),
      banheiros: caracteristica(/banheiro/i),
      vagas: caracteristica(/vaga/i),
      area: caracteristica(/m²/),
      foto: card.find('img.property-card__image').attr('src'),
    });
  });
  return itens;
}

/** Kasa Imóveis: cards .box_destaques, com todos os residenciais numa página só. */
export function lerCardsKasa(html, site) {
  const $ = cheerio.load(html);
  const itens = [];
  $('.box_destaques').each((_, el) => {
    const card = $(el);
    const codigo = card.find('a[href*="detalhes_loc.php"]').attr('href')?.match(/imovel=(\d+)/)?.[1];
    if (!codigo) return;
    const ficha = textoSeparado($, card.find('.ficha_destaque'));
    itens.push({
      codigo,
      url: new URL(`detalhes_loc.php?imovel=${codigo}`, `${site}/`).href,
      // "Apartamento", "Apartamento Semi mobiliado"...
      tipo: card.find('.tipo').text().trim(),
      bairro: card.find('.local_destaque p').text().trim(),
      cidade: card.find('.local_destaque span').text().trim(),
      aluguel: card.find('.valor_destaque span').text().trim(),
      quartos: numeroAntes(ficha, 'dorms?'),
      vagas: numeroAntes(ficha, 'vagas?'),
      area: areaDe(ficha),
      // as fotos vêm com http://, o mesmo endereço funciona com https://
      foto: card.find('img.img_destaques').attr('src')?.replace(/^http:\/\//, 'https://'),
      descricao: card.find('.txt_destaque').text(),
    });
  });
  return itens;
}
