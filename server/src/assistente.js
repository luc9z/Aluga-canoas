// Assistente de busca: a pessoa descreve o que procura e recebe os
// apartamentos na própria conversa, sem sair do site.
//
// Com ANTHROPIC_API_KEY, quem conversa é o Claude, usando a busca do site como
// ferramenta. Sem a chave (ou se a IA falhar ou passar do limite do dia), um
// intérprete local entende os pedidos mais comuns ("2 quartos até 2 mil no
// Centro, mobiliado") e faz a busca direto.
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { buscar } from './busca.js';
import { criarLimite } from './lib/limite.js';
import { normalizarBairro, paraNumero, semAcentos, slug } from './lib/normalizar.js';

const MODELO = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';
const LIMITE_DIA = Number(process.env.ASSISTENTE_LIMITE_DIA ?? 300);
const MAX_PASSOS = 6; // chamadas à API por mensagem
const MAX_TURNOS = 12; // mensagens por conversa antes de recomeçar
const MAX_SESSOES = 300;
const SESSAO_MS = 30 * 60_000;
const MOSTRAR = 6;

const cliente = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
export const MODO = cliente ? 'ia' : 'local';

export class ErroAssistente extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

const permitirPorIp = criarLimite(15, 10 * 60_000);
let usoHoje = { dia: '', chamadas: 0 };

function dentroDoLimiteDiario() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (usoHoje.dia !== hoje) usoHoje = { dia: hoje, chamadas: 0 };
  return usoHoje.chamadas < LIMITE_DIA;
}

/** id → { id, mensagens (histórico do Claude), filtros (do intérprete local), turnos, usadoEm } */
const sessoes = new Map();

function obterSessao(id) {
  const agora = Date.now();
  for (const [chave, s] of sessoes) if (agora - s.usadoEm > SESSAO_MS) sessoes.delete(chave);
  let sessao = id && sessoes.get(id);
  if (!sessao) {
    if (sessoes.size >= MAX_SESSOES) sessoes.delete(sessoes.keys().next().value);
    sessao = { id: randomUUID(), mensagens: [], filtros: null, turnos: 0 };
    sessoes.set(sessao.id, sessao);
  }
  sessao.usadoEm = agora;
  return sessao;
}

// ---------------------------------------------------------------------------
// Intérprete local

const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4 };

function reais(numero, mil) {
  const n = paraNumero(numero);
  if (!n) return null;
  // "2 mil", "2,5 mil", "até 3"; em "entre 1.500 e 2 mil" o "mil" não vale para o 1.500
  const valor = Math.round((mil || n < 30) && n < 100 ? n * 1000 : n);
  return valor >= 200 && valor <= 50000 ? valor : null;
}

const VALOR = String.raw`(?:r\$\s*)?([\d.,]+)\s*(mil|k)?`;

