// "Em alta": os anúncios mais vistos aqui no site nos últimos 7 dias, os
// favoritados, os com bom preço para o bairro e os recém-anunciados. As
// visitas são contadas por dia e guardadas como os favoritos (GitHub ou
// arquivo, veja persistencia.js), juntando várias numa gravação só.
import { BOM_PRECO } from './busca.js';
import { ONDE, documento } from './persistencia.js';

const DIAS = 7;
const DIAS_GUARDADOS = 14;
const doc = documento('visitas', { atrasoMs: ONDE === 'github' ? 10 * 60_000 : 30_000 });

/** dia (AAAA-MM-DD) → { id do anúncio → visitas } */
let visitas = {};

const dia = (msAtras = 0) => new Date(Date.now() - msAtras).toISOString().slice(0, 10);

export async function carregar() {
  visitas = (await doc.ler()) ?? {};
}

export function registrarVisita(id) {
  const hoje = dia();
  visitas[hoje] ??= {};
  visitas[hoje][id] = (visitas[hoje][id] ?? 0) + 1;
  const limite = dia(DIAS_GUARDADOS * 864e5);
  for (const d of Object.keys(visitas)) if (d < limite) delete visitas[d];
  doc.gravar(visitas).catch((erro) => console.error('Visitas:', erro.message));
}

/** id → visitas nos últimos 7 dias */
export function visitasRecentes() {
  const desde = dia((DIAS - 1) * 864e5);
  const total = new Map();
  for (const [d, porId] of Object.entries(visitas)) {
    if (d < desde) continue;
    for (const [id, n] of Object.entries(porId)) total.set(id, (total.get(id) ?? 0) + n);
  }
  return total;
}

/** Pontos e os motivos (em texto, para mostrar na tela) de um anúncio. */
export function pontuar(anuncio, { visitas: vistas = 0, favorito = false, primeiraColetaEm } = {}) {
  const motivos = [];
  let pontos = 0;
  if (vistas > 0) {
    pontos += 1.5 * Math.log2(1 + vistas);
    motivos.push(`${vistas} ${vistas === 1 ? 'visita' : 'visitas'} na semana`);
  }
  if (favorito) {
    pontos += 2;
    motivos.push('Nos favoritos');
  }
  const desconto = anuncio.abaixoDaMedia ?? 0;
  if (desconto >= BOM_PRECO) {
    pontos += Math.min(2 + 10 * (desconto - BOM_PRECO), 5);
    const quartos = anuncio.quartos >= 3 ? '3+ quartos' : anuncio.quartos === 1 ? '1 quarto' : `${anuncio.quartos} quartos`;
    motivos.push(`${Math.round(desconto * 100)}% abaixo dos de ${quartos} no bairro`);
  }
  const recente =
    primeiraColetaEm &&
    anuncio.primeiraVezEm > primeiraColetaEm &&
    Date.now() - Date.parse(anuncio.primeiraVezEm) < DIAS * 864e5;
  if (recente) {
    pontos += 1.5;
    motivos.push('Anúncio novo');
  }
  if (anuncio.conservacao === 'novo') {
    pontos += 1;
    motivos.push('Prédio novo / 1ª locação');
  } else if (anuncio.conservacao === 'reformado') {
    pontos += 0.5;
    motivos.push('Reformado');
  }
  return { pontos, motivos };
}

/** Map id → pontos, para ordenar a busca por "em alta". */
export function pontosEmAlta(anuncios, { favoritos, primeiraColetaEm }) {
  const vistas = visitasRecentes();
  return new Map(
    anuncios.map((a) => [a.id, pontuar(a, { visitas: vistas.get(a.id), favorito: favoritos.has(a.id), primeiraColetaEm }).pontos]),
  );
}

/** Os mais quentes, com os motivos. O mesmo imóvel em duas imobiliárias aparece uma vez. */
export function emAlta(anuncios, { favoritos, primeiraColetaEm, limite = 8 }) {
  const vistas = visitasRecentes();
  const ranking = anuncios
    .filter((a) => a.aluguel && a.foto)
    .map((anuncio) => ({
      anuncio,
      ...pontuar(anuncio, { visitas: vistas.get(anuncio.id), favorito: favoritos.has(anuncio.id), primeiraColetaEm }),
    }))
    .filter((item) => item.pontos > 0)
    .sort((x, y) => y.pontos - x.pontos);
  const escolhidos = [];
  const vistos = new Set();
  for (const item of ranking) {
    if (vistos.has(item.anuncio.id)) continue;
    escolhidos.push(item);
    vistos.add(item.anuncio.id);
    for (const outro of item.anuncio.tambemEm ?? []) vistos.add(outro.id);
    if (escolhidos.length === limite) break;
  }
  return escolhidos;
}
