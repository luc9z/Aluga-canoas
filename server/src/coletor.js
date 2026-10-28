// Roda todos os coletores, junta os resultados e salva.
import * as armazenamento from './armazenamento.js';
import { CIDADE, FONTES } from './fontes/index.js';
import { slug } from './lib/normalizar.js';

let coletaAtual = null;

export function coletaEmAndamento() {
  return coletaAtual !== null;
}

/**
 * Coleta todas as fontes em paralelo. Uma fonte com erro mantém os anúncios
 * da coleta anterior, para o sistema não "esvaziar" quando um site cai.
 * Chamadas simultâneas reaproveitam a coleta em andamento.
 */
export function coletarTudo({ log = console.log } = {}) {
  coletaAtual ??= executar(log).finally(() => {
    coletaAtual = null;
  });
  return coletaAtual;
}

async function executar(log) {
  const anterior = armazenamento.obter();
  const primeiraVez = new Map(anterior.anuncios.map((a) => [a.id, a.primeiraVezEm]));
  const agora = new Date().toISOString();
  // anúncios da primeira coleta não contam como "novos"
  const primeiraColetaEm = anterior.primeiraColetaEm ?? agora;

  const resultados = await Promise.all(
    FONTES.map(async (fonte) => {
      const inicio = Date.now();
      try {
        const anuncios = (await fonte.coletar()).filter((a) => slug(a.cidade) === slug(CIDADE));
        log(`✔ ${fonte.nome}: ${anuncios.length} apartamentos`);
        return { fonte, anuncios, status: { ok: true, total: anuncios.length, erro: null }, duracaoMs: Date.now() - inicio };
      } catch (erro) {
        log(`✘ ${fonte.nome}: ${erro.message}`);
        const antigos = anterior.anuncios.filter((a) => a.imobiliaria === fonte.id);
        return { fonte, anuncios: antigos, status: { ok: false, total: antigos.length, erro: erro.message }, duracaoMs: Date.now() - inicio };
      }
    }),
  );

  const fontes = {};
  const anuncios = [];
  for (const { fonte, anuncios: lista, status, duracaoMs } of resultados) {
    const statusAnterior = anterior.fontes?.[fonte.id];
    fontes[fonte.id] = {
      ...status,
      duracaoMs,
      ultimaTentativa: agora,
      ultimoSucesso: status.ok ? agora : statusAnterior?.ultimoSucesso ?? null,
    };
    // nem os da primeira coleta de uma imobiliária que acabou de entrar no sistema
    const desde = statusAnterior?.ultimoSucesso ? agora : primeiraColetaEm;
    const ids = new Set();
    for (const anuncio of lista) {
      if (ids.has(anuncio.id)) continue;
      ids.add(anuncio.id);
      anuncios.push({ ...anuncio, primeiraVezEm: primeiraVez.get(anuncio.id) ?? desde });
    }
  }

  marcarRepetidos(anuncios);
  marcarBomPreco(anuncios);
  const estado = { anuncios, fontes, atualizadoEm: agora, primeiraColetaEm };
  await armazenamento.salvar(estado);
  log(`Total: ${anuncios.length} apartamentos de ${FONTES.length} imobiliárias`);
  return estado;
}

/**
 * O mesmo apartamento costuma ser anunciado por mais de uma imobiliária.
 * Anúncios com mesmo bairro, quartos, área e aluguel de imobiliárias
 * diferentes ganham "tambemEm" apontando uns para os outros.
 */
export function marcarRepetidos(anuncios) {
  const grupos = new Map();
  for (const a of anuncios) {
    delete a.tambemEm;
    if (!a.bairro || !a.area || !a.aluguel) continue;
    const chave = [a.bairro, a.quartos ?? '', Math.round(a.area), Math.round(a.aluguel)].join('|');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(a);
  }
  for (const grupo of grupos.values()) {
    if (new Set(grupo.map((a) => a.imobiliaria)).size < 2) continue;
    for (const a of grupo) {
      a.tambemEm = grupo
        .filter((outro) => outro.imobiliaria !== a.imobiliaria)
        .map((outro) => ({ id: outro.id, imobiliariaNome: outro.imobiliariaNome, url: outro.url }));
    }
  }
}

/**
 * Compara o aluguel de cada anúncio com a mediana dos apartamentos do mesmo
 * bairro e com o mesmo número de quartos (1, 2, 3 ou mais), quando há pelo
 * menos 5 para comparar. abaixoDaMedia = 0.18 quer dizer 18% mais barato que o
 * típico. Diferenças acima de 60% costumam ser erro de digitação no preço e
 * ficam de fora.
 */
export function marcarBomPreco(anuncios) {
  const grupos = new Map();
  for (const a of anuncios) {
    delete a.abaixoDaMedia;
    if (!a.bairro || !a.aluguel || !a.quartos) continue;
    const chave = `${a.bairro}|${Math.min(a.quartos, 3)}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(a);
  }
  for (const grupo of grupos.values()) {
    if (grupo.length < 5) continue;
    const valores = grupo.map((a) => a.aluguel).sort((x, y) => x - y);
    const meio = Math.floor(valores.length / 2);
    const mediana = valores.length % 2 ? valores[meio] : (valores[meio - 1] + valores[meio]) / 2;
    for (const a of grupo) {
      const desconto = 1 - a.aluguel / mediana;
      if (desconto > 0 && desconto <= 0.6) a.abaixoDaMedia = Math.round(desconto * 100) / 100;
    }
  }
}
