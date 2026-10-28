import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { plural, reais } from '../formatar.js';

const EXEMPLOS = [
  '2 quartos até R$ 2.000 no Centro',
  'Kitnet mobiliada e barata',
  'Apartamento novo ou reformado com vaga',
  'O que está em alta com bom preço?',
];

function MiniCard({ anuncio, abrir }) {
  return (
    <button
      type="button"
      onClick={() => abrir(anuncio)}
      className="flex w-full gap-3 rounded-md border border-linha bg-white p-2 text-left hover:border-tinta/50"
    >
      {anuncio.foto ? (
        <img src={anuncio.foto} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-20 shrink-0 rounded object-cover" />
      ) : (
        <span className="h-16 w-20 shrink-0 rounded bg-fundo" />
      )}
      <span className="min-w-0 text-sm">
        <span className="tipo-placa block text-base">{anuncio.aluguel ? `${reais(anuncio.aluguel)}/mês` : 'A consultar'}</span>
        <span className="block truncate">
          {[anuncio.bairro, anuncio.quartos != null && plural(anuncio.quartos, 'quarto'), anuncio.area && `${Math.round(anuncio.area)} m²`]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="block truncate text-xs text-tinta-suave">{anuncio.imobiliariaNome}</span>
      </span>
    </button>
  );
}

/**
 * Conversa para buscar do jeito que a pessoa fala ("2 quartos perto do
 * Centro até 2 mil"). As respostas trazem os apartamentos ali mesmo.
 */
export default function Assistente({ abrir, aplicarFiltros, modo }) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const sessao = useRef(null);
  const fim = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens, enviando]);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);

  async function enviar(pergunta) {
    const limpa = pergunta.trim();
    if (!limpa || enviando) return;
    setTexto('');
    setMensagens((m) => [...m, { de: 'pessoa', texto: limpa }]);
    setEnviando(true);
    try {
      const r = await api.assistente(limpa, sessao.current);
      sessao.current = r.sessao;
      setMensagens((m) => [...m, { de: 'assistente', texto: r.resposta, imoveis: r.imoveis, filtros: r.filtros, total: r.total }]);
    } catch (erro) {
      setMensagens((m) => [...m, { de: 'assistente', texto: erro.message, erro: true }]);
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-4 right-4 z-30 rounded-full bg-tinta px-5 py-3 font-semibold text-white shadow-lg hover:bg-tinta/90"
      >
        ✨ Pergunte à IA
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Assistente de busca"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col border border-linha bg-white shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(640px,85vh)] sm:w-[400px] sm:rounded-xl"
    >
      <header className="flex items-center justify-between gap-3 border-b border-linha px-4 py-3">
        <div>
          <h2 className="font-semibold">Assistente de busca</h2>
          <p className="text-xs text-tinta-suave">
            {modo === 'ia' ? 'Diga o que procura, do seu jeito.' : 'Diga quartos, valor, bairro, mobília… e eu busco.'}
          </p>
        </div>
        <button type="button" onClick={() => setAberto(false)} className="text-sm font-semibold underline underline-offset-4">
          Fechar
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-fundo p-3" aria-live="polite">
        {!mensagens.length && (
          <div className="space-y-2 text-sm">
            <p>Me conte o apartamento que você procura em Canoas. Eu busco nos anúncios de todas as imobiliárias e mostro aqui mesmo.</p>
            <div className="flex flex-wrap gap-1.5">
              {EXEMPLOS.map((exemplo) => (
                <button key={exemplo} type="button" onClick={() => enviar(exemplo)} className="opcao text-xs">
                  {exemplo}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) =>
          m.de === 'pessoa' ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-lg bg-tinta px-3 py-2 text-sm text-white">
              {m.texto}
            </p>
          ) : (
            <div key={i} className="max-w-[95%] space-y-2">
              <p className={`whitespace-pre-line rounded-lg bg-white px-3 py-2 text-sm ${m.erro ? 'text-erro' : ''}`}>{m.texto}</p>
              {m.imoveis?.map((anuncio) => (
                <MiniCard key={anuncio.id} anuncio={anuncio} abrir={abrir} />
              ))}
              {m.filtros && m.total > (m.imoveis?.length ?? 0) && (
                <button
                  type="button"
                  onClick={() => {
                    aplicarFiltros(m.filtros);
                    if (window.innerWidth < 640) setAberto(false);
                  }}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Ver {plural(m.total, 'resultado')} na lista
                </button>
              )}
            </div>
          ),
        )}
        {enviando && <p className="w-fit rounded-lg bg-white px-3 py-2 text-sm text-tinta-suave">Procurando…</p>}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex gap-2 border-t border-linha p-3"
      >
        <label className="flex-1">
          <span className="sr-only">Sua mensagem</span>
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
            placeholder="Ex.: 2 quartos, mobiliado, até 2 mil"
            className="campo"
          />
        </label>
        <button type="submit" disabled={enviando || !texto.trim()} className="rounded-md bg-tinta px-4 font-semibold text-white disabled:opacity-50">
          Enviar
        </button>
      </form>
    </section>
  );
}
