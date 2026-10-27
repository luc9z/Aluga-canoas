# Aluga Canoas: agregador de apartamentos para alugar

Busca os apartamentos para alugar em **Canoas/RS** direto nos sites das imobiliárias e mostra tudo numa tela só, com filtros por preço, quartos, vagas, área, mobília, estado do imóvel (novo ou reformado), bairro, tipo e imobiliária.

Cada anúncio leva para a página original da imobiliária, onde se faz o contato.

## Imobiliárias incluídas

| Imobiliária | Site | Como os dados são lidos |
|---|---|---|
| Auxiliadora Predial | auxiliadorapredial.com.br | Dados estruturados schema.org (JSON-LD) + lista da busca embutida na página (condomínio, IPTU, características) |
| Imobiliária Gestão | imobiliariagestao.com.br | API GraphQL do site (plataforma Sobressai) |
| Moresco Imóveis | morescoimoveis.com.br | API GraphQL do site (plataforma Sobressai) |
| Gallina Imóveis | gallinaimoveis.com.br | Dados do CRM Vista embutidos na página |
| Imobiliária Lottici | imobiliarialottici.com.br | Dados do CRM Vista embutidos na página |
| Prime Class Imobiliária | primeclassimobiliaria.com.br | API do CRM Vista usada pelo site |
| OPEN Imobiliária | openimobiliaria.com.br | Leitura dos cards HTML |
| Ágora Cia Imobiliária | agora.imb.br | Leitura dos cards HTML |
| Penteado Imóveis | penteadoimoveis.com.br | Leitura dos cards HTML |
| Kasa Imóveis | kasaimoveis.com.br | Leitura dos cards HTML |

Na coleta de 27/out/2026 foram **837 apartamentos** em cerca de 25 segundos.

Algumas imobiliárias de Canoas **bloqueiam leitura automática** (Vila Rica, Brandalise, Aurora, Crédito Real e Benin). Elas aparecem na tela "Imobiliárias pesquisadas", com link para consultar direto no site. O sistema não tenta burlar esses bloqueios.

## Como rodar

Requisitos: **Node.js 18.18 ou mais novo**.

```bash
npm install
npm run dev
```

- Interface: http://localhost:5173
- API: http://localhost:3001

Na primeira vez o servidor já começa a coletar os anúncios sozinho (cerca de 1 minuto). Depois disso a coleta se repete **a cada 6 horas**. Também dá para atualizar pelo botão **Atualizar anúncios** ou pelo terminal:

```bash
npm run coletar
```

### Produção (um único servidor)

```bash
npm run build   # compila a interface em web/dist
npm start       # API + interface em http://localhost:3001
```

### Hospedar no Render

