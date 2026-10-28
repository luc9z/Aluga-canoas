// O laço de ferramentas do assistente, contra um servidor local que imita a
// API de mensagens da Anthropic (responde tool_use, tool_use e por fim texto).
import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';

const recebidos = [];
const respostas = [
  {
    content: [
      { type: 'thinking', thinking: '', signature: 'sig1' },
      { type: 'tool_use', id: 't1', name: 'buscar_imoveis', input: { quartos: 2, bairros: ['centro'], mobilia: ['mobiliado'] } },
    ],
    stop_reason: 'tool_use',
  },
  { content: [{ type: 'tool_use', id: 't2', name: 'mostrar_imoveis', input: { ids: ['a:1', 'nao:existe'] } }], stop_reason: 'tool_use' },
  { content: [{ type: 'text', text: 'Achei um mobiliado no Centro.' }], stop_reason: 'end_turn' },
];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    recebidos.push({ url: req.url, beta: req.headers['anthropic-beta'], corpo: JSON.parse(corpo) });
    const r = respostas[recebidos.length - 1];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: `msg_${recebidos.length}`,
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
        ...r,
      }),
    );
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
process.env.ANTHROPIC_API_KEY = 'chave-teste';
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${servidor.address().port}`;
delete process.env.ANTHROPIC_MODEL;
const { MODO, conversar } = await import('../src/assistente.js');

test.after(() => servidor.close());

const anuncios = [
  { id: 'a:1', titulo: 'Apto mobiliado', tipo: 'Apartamento', bairro: 'Centro', aluguel: 1800, quartos: 2, mobilia: 'mobiliado', imobiliariaNome: 'A' },
  { id: 'a:2', titulo: 'Apto vazio', tipo: 'Apartamento', bairro: 'Centro', aluguel: 1500, quartos: 2, imobiliariaNome: 'A' },
];
const contexto = { anuncios, bairros: ['Centro'], pontosEmAlta: new Map() };

test('busca, mostra os escolhidos e devolve a resposta do Claude', async () => {
  assert.equal(MODO, 'ia');
  const r = await conversar({ mensagem: 'ap mobiliado 2 quartos no centro', ip: '1.1.1.1' }, contexto);
  assert.equal(r.modo, 'ia');
  assert.equal(r.resposta, 'Achei um mobiliado no Centro.');
  assert.deepEqual(r.imoveis.map((a) => a.id), ['a:1']);
  assert.deepEqual(r.filtros, { quartos: '2', bairro: 'Centro', mobilia: 'mobiliado' });
  assert.equal(r.total, 1);

  const [primeira, segunda, terceira] = recebidos;
  assert.match(primeira.url, /^\/v1\/messages/);
  assert.equal(primeira.corpo.model, 'claude-opus-5-5');
  assert.equal(primeira.corpo.fallbacks, 'default');
  assert.match(primeira.beta, /server-side-fallback-2026-07-01/);
  assert.deepEqual(primeira.corpo.output_config, { effort: 'low' });
  // o resultado da busca volta como tool_result, e o histórico guarda o raciocínio intacto
  const resultado = segunda.corpo.messages.at(-1).content[0];
  assert.equal(resultado.type, 'tool_result');
  assert.equal(resultado.tool_use_id, 't1');
  assert.equal(JSON.parse(resultado.content).total, 1);
  assert.deepEqual(segunda.corpo.messages[1].content[0], { type: 'thinking', thinking: '', signature: 'sig1' });
  assert.equal(terceira.corpo.messages.length, 5);
});
