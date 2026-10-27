// API HTTP + coleta automática periódica.
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as armazenamento from './armazenamento.js';
import { buscar, opcoesDeFiltro } from './busca.js';
import { coletaEmAndamento, coletarTudo } from './coletor.js';
import * as favoritos from './favoritos.js';
import { FONTES, FONTES_BLOQUEADAS } from './fontes/index.js';

const PORTA = Number(process.env.PORT ?? 3001);
const INTERVALO_HORAS = Number(process.env.COLETA_INTERVALO_HORAS ?? 6);

const NOMES = Object.fromEntries(FONTES.map((f) => [f.id, f.nome]));

const app = express();

app.get('/api/imoveis', (req, res) => {
  const { anuncios } = armazenamento.obter();
  res.json(buscar(req.query.favoritos === '1' ? favoritos.anunciosFavoritos(anuncios) : anuncios, req.query));
});

// Favoritos compartilhados entre todos que acessam o site.
app.get('/api/favoritos', (req, res) => {
  res.json({ ids: favoritos.ids(), armazenamento: favoritos.ARMAZENAMENTO });
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
  if (!anuncio) return res.status(404).json({ erro: 'Anúncio não encontrado' });
  res.json(anuncio);
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
await favoritos.carregar();

app.listen(PORTA, () => {
  console.log(`API em http://localhost:${PORTA}`);
  console.log(
    favoritos.ARMAZENAMENTO === 'upstash'
      ? 'Favoritos no Upstash Redis'
      : 'Favoritos em arquivo (no Render gratuito somem a cada reinício: configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN)',
  );
});

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
