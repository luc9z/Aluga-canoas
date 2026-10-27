import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const INTERVALO_MS = 30_000;

/**
 * Favoritos compartilhados: ficam no servidor e todo mundo que abre o site vê
 * os mesmos. A lista é relida a cada 30 s e ao voltar para a aba, para
 * aparecer o que outras pessoas marcaram.
 */
export function useFavoritos() {
  const [favoritos, setFavoritos] = useState(() => new Set());
  const [erro, setErro] = useState(null);
  const atuais = useRef(favoritos);
  atuais.current = favoritos;

  const recarregar = useCallback(() => {
    api
      .favoritos()
      .then((r) => setFavoritos(new Set(r.ids)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    recarregar();
    const id = setInterval(() => document.visibilityState === 'visible' && recarregar(), INTERVALO_MS);
    window.addEventListener('focus', recarregar);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', recarregar);
    };
  }, [recarregar]);

  const alternar = useCallback(async (id) => {
    const marcar = !atuais.current.has(id);
    const aplicar = (incluir) =>
      setFavoritos((atual) => {
        const novo = new Set(atual);
        if (incluir) novo.add(id);
        else novo.delete(id);
        return novo;
      });
    aplicar(marcar); // muda o coração na hora; o servidor confirma em seguida
    try {
      const r = await (marcar ? api.favoritar(id) : api.desfavoritar(id));
      setFavoritos(new Set(r.ids));
      setErro(null);
    } catch {
      aplicar(!marcar);
      setErro('Não foi possível salvar o favorito. Tente de novo.');
    }
  }, []);

  return { favoritos, alternar, erro };
}