/** Tira filtros de busca de um pedido em texto livre. */
export function interpretarPedido(texto, bairrosConhecidos = []) {
  const t = semAcentos(texto).toLowerCase();
  const filtros = {};
  const entendi = [];

  const quartos = t.match(/\b(\d|um|uma|dois|duas|tres|quatro)\s*(quartos?|dorms?\.?|dormitorios?)\b/);
  if (quartos) {
    filtros.quartos = String(NUMEROS[quartos[1]] ?? quartos[1]);
    entendi.push(`${filtros.quartos}+ quartos`);
  }

  const entre = t.match(new RegExp(String.raw`entre\s*${VALOR}\s*e\s*${VALOR}`));
  const maximo = t.match(new RegExp(String.raw`(?:ate|maximo|no maximo|menos de|abaixo de|por ate)\s*${VALOR}`));
  const minimo = t.match(new RegExp(String.raw`(?:a partir de|acima de|mais de|minimo)\s*${VALOR}`));
  const solto = t.match(new RegExp(String.raw`r\$\s*([\d.,]+)\s*(mil|k)?`));
  const precoMin = entre ? reais(entre[1], entre[2] ?? entre[4]) : minimo && !/m2|metros/.test(minimo[0]) ? reais(minimo[1], minimo[2]) : null;
  const precoMax = entre ? reais(entre[3], entre[4]) : maximo ? reais(maximo[1], maximo[2]) : !minimo && solto ? reais(solto[1], solto[2]) : null;
  if (precoMin) filtros.precoMin = String(precoMin);
  if (precoMax) filtros.precoMax = String(precoMax);
  if (precoMin || precoMax) {
    const fmt = (v) => `R$ ${v.toLocaleString('pt-BR')}`;
    entendi.push(precoMin && precoMax ? `entre ${fmt(precoMin)} e ${fmt(precoMax)}` : precoMax ? `até ${fmt(precoMax)}` : `a partir de ${fmt(precoMin)}`);
  }

  const area = t.match(/(\d{2,3})\s*(m2|m²|metros)/);
  if (area) {
    filtros.areaMin = area[1];
    entendi.push(`${area[1]} m² ou mais`);
  }

  const vagas = t.match(/\b(\d)\s*vagas?\b/);
  if (vagas) filtros.vagas = vagas[1];
  else if (/\b(com|tenha|ter|precisa de)\s+(uma\s+)?(vaga|garagem)|vaga de garagem/.test(t)) filtros.vagas = '1';
  if (filtros.vagas) entendi.push(`${filtros.vagas}+ ${filtros.vagas === '1' ? 'vaga' : 'vagas'}`);

  const tipos = [
    [/kitnet|kitinete|quitinete|\bjk\b/, 'Kitnet'],
    [/studio|estudio/, 'Studio'],
    [/\bloft\b/, 'Loft'],
    [/cobertura/, 'Cobertura'],
    [/\bflat\b/, 'Flat'],
  ].filter(([regex]) => regex.test(t));
  if (tipos.length) {
    filtros.tipo = tipos.map(([, nome]) => nome).join(',');
    entendi.push(tipos.map(([, nome]) => nome.toLowerCase()).join(' ou '));
  }

  if (/semi[\s-]?mobiliad/.test(t)) filtros.mobilia = 'semimobiliado';
  else if (/\bmobiliad/.test(t) && !/\b(nao|sem)\s+(precisa\s+)?(ser\s+)?mobiliad/.test(t)) filtros.mobilia = 'mobiliado';
  if (filtros.mobilia) entendi.push(filtros.mobilia);

  // "nova busca", "Novo Hamburgo" e "de novo" não falam do imóvel
  const semExpressoes = t.replace(/nova busca|novo hamburgo|de novo/g, ' ');
  const conservacao = [
    /\bnov[oa]s?\b|primeira locacao|1a locacao|lancamento|recente/.test(semExpressoes) && 'novo',
    /reformad/.test(t) && 'reformado',
  ].filter(Boolean);
  if (conservacao.length) {
    filtros.conservacao = conservacao.join(',');
    entendi.push(conservacao.join(' ou '));
  }

  const texto_ = ` ${slug(texto).replace(/-/g, ' ')} `;
  const bairros = bairrosConhecidos.filter((b) => texto_.includes(` ${slug(b).replace(/-/g, ' ')} `));
  if (bairros.length) {
    filtros.bairro = bairros.join(',');
    entendi.push(bairros.join(' ou '));
  }

  if (/bom preco|oportunidade|custo.beneficio|abaixo da media|vale a pena/.test(t)) {
    filtros.bomPreco = '1';
    entendi.push('bom preço para o bairro');
  }
  if (/em alta|mais procurad|mais vist|popular|quente/.test(t)) filtros.ordem = 'em_alta';
  else if (/grande|espacos|amplo|maior/.test(t)) filtros.ordem = 'area_desc';
  else if (/barat|em conta|economic|menor preco/.test(t)) filtros.ordem = 'total_asc';

  const extras = ['piscina', 'academia', 'churrasqueira', 'sacada', 'elevador', 'portaria'].filter((p) => t.includes(p));
  if (extras.length) {
    filtros.q = extras.join(' ');
    entendi.push(`com ${extras.join(', ')}`);
  }

  return { filtros, entendi };
}

// ordem em que os filtros são afrouxados quando nada combina com o pedido
const AFROUXAR = [
  ['q', 'os itens do condomínio'],
  ['conservacao', 'novo/reformado'],
  ['bomPreco', 'o bom preço'],
  ['areaMin', 'a área'],
  ['mobilia', 'a mobília'],
  ['vagas', 'a vaga'],
];

