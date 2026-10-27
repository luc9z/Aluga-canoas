// Leitura dos dados que sites feitos em Next.js embutem no HTML
// (self.__next_f.push), usados por mais de uma plataforma.

/** Junta os trechos do payload do Next.js num texto só. */
export function payloadNext(html) {
  let payload = '';
  const regex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const m of html.matchAll(regex)) {
    try {
      payload += JSON.parse(`"${m[1]}"`);
    } catch {
      // trecho malformado: ignora
    }
  }
  return payload;
}

/** Posição do "}" ou "]" que fecha o objeto/array JSON iniciado em `inicio`, ou -1. */
export function fimDoJson(texto, inicio) {
  let profundidade = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === '\\') i++;
      else if (c === '"') emString = false;
    } else if (c === '"') emString = true;
    else if (c === '{' || c === '[') profundidade++;
    else if ((c === '}' || c === ']') && --profundidade === 0) return i;
  }
  return -1;
}