O arquivo `render.yaml` já descreve o serviço. No [Render](https://render.com): **New > Blueprint**, escolha este repositório e confirme. O endereço fica em `https://aluga-canoas.onrender.com` (ou parecido).

No plano gratuito o servidor dorme depois de 15 minutos sem acesso e o disco não é permanente: ao acordar ele refaz a coleta (cerca de 1 minuto, a tela mostra "Buscando anúncios…").

Por isso os **favoritos** precisam de um banco fora do Render, senão somem a cada reinício. O [Upstash](https://upstash.com) tem Redis gratuito:

1. Crie a conta e um banco Redis (região mais próxima do servidor do Render, ex.: `us-east-1`).
2. Na página do banco, em **REST API**, copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
3. No Render, cole os dois valores nas variáveis de ambiente do serviço (o Blueprint já pede por eles).

O log do servidor diz onde os favoritos estão sendo guardados ("Favoritos no Upstash Redis" ou "Favoritos em arquivo").

### Configuração (variáveis de ambiente)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3001` | Porta da API |
| `COLETA_INTERVALO_HORAS` | `6` | Intervalo da coleta automática (`0` desliga) |
| `PASTA_DADOS` | `server/data` | Onde ficam o `imoveis.json` com os anúncios e o `favoritos.json` (sem Upstash) |
| `UPSTASH_REDIS_REST_URL` | — | Endereço REST do Redis do Upstash, para os favoritos |
| `UPSTASH_REDIS_REST_TOKEN` | — | Token do Redis do Upstash |

## Recursos da interface

- Filtros por aluguel (mínimo/máximo e atalhos "até R$ 2.000"), quartos, vagas, área, bairro, tipo (apartamento, kitnet, cobertura, loft…) e imobiliária
- **Mobília** (mobiliado, semimobiliado) e **estado do imóvel** (novo/1ª locação, reformado). Vêm do campo da imobiliária quando o site tem um (Prime Class, Auxiliadora) ou das palavras do anúncio ("semimobiliado", "primeira locação", "todo reformado"…). Prédio com ano de construção dos últimos 5 anos conta como novo. Anúncio que não fala disso não entra nesses filtros
- Busca por texto (rua, condomínio, "mobiliado", "piscina"…), sem diferença de acentos
- Ordenação por menor aluguel, menor custo total (aluguel + condomínio + IPTU, quando a imobiliária informa), menor preço por m², maior área e mais recentes
- **Favoritos compartilhados**: o coração salva no servidor, e todo mundo que abre o site vê e altera a mesma lista (a tela relê a cada 30 segundos). Um favorito que sai do site da imobiliária continua na lista como "Não está mais anunciado"
- Selo **Anúncio novo** nos anúncios que apareceram nas últimas 48 horas
- **Repetidos**: o mesmo apartamento anunciado por duas imobiliárias (mesmo bairro, quartos, área e aluguel) mostra "Também anunciado por…", e há um filtro para esconder as cópias
- Os filtros ficam na URL: dá para salvar a busca nos favoritos do navegador ou compartilhar
- Funciona no celular (os filtros abrem numa gaveta lateral)

## Como funciona

```
server/src/
├── index.js              API (Express) + coleta automática
├── coletor.js            roda todas as fontes em paralelo, junta e salva
├── busca.js              filtros, ordenação e paginação
├── armazenamento.js      leitura e gravação de data/imoveis.json
├── favoritos.js          favoritos compartilhados (Upstash Redis ou data/favoritos.json)
├── lib/
│   ├── http.js           requisições com timeout, novas tentativas e pausa entre páginas
│   ├── next.js           leitura dos dados que sites Next.js embutem no HTML
│   └── normalizar.js     formato único: preço, tipo, bairro ("Mal. Rondon" → "Marechal Rondon"), mobília, novo/reformado…
└── fontes/
    ├── index.js          cadastro das imobiliárias
    └── plataformas/      um leitor por plataforma de site
        ├── jsonld.js     schema.org RealEstateListing (+ complemento da Auxiliadora)
        ├── sobressai.js  API GraphQL da Sobressai
        ├── vista.js      CRM Vista (API ou dados embutidos na página)
        └── html.js       leitura de cards HTML (OPEN, Ágora, Penteado, Kasa)
web/src/                  interface React + Tailwind
```

Se um site estiver fora do ar na hora da coleta, os anúncios dele da coleta anterior continuam aparecendo, e a tela de imobiliárias mostra o erro.

### Adicionar uma imobiliária

1. Abra o site da imobiliária e descubra a plataforma. Fotos em `cdn.vistahost.com.br` indicam Vista; `fotos.sobressai.com.br`, Sobressai; `"RealEstateListing"` no código-fonte da busca, JSON-LD.
2. Se for uma plataforma já suportada, basta uma entrada em `server/src/fontes/index.js`. Por exemplo, um site Vista:
   ```js
   fonteVistaSite({ id: 'nova', nome: 'Imobiliária Nova', site: 'https://www.imobiliarianova.com.br' }),
   ```
   Para Sobressai, `codsite` e `idCidade` aparecem no `__NEXT_DATA__` da página (`codsite` e `allDataHome.cidades`).
3. Se não for, escreva um leitor de cards em `plataformas/html.js`, no modelo de `lerCardsOpen`, e um teste em `server/test/plataformas.test.js`.
4. Rode `npm run coletar` e confira a contagem.

Sites mudam de layout com o tempo. Quando uma imobiliária passar a aparecer com erro ou com 0 apartamentos, o leitor dela precisa de ajuste.

## Testes

```bash
npm test
```

Os testes cobrem a leitura de cada plataforma (com trechos do HTML/JSON real dos sites), a normalização dos dados e os filtros da busca.

## Uso responsável

- A coleta faz poucas requisições, uma página por vez com pausa entre elas, e respeita o `robots.txt` de cada site (conferido em out/2026)
- Não burla proteções anti-robô: sites que bloqueiam ficam de fora
- Todo anúncio aponta para o site da imobiliária, que continua sendo onde o contato acontece
- Feito para uso pessoal. Antes de publicar o sistema para outras pessoas, confira os termos de uso de cada site ou peça autorização às imobiliárias
