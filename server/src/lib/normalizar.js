// Funções que transformam os dados de cada site num formato único.

export function semAcentos(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function slug(texto) {
  return semAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function limparTexto(texto) {
  if (texto == null) return null;
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo && limpo !== '$undefined' ? limpo : null;
}

/** "R$ 2.150,50" → 2150.5 · 1800 → 1800 · "1800" → 1800 · inválido/zero → null */
export function paraNumero(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? valor : null;
  let s = String(valor).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function paraInteiro(valor) {
  if (valor == null || valor === '') return null;
  const n = parseInt(String(valor).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// Tipos de imóvel considerados "apartamento" e o nome padronizado de cada um.
const TIPOS_APARTAMENTO = [
  [/cobertura/, 'Cobertura'],
  [/\bloft\b/, 'Loft'],
  [/studio|estudio/, 'Studio'],
  [/kitnet|kitinete|kit net|quitinete|\bjk\b/, 'Kitnet'],
  [/\bflat\b/, 'Flat'],
  [/garden/, 'Apartamento Garden'],
  [/duplex|triplex/, 'Apartamento Duplex'],
  [/apart|\bapto\b/, 'Apartamento'],
];

// "Loft comercial", "Sala comercial em edifício"... não são moradia
const NAO_RESIDENCIAL = /comercial|\bloja\b|\bsala\b|corporativ/;

/** Devolve o tipo padronizado se for apartamento (ou similar), senão null. */
export function tipoApartamento(tipo) {
  const t = semAcentos(tipo).toLowerCase();
  if (!t || NAO_RESIDENCIAL.test(t)) return null;
  for (const [regex, nome] of TIPOS_APARTAMENTO) {
    if (regex.test(t)) return nome;
  }
  return null;
}

// Bairros de Canoas com a grafia correta, para unificar "CENTRO", "Mal. Rondon", "Sao Jose"...
const BAIRROS_CANOAS = [
  'Bela Vista', 'Brigadeira', 'Centro', 'Estância Velha', 'Fátima', 'Guajuviras', 'Harmonia',
  'Igara', 'Industrial', 'Marechal Rondon', 'Mathias Velho', 'Mato Grande', 'Moinhos de Vento',
  'Mont Serrat', 'Niterói', 'Nossa Senhora das Graças', 'Olaria', 'Rio Branco', 'São José',
  'São Luís', 'São Vicente', 'Igara III', 'Ilha das Graças',
];
const BAIRRO_POR_SLUG = new Map(BAIRROS_CANOAS.map((b) => [slug(b), b]));
const APELIDOS_BAIRRO = new Map([
  ['mal-rondon', 'Marechal Rondon'],
  ['mal-randon', 'Marechal Rondon'],
  ['marechal-randon', 'Marechal Rondon'],
  ['n-sra-das-gracas', 'Nossa Senhora das Graças'],
  ['nsa-sra-das-gracas', 'Nossa Senhora das Graças'],
  ['nossa-sra-das-gracas', 'Nossa Senhora das Graças'],
  ['n-s-das-gracas', 'Nossa Senhora das Graças'],
  ['matias-velho', 'Mathias Velho'],
  ['sao-luis', 'São Luís'],
  ['sao-luiz', 'São Luís'],
  ['estancia-velha', 'Estância Velha'],
  ['montserrat', 'Mont Serrat'],
]);

const MINUSCULAS = new Set(['de', 'da', 'das', 'do', 'dos', 'e']);

function capitalizar(texto) {
  return texto
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export function normalizarBairro(bairro) {
  const limpo = limparTexto(bairro);
  if (!limpo) return null;
  const s = slug(limpo);
  return BAIRRO_POR_SLUG.get(s) ?? APELIDOS_BAIRRO.get(s) ?? capitalizar(limpo);
}

/**
 * Bairro de Canoas citado num texto livre ou num endereço de página
 * ("...-mato-grande-canoas-ap160"). Prefere o nome mais longo ("Igara III").
 */
export function encontrarBairro(texto) {
  const t = ` ${slug(texto).replace(/-/g, ' ')} `;
  let achado = null;
  for (const [chave, nome] of [...BAIRRO_POR_SLUG, ...APELIDOS_BAIRRO]) {
    if (t.includes(` ${chave.replace(/-/g, ' ')} `) && (!achado || chave.length > achado.chave.length)) achado = { chave, nome };
  }
  return achado?.nome ?? null;
}

export function normalizarCidade(cidade) {
  const limpo = limparTexto(cidade);
  return limpo ? capitalizar(limpo) : null;
}

// Mobília e estado do imóvel: quando a imobiliária não tem um campo próprio,
// valem as palavras do tipo, título, descrição e características do anúncio.
const SEMIMOBILIADO = /semi[\s-]?mobiliad|parcialmente mobiliad/;
const SEM_MOBILIA = /\b(nao|sem)\s+(e\s+|esta\s+|sera\s+)?mobiliad|desmobiliad|\bsem (mobilia|moveis)\b/;
// "cozinha mobiliada", "armários mobiliados": só parte dos móveis
const MOBILIA_PARCIAL = /\b(cozinha|dormitorios?|quartos?|banheiros?|armarios?)\s+(planejad[oa]s?\s+e\s+)?mobiliad[oa]s?\b/g;
const MOBILIADO = /\bmobiliad[oa]s?\b|\bcom (toda a )?mobilia\b/;

/** 'mobiliado' | 'semimobiliado' | 'sem' | null (o anúncio não diz) */
export function detectarMobilia(texto) {
  const t = semAcentos(texto).toLowerCase();
  if (SEMIMOBILIADO.test(t)) return 'semimobiliado';
  if (SEM_MOBILIA.test(t)) return 'sem';
  const semParciais = t.replace(MOBILIA_PARCIAL, ' ');
  if (MOBILIADO.test(semParciais)) return 'mobiliado';
  return semParciais !== t ? 'semimobiliado' : null;
}

const NOVO = new RegExp(
  [
    '\\b(primeira|1a|1ª|1º|1°|1o) locacao',
    '\\bnunca (foi )?(habitad|morad|ocupad|usad)',
    '\\brecem[\\s-]?(construid|entregue|inaugurad|lancad)',
    '\\blancamento\\b',
    '\\b(imovel|apartamento|apto|predio|edificio|condominio|empreendimento|loft|studio|cobertura) (totalmente |todo |bem |super )?nov[oa]\\b',
    '\\bnov[oa] (imovel|apartamento|apto|predio|edificio|empreendimento)\\b',
  ].join('|'),
);
const REFORMADO = /\breformad[oa]s?\b|\breforma (completa|total|geral|recente|nova)\b/;
// prédios com até esta idade contam como novos
const IDADE_NOVO = 5;

/** 'novo' (prédio novo, 1ª locação, lançamento) | 'reformado' | null (o anúncio não diz) */
export function detectarConservacao(texto, anoConstrucao = null) {
  if (anoConstrucao && anoConstrucao >= new Date().getFullYear() - IDADE_NOVO) return 'novo';
  const t = semAcentos(texto).toLowerCase();
  if (NOVO.test(t)) return 'novo';
  if (REFORMADO.test(t)) return 'reformado';
  return null;
}

function paraAno(valor) {
  const ano = paraInteiro(valor);
  return ano && ano >= 1900 && ano <= new Date().getFullYear() + 5 ? ano : null;
}

/**
 * Monta o anúncio no formato padrão. Campos ausentes viram null.
 * Retorna null se não for apartamento ou não tiver URL/código.
 */
export function montarAnuncio(fonte, dados) {
  const tipo = tipoApartamento(dados.tipo);
  if (!tipo || !dados.url || dados.codigo == null) return null;
  const aluguel = paraNumero(dados.aluguel);
  const condominio = paraNumero(dados.condominio);
  const iptu = paraNumero(dados.iptu);
  const anoConstrucao = paraAno(dados.anoConstrucao);
  // a descrição inteira, antes de ser cortada para guardar
  const texto = [dados.tipo, dados.titulo, dados.descricao, ...[dados.caracteristicas ?? []].flat()].filter(Boolean).join(' ');
  // galeria para ver o anúncio sem sair do site (só quando há mais de uma foto)
  const fotos = [...new Set([dados.foto, ...(dados.fotos ?? [])].filter(Boolean))].slice(0, 10);
  return {
    id: `${fonte.id}:${dados.codigo}`,
    imobiliaria: fonte.id,
    imobiliariaNome: fonte.nome,
    codigo: String(dados.codigo),
    url: dados.url,
    titulo: limparTexto(dados.titulo) ?? `${tipo} para alugar`,
    tipo,
    bairro: normalizarBairro(dados.bairro),
    cidade: normalizarCidade(dados.cidade) ?? 'Canoas',
    endereco: limparTexto(dados.endereco),
    aluguel,
    condominio,
    iptu,
    total: aluguel ? aluguel + (condominio ?? 0) + (iptu ?? 0) : null,
    quartos: paraInteiro(dados.quartos),
    suites: paraInteiro(dados.suites),
    banheiros: paraInteiro(dados.banheiros),
    vagas: paraInteiro(dados.vagas),
    area: paraNumero(dados.area),
    foto: fotos[0] ?? null,
    ...(fotos.length > 1 ? { fotos } : {}),
    descricao: limparTexto(dados.descricao)?.slice(0, 1500) ?? null,
    latitude: paraCoordenada(dados.latitude),
    longitude: paraCoordenada(dados.longitude),
    mobilia: dados.mobilia ?? detectarMobilia(texto),
    conservacao: dados.conservacao ?? detectarConservacao(texto, anoConstrucao),
    anoConstrucao,
  };
}

function paraCoordenada(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n !== 0 ? n : null;
}
