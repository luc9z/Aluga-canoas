// API HTTP + coleta automática periódica.
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as armazenamento from './armazenamento.js';
import * as assistente from './assistente.js';
import { buscar, opcoesDeFiltro } from './busca.js';
import { coletaEmAndamento, coletarTudo, marcarBomPreco } from './coletor.js';
import * as emAlta from './emAlta.js';
import * as favoritos from './favoritos.js';
import { FONTES, FONTES_BLOQUEADAS } from './fontes/index.js';
import { criarLimite } from './lib/limite.js';
import { ONDE, gravarPendentes } from './persistencia.js';

const PORTA = Number(process.env.PORT ?? 3001);
const INTERVALO_HORAS = Number(process.env.COLETA_INTERVALO_HORAS ?? 6);

const NOMES = Object.fromEntries(FONTES.map((f) => [f.id, f.nome]));

const app = express();
// no Render a API fica atrás de um proxy: req.ip passa a ser o IP de quem acessa
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

function pontosEmAlta(anuncios) {
  const { primeiraColetaEm } = armazenamento.obter();
  return emAlta.pontosEmAlta(anuncios, { favoritos: new Set(favoritos.ids()), primeiraColetaEm });
}

app.get('/api/imoveis', (req, res) => {
  const { anuncios } = armazenamento.obter();
  const lista = req.query.favoritos === '1' ? favoritos.anunciosFavoritos(anuncios) : anuncios;
  res.json(buscar(lista, req.query, req.query.ordem === 'em_alta' ? { pontosEmAlta: pontosEmAlta(lista) } : {}));
});

// Os mais quentes agora: mais vistos aqui no site, favoritos e bons preços para o bairro.
app.get('/api/em-alta', (req, res) => {
  const { anuncios, primeiraColetaEm } = armazenamento.obter();
  const ranking = emAlta.emAlta(anuncios, { favoritos: new Set(favoritos.ids()), primeiraColetaEm });
  res.json(ranking.map(({ anuncio, motivos }) => ({ ...anuncio, motivos })));
});

// Favoritos compartilhados entre todos que acessam o site.
app.get('/api/favoritos', (req, res) => {
  res.json({ ids: favoritos.ids(), armazenamento: ONDE });
});

app.put('/api/favoritos/:id', async (req, res) => {
  const anuncio = armazenamento.obter().anuncios.find((a) => a.id === req.params.id);
  if (!anuncio) return res.status(404).json({ erro: 'Anúncio não encontrado' });
  try {
    await favoritos.adicionar(anuncio);
    res.json({ ids: favoritos.ids() });
  } catch (erro) {
    res.status(erro.status ?? 500).json({ erro: erro.message });
  }
});

app.delete('/api/favoritos/:id', async (req, res) => {
  try {
    await favoritos.remover(req.params.id);
    res.json({ ids: favoritos.ids() });
  } catch (erro) {
    res.status(erro.status ?? 500).json({ erro: erro.message });
  }
});

app.get('/api/imoveis/:id', (req, res) => {
  const anuncio = armazenamento.obter().anuncios.find((a) => a.id === req.params.id);
  const copia = !anuncio && favoritos.copia(req.params.id);
  if (!anuncio && !copia) return res.status(404).json({ erro: 'Anúncio não encontrado' });
  res.json(anuncio ?? { ...copia, indisponivel: true });
});

// Cada vez que alguém abre um anúncio no site; alimenta o "Em alta".
const permitirVisita = criarLimite(60, 10 * 60_000);
app.post('/api/imoveis/:id/visita', (req, res) => {
  if (!permitirVisita(req.ip)) return res.status(429).end();
  if (armazenamento.obter().anuncios.some((a) => a.id === req.params.id)) emAlta.registrarVisita(req.params.id);
  res.status(204).end();
});

app.post('/api/assistente', async (req, res) => {
  const mensagem = String(req.body?.mensagem ?? '')
    .trim()
    .slice(0, 500);
  if (!mensagem) return res.status(400).json({ erro: 'Escreva o que você procura' });
  const { anuncios } = armazenamento.obter();
  const contexto = {
    anuncios,
    bairros: opcoesDeFiltro(anuncios, NOMES).bairros.map((b) => b.nome),
    pontosEmAlta: pontosEmAlta(anuncios),
  };
  try {
    res.json(await assistente.conversar({ sessaoId: req.body.sessao, mensagem, ip: req.ip }, contexto));
  } catch (erro) {
    if (!erro.status) console.error('Assistente:', erro);
    res.status(erro.status ?? 500).json({ erro: erro.status ? erro.message : 'O assistente falhou. Tente de novo.' });
  }
});

app.get('/api/filtros', (req, res) => {
  res.json(opcoesDeFiltro(armazenamento.obter().anuncios, NOMES));
});

app.get('/api/fontes', (req, res) => {
  const { fontes, atualizadoEm, primeiraColetaEm } = armazenamento.obter();
  res.json({
    atualizadoEm,
    primeiraColetaEm,
    coletando: coletaEmAndamento(),
    assistente: assistente.MODO,
    fontes: FONTES.map((f) => ({ id: f.id, nome: f.nome, site: f.site, plataforma: f.plataforma, ...fontes?.[f.id] })),
    bloqueadas: FONTES_BLOQUEADAS,
  });
});

app.post('/api/coletar', (req, res) => {
  const jaRodando = coletaEmAndamento();
  coletarTudo().catch((erro) => console.error('Falha na coleta:', erro));
  res.status(202).json({ coletando: true, jaRodando });
});

// Em produção o servidor também entrega o front-end compilado (web/dist).
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

await armazenamento.carregar();
// dados salvos antes de existir a comparação com o bairro
marcarBomPreco(armazenamento.obter().anuncios);
await Promise.all([favoritos.carregar(), emAlta.carregar()]);

app.listen(PORTA, () => {
  console.log(`API em http://localhost:${PORTA}`);
  console.log(
    ONDE === 'github'
      ? 'Favoritos e visitas no GitHub (branch "dados")'
      : 'Favoritos e visitas em arquivo (no Render gratuito somem a cada reinício: configure GITHUB_TOKEN)',
  );
  console.log(assistente.MODO === 'ia' ? 'Assistente com IA (Claude)' : 'Assistente sem IA (configure ANTHROPIC_API_KEY para usar o Claude)');
});

// o Render manda SIGTERM antes de desligar: grava o que estiver esperando
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.once(sinal, async () => {
    await gravarPendentes();
    process.exit(0);
  });
}

const { atualizadoEm } = armazenamento.obter();
const desatualizado =
  !atualizadoEm || (INTERVALO_HORAS > 0 && Date.now() - Date.parse(atualizadoEm) > INTERVALO_HORAS * 3600_000);
if (desatualizado) {
  console.log('Dados ausentes ou antigos: iniciando coleta...');
  coletarTudo().catch((erro) => console.error('Falha na coleta:', erro));
}
if (INTERVALO_HORAS > 0) {
  setInterval(() => coletarTudo().catch((erro) => console.error('Falha na coleta:', erro)), INTERVALO_HORAS * 3600_000);
}