function responderLocal(sessao, mensagem, contexto) {
  const { filtros: novos, entendi } = interpretarPedido(mensagem, contexto.bairros);
  const recomecar = Object.keys(novos).length >= 2 || /nova busca|esquec|recomec|outra coisa/.test(semAcentos(mensagem).toLowerCase());
  let filtros = { ...(recomecar ? {} : sessao.filtros ?? {}), ...novos };
  if (!Object.keys(filtros).length) {
    return {
      resposta: 'Não entendi bem o que você procura. Experimente algo como: "2 quartos até R$ 2.000 no Centro, mobiliado" ou "kitnet barata com vaga".',
      imoveis: [],
      filtros: null,
      total: 0,
    };
  }
  const extras = { pontosEmAlta: contexto.pontosEmAlta };
  let r = buscar(contexto.anuncios, { ordem: 'total_asc', ...filtros, porPagina: String(MOSTRAR) }, extras);
  const tirados = [];
  for (const [chave, nome] of AFROUXAR) {
    if (r.total || !filtros[chave]) continue;
    const { [chave]: _, ...resto } = filtros;
    filtros = resto;
    tirados.push(nome);
    r = buscar(contexto.anuncios, { ordem: 'total_asc', ...filtros, porPagina: String(MOSTRAR) }, extras);
  }
  sessao.filtros = filtros;
  const partes = [];
  if (entendi.length) partes.push(`Entendi: ${entendi.join(' · ')}.`);
  if (tirados.length && r.total) partes.push(`Não achei nada com tudo isso; sem ${tirados.join(' e sem ')}, encontrei ${r.total}.`);
  else if (!r.total) partes.push('Não encontrei nenhum apartamento assim. Tente aumentar o valor ou tirar o bairro.');
  else partes.push(`Encontrei ${r.total} ${r.total === 1 ? 'apartamento' : 'apartamentos'}${r.total > MOSTRAR ? `; estes são os ${MOSTRAR} ${filtros.ordem === 'em_alta' ? 'mais em alta' : filtros.ordem === 'area_desc' ? 'maiores' : 'com menor custo total'}` : ''}.`);
  return { resposta: partes.join(' '), imoveis: r.itens, filtros, total: r.total };
}

// ---------------------------------------------------------------------------
// Claude

const PROMPT = `Você é o assistente do Aluga Canoas, um site que junta num só lugar os apartamentos para alugar em Canoas/RS anunciados nos sites de várias imobiliárias.

Ajude a pessoa a encontrar apartamentos que combinem com o que ela pede. Use buscar_imoveis para consultar os anúncios (pode buscar mais de uma vez, ajustando os filtros) e detalhes_imovel quando precisar da descrição completa. Recomende só anúncios que vieram das ferramentas; nunca invente anúncios, preços ou características.

Quando tiver boas opções, chame mostrar_imoveis com os ids escolhidos (até 6, na ordem de preferência): eles aparecem como cards na conversa, e a pessoa abre cada um sem sair do site. No texto, diga em poucas frases por que escolheu cada opção (preço, custo total com condomínio, bairro, tamanho, mobília, se está abaixo do preço típico do bairro). Se nada atender a tudo, mostre o que chegou mais perto e diga o que ficou de fora.

"Bom preço" quer dizer aluguel abaixo da mediana dos apartamentos do mesmo bairro com o mesmo número de quartos (campo abaixoDaMedia: 0.2 = 20% abaixo). Mobília e estado (novo/reformado) só existem quando o anúncio informa. Contato e visita são feitos com a imobiliária, pelo link do anúncio.

Responda em português do Brasil, de forma curta e direta, em texto simples, sem tabelas nem títulos.`;

const LISTA = (descricao, itens) => ({ type: 'array', description: descricao, items: itens });

