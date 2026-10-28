import { plural, reais } from '../formatar.js';

/** Faixa com os anúncios mais quentes e o motivo de cada um estar ali. */
export default function EmAlta({ itens, abrir }) {
  if (!itens?.length) return null;
  return (
    <section aria-labelledby="em-alta-titulo" className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="em-alta-titulo" className="text-xl font-semibold">
          🔥 Em alta
        </h2>
        <p className="text-sm text-tinta-suave">Os mais vistos aqui no site, favoritos e bons preços para o bairro</p>
      </div>
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {itens.map((anuncio) => (
          <li key={anuncio.id} className="w-60 shrink-0 snap-start">
            <button
              type="button"
              onClick={() => abrir(anuncio)}
              className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-linha bg-white text-left hover:border-tinta/50"
            >
              <div className="relative aspect-[4/3] w-full bg-fundo">
                <img src={anuncio.foto} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-[3px] border-2 border-tinta bg-placa px-2 py-0.5 shadow-[2px_2px_0_#1F2A36]">
                  <span className="tipo-placa text-lg leading-none">{reais(anuncio.aluguel)}</span>
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                <span className="font-semibold">
                  {[anuncio.bairro, anuncio.quartos != null && plural(anuncio.quartos, 'quarto')].filter(Boolean).join(' · ')}
                </span>
                <ul className="mt-auto space-y-0.5 text-xs text-ok">
                  {anuncio.motivos.slice(0, 2).map((motivo) => (
                    <li key={motivo}>{motivo}</li>
                  ))}
                </ul>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
