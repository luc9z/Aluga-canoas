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
| Página 1 Imóveis | pagina1.imb.br | Leitura dos cards HTML (site WideSys) |

Na coleta de 27/out/2026 foram **837 apartamentos** em cerca de 25 segundos.

Algumas imobiliárias de Canoas **bloqueiam leitura automática** (Vila Rica, Brandalise, Aurora, Crédito Real e Benin). Elas aparecem na tela "Imobiliárias pesquisadas", com link para consultar direto no site. O sistema não tenta burlar esses bloqueios.

O QuintoAndar não tem API pública de anúncios (out/2026), e o `robots.txt` dele proíbe robôs na busca (`/busca`), por isso ele não entra.

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

Por isso os **favoritos** e as **visitas** (que alimentam o "Em alta") são guardados no próprio GitHub, como arquivos JSON no branch `dados` deste repositório (o Render só publica o `main`, então essas gravações não disparam deploy). Para isso o servidor precisa de um token:

1. No GitHub: **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
2. Em **Repository access**, escolha só este repositório; em **Permissions > Contents**, marque **Read and write**.
3. No Render, cole o token na variável `GITHUB_TOKEN` (o Blueprint já pede por ela). O repositório vem sozinho do Render (`RENDER_GIT_REPO_SLUG`).

Sem token, favoritos e visitas ficam num arquivo local e somem quando o Render reinicia. O log do servidor diz onde estão sendo guardados.

O **assistente com IA** usa o Claude, da Anthropic: crie uma chave em [console.anthropic.com](https://console.anthropic.com) e cole em `ANTHROPIC_API_KEY`. Cada mensagem é cobrada pela Anthropic, e o servidor limita a 15 mensagens por pessoa a cada 10 minutos e a 300 chamadas por dia (`ASSISTENTE_LIMITE_DIA`). Sem a chave, o assistente continua funcionando com um intérprete simples, que entende pedidos como "2 quartos até 2 mil no Centro, mobiliado".

### Configuração (variáveis de ambiente)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3001` | Porta da API |
| `COLETA_INTERVALO_HORAS` | `6` | Intervalo da coleta automática (`0` desliga) |
| `PASTA_DADOS` | `server/data` | Onde ficam o `imoveis.json` com os anúncios (e favoritos/visitas, sem `GITHUB_TOKEN`) |
| `GITHUB_TOKEN` | — | Token com acesso de escrita ao conteúdo do repositório, para guardar favoritos e visitas |
| `GITHUB_REPO` | `RENDER_GIT_REPO_SLUG` | Repositório onde guardar (`dono/repo`) |
| `GITHUB_BRANCH_DADOS` | `dados` | Branch onde ficam os arquivos de dados |
| `ANTHROPIC_API_KEY` | — | Chave da API da Anthropic, para o assistente com IA |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Modelo do assistente (ex.: `claude-haiku-5-5`, bem mais barato) |
| `ASSISTENTE_LIMITE_DIA` | `300` | Chamadas à IA por dia; passando disso, o assistente usa o intérprete simples |

## Recursos da interface

- Filtros por aluguel (mínimo/máximo e atalhos "até R$ 2.000"), quartos, vagas, área, bairro, tipo (apartamento, kitnet, cobertura, loft…) e imobiliária
- **Mobília** (mobiliado, semimobiliado) e **estado do imóvel** (novo/1ª locação, reformado). Vêm do campo da imobiliária quando o site tem um (Prime Class, Auxiliadora) ou das palavras do anúncio ("semimobiliado", "primeira locação", "todo reformado"…). Prédio com ano de construção dos últimos 5 anos conta como novo. Anúncio que não fala disso não entra nesses filtros
- Busca por texto (rua, condomínio, "mobiliado", "piscina"…), sem diferença de acentos
- Ordenação por menor aluguel, em alta, menor custo total (aluguel + condomínio + IPTU, quando a imobiliária informa), menor preço por m², maior área e mais recentes
- **Assistente** ("Pergunte à IA"): a pessoa descreve o que quer do seu jeito e os apartamentos aparecem na própria conversa, com um botão para ver todos os resultados na lista
- **Detalhes no próprio site**: clicar num anúncio abre fotos (galeria, quando a imobiliária publica várias), custos, características, descrição e mapa; o site da imobiliária fica num botão, para quando for falar com ela. O link do navegador aponta para o anúncio aberto
- **Em alta**: no topo da lista, os mais vistos aqui no site na última semana, os favoritados, os com bom preço para o bairro e os recém-anunciados, cada um com o motivo
- **Bom preço**: aluguel pelo menos 15% abaixo da mediana dos apartamentos do mesmo bairro com o mesmo número de quartos (1, 2, 3 ou mais; só quando há 5 ou mais para comparar), com selo no card e filtro
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
├── persistencia.js       documentos JSON no branch "dados" do GitHub (ou em arquivo)
├── favoritos.js          favoritos compartilhados
├── emAlta.js             visitas por dia e a pontuação do "Em alta"
├── assistente.js         assistente: Claude com a busca como ferramenta, ou intérprete local
├── lib/
│   ├── http.js           requisições com timeout, novas tentativas e pausa entre páginas
│   ├── limite.js         limite de pedidos por IP
│   ├── next.js           leitura dos dados que sites Next.js embutem no HTML
│   └── normalizar.js     formato único: preço, tipo, bairro ("Mal. Rondon" → "Marechal Rondon"), mobília, novo/reformado…
└── fontes/
    ├── index.js          cadastro das imobiliárias
    └── plataformas/      um leitor por plataforma de site
        ├── jsonld.js     schema.org RealEstateListing (+ complemento da Auxiliadora)
        ├── sobressai.js  API GraphQL da Sobressai
        ├── vista.js      CRM Vista (API ou dados embutidos na página)
        └── html.js       leitura de cards HTML (OPEN, Ágora, Penteado, Kasa, Página 1)
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