const FERRAMENTAS = [
  {
    name: 'buscar_imoveis',
    description:
      'Busca apartamentos para alugar em Canoas nos anúncios coletados das imobiliárias. Todos os filtros são opcionais e se somam. Devolve o total encontrado e até 12 anúncios resumidos, na ordem pedida.',
    input_schema: {
      type: 'object',
      properties: {
        precoMin: { type: 'number', description: 'Aluguel mínimo por mês, em reais' },
        precoMax: { type: 'number', description: 'Aluguel máximo por mês, em reais (sem condomínio)' },
        quartos: { type: 'integer', description: 'Mínimo de quartos' },
        vagas: { type: 'integer', description: 'Mínimo de vagas de garagem' },
        areaMin: { type: 'number', description: 'Área mínima em m²' },
        areaMax: { type: 'number', description: 'Área máxima em m²' },
        bairros: LISTA('Bairros de Canoas (qualquer um deles)', { type: 'string' }),
        tipos: LISTA('Tipos de imóvel', {
          type: 'string',
          enum: ['Apartamento', 'Kitnet', 'Studio', 'Loft', 'Cobertura', 'Flat', 'Apartamento Garden', 'Apartamento Duplex'],
        }),
        mobilia: LISTA('Só anúncios que informam esta mobília', { type: 'string', enum: ['mobiliado', 'semimobiliado'] }),
        conservacao: LISTA('Só anúncios que informam prédio novo/1ª locação ou reforma', { type: 'string', enum: ['novo', 'reformado'] }),
        bomPreco: { type: 'boolean', description: 'Só anúncios com aluguel pelo menos 15% abaixo da mediana do bairro para o mesmo número de quartos' },
        texto: { type: 'string', description: 'Palavras que precisam aparecer no anúncio, ex.: "piscina", nome de rua ou de condomínio' },
        ordem: {
          type: 'string',
          enum: ['preco_asc', 'total_asc', 'preco_m2_asc', 'area_desc', 'recentes', 'em_alta'],
          description: 'total_asc = menor aluguel + condomínio + IPTU; em_alta = mais vistos no site e bons preços',
        },
      },
    },
  },
  {
    name: 'detalhes_imovel',
    description: 'Todos os dados de um anúncio, com a descrição completa.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'mostrar_imoveis',
    description: 'Mostra para a pessoa, como cards na conversa, os anúncios escolhidos, na ordem dada. Use depois de buscar.',
    input_schema: {
      type: 'object',
      properties: { ids: LISTA('Ids dos anúncios (até 6)', { type: 'string' }) },
      required: ['ids'],
    },
  },
];

const semVazios = (objeto) => Object.fromEntries(Object.entries(objeto).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));

const resumir = (a) =>
  semVazios({
    id: a.id,
    titulo: a.titulo?.slice(0, 90),
    tipo: a.tipo,
    bairro: a.bairro,
    aluguel: a.aluguel,
    total: a.total,
    quartos: a.quartos,
    vagas: a.vagas,
    area: a.area,
    mobilia: a.mobilia,
    conservacao: a.conservacao,
    abaixoDaMedia: a.abaixoDaMedia,
    imobiliaria: a.imobiliariaNome,
  });

const lista = (valor) => (Array.isArray(valor) ? valor.map(String) : valor ? [String(valor)] : []);
const inteiro = (valor) => (Number.isFinite(Number(valor)) && Number(valor) > 0 ? String(Math.round(Number(valor))) : undefined);

/** Converte a entrada da ferramenta nos parâmetros da busca do site. */
export function filtrosDaFerramenta(e = {}) {
  return semVazios({
    precoMin: inteiro(e.precoMin),
    precoMax: inteiro(e.precoMax),
    quartos: inteiro(e.quartos),
    vagas: inteiro(e.vagas),
    areaMin: inteiro(e.areaMin),
    areaMax: inteiro(e.areaMax),
    bairro: lista(e.bairros).map(normalizarBairro).filter(Boolean).join(','),
    tipo: lista(e.tipos).join(','),
    mobilia: lista(e.mobilia).join(','),
    conservacao: lista(e.conservacao).join(','),
    bomPreco: e.bomPreco === true ? '1' : undefined,
    q: e.texto ? String(e.texto).slice(0, 80) : undefined,
    ordem: e.ordem ? String(e.ordem) : undefined,
  });
}

function executarFerramenta(chamada, contexto, estado) {
  const entrada = chamada.input ?? {};
  if (chamada.name === 'buscar_imoveis') {
    const filtros = filtrosDaFerramenta(entrada);
    const r = buscar(contexto.anuncios, { ...filtros, porPagina: '12' }, { pontosEmAlta: contexto.pontosEmAlta });
    estado.ultimaBusca = { filtros, total: r.total };
    return JSON.stringify({ total: r.total, anuncios: r.itens.map(resumir) });
  }
  if (chamada.name === 'detalhes_imovel') {
    const anuncio = contexto.anuncios.find((a) => a.id === entrada.id);
    if (!anuncio) throw new Error(`Anúncio ${entrada.id} não encontrado`);
    const { foto, fotos, latitude, longitude, ...dados } = anuncio;
    return JSON.stringify(semVazios(dados));
  }
  if (chamada.name === 'mostrar_imoveis') {
    const porId = new Map(contexto.anuncios.map((a) => [a.id, a]));
    estado.mostrados = lista(entrada.ids).map((id) => porId.get(id)).filter(Boolean).slice(0, MOSTRAR);
    return `Mostrando ${estado.mostrados.length} anúncio(s) na conversa.`;
  }
  throw new Error(`Ferramenta desconhecida: ${chamada.name}`);
}

