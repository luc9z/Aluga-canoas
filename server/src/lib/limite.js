// Limite de pedidos por chave (ex.: IP) numa janela de tempo, em memória.
export function criarLimite(maximo, janelaMs) {
  const pedidos = new Map();
  return function permitir(chave) {
    const agora = Date.now();
    const recentes = (pedidos.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    if (recentes.length >= maximo) {
      pedidos.set(chave, recentes);
      return false;
    }
    recentes.push(agora);
    pedidos.set(chave, recentes);
    // não deixa o mapa crescer sem fim
    if (pedidos.size > 5000) pedidos.delete(pedidos.keys().next().value);
    return true;
  };
}
