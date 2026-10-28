import { useEffect, useState } from 'react';
import { reais } from '../formatar.js';
import { Caracteristicas, Selos } from './CardImovel.jsx';

function linkDoMapa(anuncio) {
  const busca =
    anuncio.latitude && anuncio.longitude
      ? `${anuncio.latitude},${anuncio.longitude}`
      : [anuncio.endereco, anuncio.bairro, 'Canoas - RS'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
}

function Galeria({ fotos, indisponivel }) {
  const [atual, setAtual] = useState(0);
  const [comErro, setComErro] = useState(() => new Set());
  const visiveis = fotos.filter((f) => !comErro.has(f));
  const indice = Math.min(atual, Math.max(visiveis.length - 1, 0));

  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === 'ArrowRight') setAtual((i) => Math.min(i + 1, visiveis.length - 1));
      if (e.key === 'ArrowLeft') setAtual((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [visiveis.length]);

  if (!visiveis.length) {
    return <div className="flex aspect-[16/10] items-center justify-center bg-fundo text-tinta-suave">Sem foto</div>;
  }
  return (
    <div>
      <div className="relative aspect-[16/10] bg-tinta">
        <img
          key={visiveis[indice]}
          src={visiveis[indice]}
          alt={`Foto ${indice + 1} de ${visiveis.length}`}
          referrerPolicy="no-referrer"
          onError={() => setComErro((s) => new Set(s).add(visiveis[indice]))}
          className={`h-full w-full object-contain ${indisponivel ? 'grayscale' : ''}`}
        />
        {visiveis.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              disabled={indice === 0}
              onClick={() => setAtual(indice - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 font-bold shadow disabled:opacity-30"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              disabled={indice === visiveis.length - 1}
              onClick={() => setAtual(indice + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 font-bold shadow disabled:opacity-30"
            >
              ›
            </button>
            <span className="absolute bottom-2 right-2 rounded bg-tinta/80 px-2 py-0.5 text-xs font-semibold text-white">
              {indice + 1} / {visiveis.length}
            </span>
          </>
        )}
      </div>
      {visiveis.length > 1 && (
        <ul className="flex gap-1.5 overflow-x-auto bg-fundo p-1.5">
          {visiveis.map((foto, i) => (
            <li key={foto} className="shrink-0">
              <button
                type="button"
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === indice}
                onClick={() => setAtual(i)}
                className={`block h-14 w-20 overflow-hidden rounded border-2 ${i === indice ? 'border-tinta' : 'border-transparent opacity-70'}`}
              >
                <img src={foto} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O anúncio aberto aqui no site, sem precisar ir para o site da imobiliária. */
export default function DetalheImovel({ anuncio, favorito, alternarFavorito, fechar }) {
  useEffect(() => {
    const aoTeclar = (e) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflow;
    };
  }, [fechar]);

  const fotos = anuncio.fotos ?? (anuncio.foto ? [anuncio.foto] : []);
  const custos = [
    ['Aluguel', anuncio.aluguel],
    ['Condomínio', anuncio.condominio],
    ['IPTU', anuncio.iptu],
  ].filter(([, valor]) => valor);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="detalhe-titulo">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-tinta/60" onClick={fechar} />
      <div className="relative flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b border-linha px-4 py-3">
          <h2 id="detalhe-titulo" className="font-semibold leading-snug">
            {anuncio.titulo}
          </h2>
          <button type="button" onClick={fechar} className="shrink-0 text-sm font-semibold underline underline-offset-4">
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Galeria fotos={fotos} indisponivel={anuncio.indisponivel} />

          <div className="space-y-4 p-4">
            {anuncio.indisponivel && (
              <p className="rounded-md border border-erro/40 bg-erro/5 px-3 py-2 text-sm text-erro">
                Este anúncio não está mais no site da imobiliária. Os dados são de quando ele foi favoritado.
              </p>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="rounded-[3px] border-2 border-tinta bg-placa px-3 py-1.5 shadow-[2px_2px_0_#1F2A36]">
                {anuncio.aluguel ? (
                  <span className="tipo-placa text-3xl leading-none">
                    {reais(anuncio.aluguel)}
                    <span className="ml-0.5 text-base font-semibold">/mês</span>
                  </span>
                ) : (
                  <span className="tipo-placa text-xl leading-none">Aluguel a consultar</span>
                )}
              </div>
              {custos.length > 1 && (
                <dl className="text-sm">
                  {custos.map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex justify-between gap-6">
                      <dt className="text-tinta-suave">{rotulo}</dt>
                      <dd className="tabular-nums">{reais(valor)}</dd>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between gap-6 border-t border-linha pt-1 font-semibold">
                    <dt>Total por mês</dt>
                    <dd className="tabular-nums">{reais(anuncio.total)}</dd>
                  </div>
                </dl>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-tinta-suave">
                {[anuncio.tipo, anuncio.bairro ?? 'Bairro não informado', anuncio.endereco].filter(Boolean).join(', ')} ·{' '}
                <a href={linkDoMapa(anuncio)} target="_blank" rel="noopener noreferrer" className="font-semibold text-tinta underline underline-offset-2">
                  Ver no mapa
                </a>
              </p>
              <Caracteristicas anuncio={anuncio} />
              <Selos anuncio={anuncio} />
            </div>

            {anuncio.descricao && <p className="whitespace-pre-line text-sm leading-relaxed">{anuncio.descricao}</p>}

            <p className="text-sm text-tinta-suave">
              Anunciado por <span className="font-semibold text-tinta">{anuncio.imobiliariaNome}</span> · Cód. {anuncio.codigo}
              {anuncio.tambemEm?.length > 0 && (
                <>
                  {' '}
                  · Também em{' '}
                  {anuncio.tambemEm.map((outro, i) => (
                    <span key={outro.id}>
                      {i > 0 && ', '}
                      <a href={outro.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-tinta underline underline-offset-2">
                        {outro.imobiliariaNome}
                      </a>
                    </span>
                  ))}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-linha p-3">
          <button
            type="button"
            onClick={() => alternarFavorito(anuncio.id)}
            aria-pressed={favorito}
            className={`opcao flex-1 font-semibold ${favorito ? 'opcao-ativa' : ''}`}
          >
            {favorito ? '♥ Nos favoritos de todos' : '♡ Salvar nos favoritos'}
          </button>
          <a
            href={anuncio.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-md bg-tinta px-3 py-1.5 text-center text-sm font-semibold text-white hover:bg-tinta/90"
          >
            Falar com a imobiliária ↗
          </a>
        </div>
      </div>
    </div>
  );
}