const textoDe = (resposta) =>
  resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n')
    .trim();

async function conversarComClaude(sessao, mensagem, contexto) {
  const inicio = sessao.mensagens.length;
  sessao.mensagens.push({ role: 'user', content: mensagem });
  const estado = { mostrados: [], ultimaBusca: null };
  const fim = (resposta) => ({
    resposta,
    imoveis: estado.mostrados,
    filtros: estado.ultimaBusca?.filtros ?? null,
    total: estado.ultimaBusca?.total ?? null,
  });
  try {
    for (let passo = 0; passo < MAX_PASSOS; passo++) {
      usoHoje.chamadas++;
      const resposta = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        // se o modelo recusar o pedido, a API tenta de novo em outro modelo (não existe para o Haiku)
        ...(MODELO.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
        output_config: { effort: 'low' },
        system: `${PROMPT}\n\nBairros com anúncios agora: ${contexto.bairros.join(', ')}.`,
        tools: FERRAMENTAS,
        messages: sessao.mensagens,
      });
      if (resposta.stop_reason === 'refusal') {
        sessao.mensagens.length = inicio;
        return fim('Não consigo ajudar com esse pedido. Me conte que tipo de apartamento você procura em Canoas.');
      }
      // o histórico só cresce: o conteúdo inteiro (inclusive o raciocínio) volta na próxima chamada
      sessao.mensagens.push({ role: 'assistant', content: resposta.content });
      if (resposta.stop_reason === 'pause_turn') continue;
      const chamadas = resposta.content.filter((bloco) => bloco.type === 'tool_use');
      if (resposta.stop_reason !== 'tool_use' || !chamadas.length) return fim(textoDe(resposta) || 'Pronto.');
      const resultados = chamadas.map((chamada) => {
        try {
          return { type: 'tool_result', tool_use_id: chamada.id, content: executarFerramenta(chamada, contexto, estado) };
        } catch (erro) {
          return { type: 'tool_result', tool_use_id: chamada.id, content: erro.message, is_error: true };
        }
      });
      sessao.mensagens.push({ role: 'user', content: resultados });
    }
    sessao.mensagens.length = inicio;
    return fim('Não consegui terminar a busca. Tente descrever de outro jeito.');
  } catch (erro) {
    sessao.mensagens.length = inicio;
    throw erro;
  }
}

/**
 * Responde uma mensagem. `contexto` traz os anúncios atuais, os bairros e a
 * pontuação "em alta" (veja index.js).
 */
export async function conversar({ sessaoId, mensagem, ip }, contexto) {
  if (!permitirPorIp(ip)) throw new ErroAssistente('Muitas mensagens seguidas. Espere alguns minutos e tente de novo.', 429);
  let sessao = obterSessao(sessaoId);
  if (sessao.turnos >= MAX_TURNOS) {
    sessoes.delete(sessao.id);
    sessao = obterSessao(null);
  }
  sessao.turnos++;
  let resultado;
  let modo = 'local';
  if (cliente && dentroDoLimiteDiario()) {
    try {
      resultado = await conversarComClaude(sessao, mensagem, contexto);
      modo = 'ia';
    } catch (erro) {
      if (erro instanceof Anthropic.RateLimitError) console.warn('Assistente: limite da API da Anthropic atingido');
      else if (erro instanceof Anthropic.AuthenticationError) console.error('Assistente: ANTHROPIC_API_KEY inválida');
      else if (erro instanceof Anthropic.APIError) console.error(`Assistente: erro da API (${erro.status ?? 'conexão'}): ${erro.message}`);
      else throw erro;
    }
  }
  resultado ??= responderLocal(sessao, mensagem, contexto);
  return { sessao: sessao.id, modo, ...resultado };
}
