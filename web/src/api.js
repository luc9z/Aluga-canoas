async function pedir(caminho, opcoes) {
  const resp = await fetch(`/api${caminho}`, opcoes);
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => null);
    throw new Error(corpo?.erro ?? `O servidor respondeu ${resp.status} em ${caminho}`);
  }
  return resp.json();
}

const enviarJson = (corpo) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

export const api = {
  imoveis: (params) => pedir(`/imoveis?${new URLSearchParams(params)}`),
  imovel: (id) => pedir(`/imoveis/${encodeURIComponent(id)}`),
  emAlta: () => pedir('/em-alta'),
  filtros: () => pedir('/filtros'),
  fontes: () => pedir('/fontes'),
  coletar: () => pedir('/coletar', { method: 'POST' }),
  favoritos: () => pedir('/favoritos'),
  favoritar: (id) => pedir(`/favoritos/${encodeURIComponent(id)}`, { method: 'PUT' }),
  desfavoritar: (id) => pedir(`/favoritos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assistente: (mensagem, sessao) => pedir('/assistente', enviarJson({ mensagem, sessao })),
  // conta uma visita para o "Em alta"; falhar aqui não atrapalha nada
  visita: (id) => fetch(`/api/imoveis/${encodeURIComponent(id)}/visita`, { method: 'POST' }).catch(() => {}),
};
