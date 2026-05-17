# Prompt — Consulta de Viabilidade (PinG) no Dharma — v2

> Spec adaptada à estrutura real do Dharma + extensão Chrome `extensao-dharmapro`.
> Substitui o `prompt-viabilidade-ping.md` original (que foi escrito pelo Claude in
> Chrome a partir da UI do PinG e tinha vários erros de contrato confirmados em
> 17/05/2026).
>
> **Para o Claude Code:** este documento é a única fonte de verdade. Leia tudo
> antes de começar e nunca volte ao prompt original — ele descreve uma
> arquitetura (microsserviço Node+Redis+VPN) que NÃO cabe na nossa stack.

---

## 1. Resumo executivo

Implementar dentro do CRM Dharma um **ambiente isolado de consulta de viabilidade
de endereço** usando o sistema **PinG** (`https://ping.veronet.com.br`) da Vero.

### Escopo desta entrega — Etapa 1 (CRM sandbox)

- Nova rota interna no CRM: **`/ferramentas/viabilidade`** (item de menu, sob
  controle de `PERFIS_MENUS_JSON`).
- Operador busca endereço, escolhe sugestão, informa número, recebe resposta
  normalizada (DISPONIVEL / PROVAVEL / SEM_COBERTURA / AREA_PROIBIDA / INDETERMINADO).
- **Não acopla** a lead nem a pedido. É sandbox. Coluna `VIABILIDADE` da aba
  `1 - Vendas` permanece como está; integração com o fluxo de vendas é objeto
  de uma fase futura.
- **Botão opcional "🧹 Limpar com IA"** ao lado do input: pega texto colado
  bagunçado, manda pro Claude API normalizar (`"Rua X, Bairro Y, Cidade Z — UF"`)
  e injeta no autocomplete do PinG. Não bloqueia o fluxo normal.

### Fora de escopo desta entrega

- Etapa 2 (Renata IA) — módulo separado, **não implementar agora**. Arquitetura
  definida na §10.
- Etapa 3 (Landing page) — depois da Etapa 2.
- Vínculo da consulta com lead/venda — fase futura.

---

## 2. Stack-target e premissas

| Componente | Decisão |
|---|---|
| **UI no CRM** | `Viabilidade.html` (novo) + função `getViabilidadeHtml()` em `Code.js`, padrão idêntico ao `Cruzamento.html` / `PainelAds.html` |
| **Backend** | Google Apps Script (V8) — mesmo Code.js do DharmaPro, módulo dedicado **`ViabilidadeAPI.js`** |
| **Ponte com PinG** | Extensão Chrome MV3 `extensao-dharmapro` ganha um novo content script **`content-ping.js`** que **intercepta `fetch` do SPA do PinG** e responde mensagens vindas do CRM via `content-bridge.js` |
| **Auth no PinG** | **Cookie de sessão do operador** (mesma estratégia do Adapter/NG). Sem service account. |
| **Cache** | `chrome.storage.local` (TTL 10min para consultas, TTL 24h para `coverage-area` por cidade) |
| **Histórico** | Em memória da sessão no frontend; gravação opcional numa nova aba `Consultas Viabilidade` do Sheets (LGPD: hash do endereço + resultado + usuário + timestamp) |
| **Feature flag** | Item de menu em `PERFIS_MENUS_JSON`; flag adicional em `Script Properties` `VIABILIDADE_ATIVO` (kill switch) |
| **Observabilidade** | Console GAS + aba de auditoria; sem Datadog/p99 |
| **VPN** | Não há setup de VPN no servidor — o navegador do operador já está na VPN ao usar o CRM |

### Bloqueios duros (já validados)

1. **CORS bloqueia fetch direto** de qualquer JS que não seja o próprio SPA do
   PinG. A auth não é só cookie — o SPA injeta header (provavelmente JWT
   Authorization). Por isso interceptamos o `window.fetch` da própria página,
   nunca chamamos o gateway por conta própria.
2. **A janela do operador precisa estar logada no PinG** para qualquer consulta
   funcionar. O CRM detecta isso via ping de saúde da extensão e exibe banner
   "Faça login no PinG" quando off.

---

## 3. Contrato real do PinG (validado em 17/05/2026)

O gateway é `https://gateway.pi.ngtools.com.br`. As respostas abaixo foram
capturadas via `fetch` interceptor no próprio SPA (ver §11). Algumas alegações
do prompt v1 (CinC) foram **falsificadas** — pontos marcados ⚠️.

### 3.1 Autocomplete

```http
GET /api/autocomplete/?input=<texto>&latitude=<lat_contexto>&longitude=<lng_contexto>
```

⚠️ Prompt v1 dizia `?q=<texto>`. Real é `?input=...` + lat/lng do viewport atual.

**Response 200** — array de sugestões:

```jsonc
[
  {
    "completo":     "Rua Quinze de Novembro, Balneário, Florianópolis - SC",
    "placeholder":  "Rua Quinze de Novembro, $NUMERO$ - Balneário, Florianópolis - SC",
    "latitude":     -27.5796994,
    "longitude":    -48.5769198,
    "marker_type":  "street_without_number",  // ⚠️ não é "street"; outras vistas: "place"
    "cidade":       "Florianópolis",
    "geoJSON":      { "type": "LineString", "coordinates": [/* lng,lat pairs */] }
  }
]
```

O `placeholder` traz template com `$NUMERO$` — o SPA substitui pelo número
quando monta a URL do `detalhes-numero`.

### 3.2 Lista de CTOs no viewport

```http
GET /network/api/v1/ctos/map_view?<bbox/zoom params>
```

Chamado quando o mapa muda viewport. Retorna array de CTOs visíveis.
**Útil para cache antecipado**, não é necessário para a consulta unitária.

### 3.3 Áreas proibidas no viewport

```http
GET /api/coverage-area/?<bbox params>
```

Retorna array de polígonos:

```jsonc
[
  {
    "id":            295613,
    "name":          "ÁREA COM REDE SUBTERRÂNEA",
    "description":   "...",
    "coverage_type": "forbidden",            // valor observado; pode haver outros
    "project":       <int>,
    "provider":      <int>,
    "coordinates":   [/* polygon */]
  }
]
```

**Importante**: o SPA do PinG decide AREA_PROIBIDA **client-side** por
point-in-polygon contra este array. Quando o endereço cai num polígono,
ele **nunca chama `/api/cep/detalhes-numero`** (testado em 2 casos:
Felipe Schmidt 150 / Floripa e Av. Paulista 1000 / SP). Nossa adapter
deve fazer a mesma checagem.

### 3.4 Consulta unitária (detalhes-numero)

```http
GET /api/cep/detalhes-numero
    ?string_query=<completo>
    &numero=<int>
    &cidade=<cidade>
    &lat=<latitude>
    &long=<longitude>
```

**Response 200** — top-level:

```jsonc
{
  "numero":                    "100",            // string!
  "completo":                  "R. Quinze de Novembro, 100 - Balneario, Florianópolis - SC, 88075-220, Brazil",
  "latitude":                  -27.5807188,
  "longitude":                 -48.5770969,
  "coordenadas":               { "lat": -27.5807188, "lng": -48.5770969 },
  "rua_encontrada_google":     true,             // ⚠️ boolean, não string como prompt v1 alegou
  "numero_encontrada_google":  true,             // ⚠️ idem
  "resultado_google":          { /* Google Geocoding payload completo */ },
  "cache":                     false,            // sinaliza se gateway serviu de cache
  "disponibilidade":           { /* ver 3.5 */ }
}
```

### 3.5 Bloco `disponibilidade`

```jsonc
{
  "disponibilidade":      "available" | "no coverage" | "probable" | "forbidden",
  // ⚠️ Note "no coverage" tem espaço; tipo_disponibilidade usa underscore "no_coverage"
  "tipo_disponibilidade": "available" | "no_coverage" | "inside forbidden area" | ...,
  "forbidden_areas":      [ /* mesma shape de 3.3 */ ],
  "ctos_within_range":    [ /* ver 3.6 */ ],
  "blocked":              false,
  "lat":                  -27.5807188,
  "long":                 -48.5770969
}
```

**Enum observado em produção** (17/05/2026):
- `"available"` (com `tipo_disponibilidade: "available"`, não null)
- `"no coverage"` (com `tipo_disponibilidade: "no_coverage"`, `ctos=[]`)
- ⚠️ `"forbidden"` **não foi observado via detalhes-numero** — UI nunca chama
  o endpoint para endereços em polígono proibido. Tratar como caso possível
  mas verificar empiricamente quando aparecer.
- ⚠️ `"probable"` no top-level também não foi observado isoladamente;
  todas as consultas com CTO `availability_status=available_few_ports` tiveram
  top-level `disponibilidade=available`. **Por isso a normalização do nosso
  `resultado` é derivada por nossa lógica, não copiada do gateway.**

### 3.6 CTO em `ctos_within_range`

**60 campos** no payload real (capturado da CTO 38/2 em XV de Novembro 100).
Não copiar tudo para nosso modelo — só os abaixo importam.

Campos relevantes:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | number | ⚠️ é número, não string `"cto-xx-y"` como prompt v1 |
| `name` | string | `"38/2"` |
| `coordinates` | `[lng, lat]` | ⚠️ array, ordem GeoJSON (lng primeiro), não objeto |
| `technology` | string | `"GPON"` |
| `architecture` | string \| null | `"FTTH"`, `"FTTx"` ou null |
| `city` | string | |
| `ports` | number | total físico |
| `occupied_ports` | number | ocupadas |
| `available_ports` | number | ⚠️ NÃO é `ports - occupied_ports`. Significado obscuro. **Para "portas livres" usar `ports - occupied_ports`.** |
| `distance` | number | metros até o ponto consultado (decimal) |
| `cto_validation` | string | ⚠️ é `cto_validation`, não `validation`. Valor: `"valid"`, etc |
| `availability_status` | string | `"available"`, `"available_few_ports"`, ... |
| `provider_name` | string | `"SU SC Litoral"`, `"MG MG Z MATA"`, ... |
| `provider_color` | string | hex |
| `occupation_color` | string | ⚠️ nome de cor (`"green"`, `"yellow"`, `"red"`), não hex como prompt v1 |
| `max_drop_distance` | number | distância máx do drop em metros (típico 300) |
| `ibge` | number | código IBGE da cidade |
| `installed_at` | string | ISO 8601 |

Campos ignoráveis (mantidos para tolerância): `description`, `provider`, `project`,
`cto_type`, `polygon`, todos os address fields da CTO (`street`/`number`/`complement`/...),
audit fields (`created_at`/`updated_at`/...), `olt_*`, `def_avail_resp_*`,
`has_def_avail_response`, `default_hide_ctos`, `provider_overlap_mode`,
`network_container_uuid`, `provider_id`, `project_name`, `provider_first_sort`,
`routing_polyline`.

---

## 4. Modelo normalizado (CRM-side)

```ts
type ResultadoViabilidade =
  | "DISPONIVEL"        // ≥1 CTO available com porta livre
  | "PROVAVEL"          // CTOs com available_few_ports OU 0 portas livres OU probable
  | "SEM_COBERTURA"     // disp=no coverage, sem polígono proibido
  | "AREA_PROIBIDA"     // ponto dentro de coverage-area com coverage_type=forbidden
  | "INDETERMINADO";    // timeout, 5xx, schema fora

type StatusCTO =
  | "DISPONIVEL"
  | "PROVAVEL_PORTAS_LIMITADAS"
  | "PROVAVEL"
  | "INDISPONIVEL";

interface ConsultaViabilidade {
  resultado: ResultadoViabilidade;       // agregação top-level
  motivo: string;                        // texto curto pt-BR
  endereco: {
    completo: string;
    rua: string;
    numero: number;
    bairro?: string;
    cidade: string;
    uf: string;
    cep?: string;
    ibge?: number;
    lat: number;
    lng: number;
  };
  ctos: Array<{
    id: number;                          // ⚠️ number
    nome: string;
    status: StatusCTO;                   // ⚠️ novo: por CTO
    tecnologia?: string;
    arquitetura?: string;
    distanciaMetros?: number;
    portasTotais?: number;
    portasOcupadas?: number;
    portasLivres?: number;               // = portasTotais - portasOcupadas
    portasDisponiveis?: number;          // campo cru do PinG, expor opcional
    maxDropDistance?: number;
    validada?: boolean;                  // cto_validation === "valid"
    provedor?: string;                   // provider_name
    corOcupacao?: string;                // occupation_color (nome)
    lat?: number; lng?: number;
  }>;
  fonte: "PING";
  consultadoEm: string;                  // ISO-8601
  cacheHit: boolean;
  ping?: { cache: boolean };             // se o gateway disse que era cache dele
}
```

### Regras de derivação do `resultado`

```text
1. Antes do detalhes-numero: se ponto cai dentro de polígono em /api/coverage-area/
   onde coverage_type === "forbidden"
   → resultado: AREA_PROIBIDA, ctos: [], motivo: "Endereço dentro de área proibida (<nome da área>)"

2. Caso contrário, chamar /api/cep/detalhes-numero. Mapeamento:
   a) disp = "no coverage"
      → SEM_COBERTURA

   b) disp = "available" e ≥1 CTO com
        availability_status = "available" E (ports - occupied_ports) > 0
      → DISPONIVEL

   c) disp = "available" mas todas CTOs ou são "available_few_ports"
      ou têm ports - occupied_ports === 0
      → PROVAVEL, motivo: "Cobertura provável — atenção a portas"

   d) disp = "probable"
      → PROVAVEL

   e) disp = "forbidden"
      → AREA_PROIBIDA (caso o gateway responda assim mesmo)

   f) erro de rede / timeout 5s / 5xx / schema inesperado
      → INDETERMINADO, motivo: "Falha técnica do PinG: <descrição>"
```

### Regras por CTO (`status`)

```text
availability_status === "available"            E portas livres > 0  → DISPONIVEL
availability_status === "available_few_ports"                       → PROVAVEL_PORTAS_LIMITADAS
availability_status === "probable"                                   → PROVAVEL
demais casos                                                         → INDISPONIVEL
```

---

## 5. Arquitetura

```text
[ CRM /ferramentas/viabilidade  (Viabilidade.html, JS frontend) ]
                │
                │ chrome.runtime.sendMessage(EXTENSION_ID, msg, callback)
                │   (via externally_connectable — §8.1)
                ▼
[ extensao-dharmapro / background.js  (service worker) ]
                │ acha aba do PinG via chrome.tabs.query
                │ chrome.tabs.sendMessage(tabId, msg)
                ▼
[ extensao-dharmapro / content-ping.js  (isolated world, NOVO) ]
                │ window.postMessage({ __dharmaPing: true, kind: "command", ... })
                ▼
[ extensao-dharmapro / ping-main-world.js  (main world da página, NOVO) ]
                │ await origFetch(url, { credentials: "include" })
                │ — herda Authorization injetado pelo SPA
                ▼
[ SPA do PinG → gateway.pi.ngtools.com.br ]
                │ resposta crua JSON
                ▼
[ content-ping.js  Normalizador (regras §4) → ConsultaViabilidade ]
                │ resposta volta o caminho inverso até o CRM
                ▼
[ CRM frontend renderiza card + atualiza histórico em memória ]
                │ google.script.run.salvarConsultaViabilidade(...)
                ▼
[ aba "Consultas Viabilidade" — endereço hasheado + resultado + usuário + ts ]
```

### Por que content-script e não fetch próprio

Testado em 17/05/2026: `fetch` direto pro `gateway.pi.ngtools.com.br` de
qualquer contexto JS que não seja o próprio SPA falha com CORS / auth missing.
O SPA injeta header de Authorization que não está acessível externamente.

**Solução**: nosso content script roda dentro da página `ping.veronet.com.br/*`
e tem acesso ao mesmo `window.fetch` que o SPA usa. Quando intercepta uma
chamada do próprio SPA OU quando dispara uma chamada própria via `dispatchEvent`
para o SPA executar, a auth fica resolvida automaticamente.

Padrão preferido na MVP: **o content script chama `fetch` diretamente do
contexto da página** (depois de injetar via `script.textContent = "..."`),
porque a página já contém o fetch wrapper autenticado. Detalhes de
implementação em §11.

---

## 6. UI no CRM (`Viabilidade.html`)

### Layout

```
+--------------------------------------------------+
| Consulta de Viabilidade — PinG                   |
| [ banner cinza/vermelho se extensão ou login OFF]|
+--------------------------------------------------+
| Buscar endereço:                                 |
| [   _______________________________   ] [🧹 IA]  |
|                                                  |
| Sugestões (autocomplete):                        |
|   • Rua Quinze de Novembro, Balneário, Floria... |
|   • Rua XV, Santo Antônio de Lisboa...           |
|                                                  |
| Nº: [   ]   [Consultar]                          |
+--------------------------------------------------+
| Resultado:                                       |
| ┌───────────────────────────────────────────┐    |
| │ ✅ DISPONÍVEL                              │    |
| │ R. Quinze de Novembro, 100 - Balneário,    │    |
| │ Florianópolis - SC, 88075-220              │    |
| │                                           │    |
| │ CTOs no raio:                              │    |
| │  • 38/2 — 59m — GPON FTTH                  │    |
| │    Validada · 13/16 portas (3 livres)      │    |
| │    SU SC Litoral                           │    |
| │  • 38/1 — 142m — GPON FTTH                 │    |
| │    Provável — atenção a portas             │    |
| │                                           │    |
| │ [Nova consulta]                            │    |
| └───────────────────────────────────────────┘    |
|                                                  |
| Histórico (últimas 10 consultas da sessão):      |
|  1. ✅ XV Novembro 100, Floripa     12:01        |
|  2. ⛔ Felipe Schmidt 150, Floripa  12:03        |
|  3. ❓ Halfeld 200, JF              12:05        |
+--------------------------------------------------+
```

### Cores do badge (mapeamento de `resultado`)

| Resultado | Emoji | Cor (CSS var) |
|---|---|---|
| DISPONIVEL | ✅ | `--dharma-verde-sucesso` |
| PROVAVEL | ⚠️ | `--dharma-amarelo-alerta` |
| SEM_COBERTURA | ❓ | `--dharma-cinza-neutro` |
| AREA_PROIBIDA | ⛔ | `--dharma-vermelho-erro` |
| INDETERMINADO | ⏱ | `--dharma-azul-info` |

### Health check (banner de status da extensão)

- Frontend dispara `chrome.runtime.sendMessage(EXTENSION_ID, { action: "viabilidade.health" })`
  no `DOMContentLoaded` e depois a cada **30s**.
- Estados do banner (precedência de cima pra baixo):
  - **Vermelho** "Extensão não detectada — instale o DharmaPro Connector v2.2+":
    quando `chrome.runtime.sendMessage` lança erro `Could not establish connection`
    OU não responde em 2s.
  - **Laranja** "Abra o PinG numa aba e mantenha logado":
    quando background responde `{ erro: "PING_TAB_AUSENTE" }`.
  - **Amarelo** "Sessão do PinG expirou — refaça login":
    quando ping retorna `{ autenticado: false }`.
  - **Sem banner**: tudo OK.
- Input + botão Consultar ficam **desabilitados** enquanto o banner não estiver verde.
- O badge fica visível no topo o tempo todo enquanto a página `/ferramentas/viabilidade`
  estiver aberta.

### Comportamento do "🧹 Limpar com IA"

- Habilitado quando o input tem ≥10 caracteres.
- Ao clicar: chama `getViabilidadeAddressCleanupBackend(textoCru)` no GAS,
  que chama Claude API (modelo `claude-haiku-4-5-20251001`) com **system prompt
  estrito** abaixo:

  ```
  Você é um normalizador de endereços brasileiros. Recebe um endereço em
  qualquer formato (incompleto, abreviado, com erros, com complemento ruidoso)
  e devolve APENAS um JSON no formato:

  { "ok": true,  "logradouro": "Rua X, Bairro Y, Cidade Z — UF" }
  { "ok": false, "motivo": "<por que não foi possível normalizar>" }

  Regras:
  - Não invente. Se faltar cidade/UF/bairro e não der pra deduzir COM CERTEZA,
    retorne ok:false.
  - Não inclua número, CEP, complemento, ponto de referência.
  - Use abreviações padrão: "Rua", "Avenida", "Travessa", "Estrada" (não "R.",
    não "Av.").
  - Cidade com acento correto.
  - UF em maiúsculas, 2 letras.
  - Se o texto não parecer endereço, retorne ok:false com motivo "não parece
    endereço".

  Endereço bruto:
  ---
  <textoCru>
  ---
  ```

- A resposta `ok:true` substitui o conteúdo do input e dispara autocomplete
  automaticamente. `ok:false` mostra toast "Não consegui normalizar: <motivo>".
- Loading spinner enquanto chama; timeout 8s no UrlFetchApp.
- Custo: 1 chamada Claude Haiku (~200 tokens in + 50 out) por uso. Aceitável.
- Throttle: máx 30 cleanups por operador por hora; tracked em `Script Properties`
  com chave `VIABILIDADE_CLEANUP_QUOTA_<usuario>_<YYYYMMDDHH>`.

---

## 7. Backend GAS (`ViabilidadeAPI.js`)

Funções públicas (chamáveis via `google.script.run`):

| Função | Descrição |
|---|---|
| `getViabilidadeHtml()` | Retorna conteúdo de `Viabilidade.html` (injeção no CRM) |
| `getViabilidadeAddressCleanupBackend(textoCru)` | Cleanup via Claude API. Retorna `{ ok: bool, enderecoNormalizado: string, erro?: string }` |
| `salvarConsultaViabilidade(usuario, consulta)` | Append na aba `Consultas Viabilidade`. LGPD: grava hash SHA-256 do endereço completo + resultado + ctos.length + usuario + ISO timestamp. Retorna `{ ok: bool }` |
| `getHistoricoViabilidadeUsuario(usuario, limite=10)` | Lê últimas N consultas do usuário da aba. |

**Não há** função GAS que chame o PinG direto — toda comunicação acontece
extensão↔PinG. O GAS só faz cleanup de endereço, persistência de histórico
e serve o HTML.

### Aba `Consultas Viabilidade` (criar com helper one-shot em `_arquivo.js`)

Colunas A-G:
```
A: TIMESTAMP   (ISO 8601)
B: USUARIO     (login do CRM)
C: ENDERECO_HASH  (SHA-256 do completo, hex truncado 16 chars)
D: RESULTADO   (DISPONIVEL | PROVAVEL | SEM_COBERTURA | AREA_PROIBIDA | INDETERMINADO)
E: CTOS_QTD    (número de CTOs retornadas; 0 se nenhuma)
F: MOTIVO      (texto curto)
G: META_JSON   (opcional, JSON pequeno com cidade/uf/distancia da CTO mais próxima — sem endereço cru)
```

LGPD: **endereço cru nunca é gravado**. O hash é deterministico para deduplicação,
mas não reverte. Em logs de diagnóstico (`console.log` no Apps Script), também
nunca logar endereço cru — só hash.

#### Implementação do hash em GAS

```js
function _hashEnderecoViabilidade_(enderecoCompleto) {
  // Normaliza antes de hashear: lowercase, NFD, sem espaços extras
  const normalizado = String(enderecoCompleto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // remove acentos
    .toLowerCase()
    .replace(/\s+/g, " ").trim();
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalizado,
    Utilities.Charset.UTF_8
  );
  // Hex truncado a 16 chars (8 bytes — colisão prática só com bilhões de hashes)
  const hex = bytes.map(b => ((b < 0 ? b + 256 : b)).toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}
```

A mesma função deve viver client-side no `Viabilidade.html` (versão Web Crypto
API), com o **mesmo algoritmo de normalização** (NFD, lowercase, trim), pra
que o hash bata entre client e server em testes.

### Feature flag

- `PropertiesService` Script Properties: `VIABILIDADE_ATIVO = "1"` (default `"0"`).
  Lido em `getViabilidadeHtml()` — retorna placeholder "Funcionalidade desativada"
  quando 0.
- `PERFIS_MENUS_JSON`: adicionar item `viabilidade` aos perfis que devem ver.
  Sugestão inicial: `admin` e `backoffice`.

---

## 8. Extensão Chrome — alterações

### 8.1 `manifest.json` (v2.2.0)

```json
{
  "manifest_version": 3,
  "name": "DharmaPro Connector",
  "version": "2.2.0",
  "permissions": ["storage", "tabs"],
  "host_permissions": [
    "https://gateway.pi.ngtools.com.br/*"
  ],
  "externally_connectable": {
    "matches": [
      "https://script.google.com/*",
      "https://*-script.googleusercontent.com/*"
    ]
  },
  "background": { "service_worker": "background.js" },
  "web_accessible_resources": [
    { "resources": ["content-ng.js", "ping-main-world.js"],
      "matches": ["https://ng.vero.objective.com.br/*", "https://ping.veronet.com.br/*"] }
  ],
  "content_scripts": [
    { "matches": ["https://adapter.veronet.com.br/*"],
      "js": ["content-adapter.js"], "run_at": "document_start" },
    { "matches": ["https://ng.vero.objective.com.br/*"],
      "js": ["content-ng-loader.js"], "run_at": "document_start" },
    { "matches": ["https://ping.veronet.com.br/*"],
      "js": ["content-ping.js"], "run_at": "document_start" }
  ]
}
```

**Por que `externally_connectable`** e não um `content_scripts` match em
`script.googleusercontent.com`: o CRM (HTMLService) roda dentro de um iframe
sandbox de origem dinâmica `https://n-{hash}-{n}-...-script.googleusercontent.com/userCodeAppPanel`.
Adicionar match pra esse domínio funciona, mas o jeito canônico de uma
extensão expor API a um web app é `externally_connectable`. Daí o CRM faz:

```js
chrome.runtime.sendMessage(EXTENSION_ID, msg, callback);
```

direto pra extensão, sem precisar de content script intermediário. O
`EXTENSION_ID` é hardcoded no `Viabilidade.html` como `DHARMA_EXTENSION_ID`.
**Documentar onde achar o ID** no `dharmapro-crm/CLAUDE.md` após o primeiro
deploy da v2.2.0.

> **Importante**: validar empiricamente que `chrome.runtime` existe na window
> do iframe do GAS. Se o Chrome restringir, fallback é adicionar
> `content_scripts` com match `https://*.googleusercontent.com/userCodeAppPanel*`
> + um `content-dharma-bridge.js` que faz `window.postMessage` ↔ `chrome.runtime`.
> Tem que testar; o Claude Code escolhe na hora da implementação.

### 8.2 `content-ping.js` (NOVO — isolated world)

Roda em **isolated world** do content script — vê o DOM mas NÃO vê `window.fetch`
do SPA. Responsabilidades:

1. Injetar o `ping-main-world.js` no contexto da página via `<script src>`
   (precisa estar em `web_accessible_resources`).
2. Escutar `window.postMessage` do main world (eventos `__dharmaPingResponse`)
   e bubble-up via `chrome.runtime.sendMessage` para o background.
3. Receber comandos do background via `chrome.runtime.onMessage` e despachar
   ao main world via `window.postMessage({ type: '__dharmaPingCommand', ... })`.
4. Health check: detecta presença do JWT do SPA (existe em algum store do
   React do PinG; pode ser inferido por uma chamada de teste muito barata)
   e reporta `{ ok, autenticado }`.

### 8.3 `ping-main-world.js` (NOVO — main world)

Roda no **mesmo contexto** do SPA do PinG (`window` compartilhada). Responsável
pelo `fetch` autenticado. Ver protocolo em §11.

**Garantias**:
- Re-injeta interceptor se o SPA fizer hot-reload do `window.fetch`.
- Nunca loga `string_query` / `completo` / `numero` — só comprimento + path.
- Normalizador (regras §4) roda aqui, antes de mandar `__dharmaPingResponse`.

### 8.4 `background.js` (service worker)

Roteamento:

| De → Para | Mensagem | Ação |
|---|---|---|
| CRM via `externally_connectable` | `{ action: "viabilidade.*" }` | Acha aba do PinG (`chrome.tabs.query({ url: "https://ping.veronet.com.br/*" })`); se vazio → responde `{ ok: false, erro: "PING_TAB_AUSENTE" }`. Caso contrário, `chrome.tabs.sendMessage(tabId, msg)` e devolve a resposta ao CRM. |
| content-ping → background | `{ type: "dharma.viabilidade.ready" }` | Marca aba como pronta. |
| (qualquer) | erro de timeout 8s | responde `{ ok: false, erro: "EXTENSAO_TIMEOUT" }` |

Erros padronizados (todos string snake-case em UPPER):
- `PING_TAB_AUSENTE` — operador não tem PinG aberto
- `PING_NAO_AUTENTICADO` — aba aberta mas sessão expirou
- `EXTENSAO_TIMEOUT` — bridge não respondeu em 8s
- `PING_RATE_LIMIT` — operador estourou throttle local
- `PING_5XX` — gateway respondeu erro
- `PING_SCHEMA_INVALIDO` — parser não conseguiu normalizar

### 8.5 `content-bridge.js` (já existe — NÃO mexer pra PinG)

Hoje serve só Adapter/NG. Pra PinG, o CRM fala direto com a extensão via
`externally_connectable` (§8.1). Se o fallback `content_scripts` for
necessário (vide nota da §8.1), aí sim adicionar match novo no
`content-bridge.js`.

---

## 9. Cache e throttling

### 9.1 Cache

- **`chrome.storage.local`**, três namespaces — chaves são SHA-256 truncado
  a 16 chars hex (mesmo algoritmo da §7):
  - `ping:suggest:<sha256_16(q_normalizado)>` → array de sugestões. TTL **5min**
    (autocomplete é cheap).
  - `ping:consult:<sha256_16(string_query|numero|lat|long)>` → `ConsultaViabilidade`.
    TTL **10min**. Inclui `cacheHit: true` quando servido daqui.
  - `ping:forbidden:<cidade_normalizada>` → array de polígonos forbidden_areas.
    TTL **24h**. Pré-carregado ao primeiro autocomplete de cada cidade.

Limpeza: a cada 100 escritas, expirar entradas vencidas. Cap total de 5MB.

**Nada de cache compartilhado entre operadores nesta Etapa 1.** Etapa 2 sobe
o cache para Supabase.

### 9.2 Throttling

Contadores em `chrome.storage.local`, chave `ping:throttle:<bucket>`,
janela deslizante:

- `bucket=user:<usuario>` → máx **10 consultas/min**, **120/hora**.
- `bucket=global` → máx **60 consultas/min** (proteção amplíssima caso o
  Claude Code rode lote de teste).
- `bucket=suggest:<usuario>` → máx **30 autocompletes/min** (input
  debouncado em 300ms ajuda, mas redundância vale).

Quando estoura, background responde `{ ok: false, erro: "PING_RATE_LIMIT",
msg: "Aguarde alguns segundos antes de nova consulta" }`. **Não bloqueia
inputs do operador** — apenas atrasa.

Throttling NÃO se aplica a hits de cache (`chrome.storage.local`). Cache hit é
de graça.

---

## 10. Etapa 2 — Renata IA (preparar, NÃO implementar agora)

> Esta seção descreve como a Etapa 1 deve preparar terreno para a Etapa 2
> sem implementar Etapa 2.

### Por que é mais complexa

A Renata recebe endereço do lead via WhatsApp, frequentemente:
- Incompleto ("rua das flores")
- Bagunçado ("rua flores 100 jf")
- Sem padrão ("Centro JF")
- Com complemento ruidoso ("ap 302 bl B rua x JF")

### Arquitetura proposta (a definir na Etapa 2)

```text
n8n flow do Renata (no5_montar_payload ou novo no especializado)
   │
   ├─ Detecta intent "consultar cobertura" no turno do lead
   │
   ├─ STEP 1: Cleanup do endereço via Claude API
   │     (mesma chamada que o "🧹 IA" do CRM faz, agora server-side)
   │     → entrada: "rua flores 100 jf"
   │     → saída:   "Rua das Flores, Centro, Juiz de Fora — MG"
   │
   ├─ STEP 2: Lookup no Supabase  viabilidade_cache
   │     chave: SHA-256 truncado 16 chars de (logradouro normalizado) + numero
   │     mesmo algoritmo de hash da §7 — garantia de match entre CRM e Renata
   │     se hit fresh (<24h): responde direto
   │
   ├─ STEP 3 (miss): solicita consulta REAL
   │     opção A: deixar a Renata responder "vou confirmar com a equipe"
   │              + dispara handoff para humano com flag "VIABILIDADE_PENDENTE"
   │     opção B: chamada server-to-server pro DharmaPro
   │              que aciona um operador de plantão com extensão ativa
   │              (BKO de plantão — desencorajado, mas viável)
   │     opção C: aceitar limite — Renata só responde com cache,
   │              quando miss diz "vou confirmar com a equipe"
   │
   ├─ AREA_PROIBIDA é trivial: se a Renata souber a cidade está no cache
   │     de forbidden_areas e o lat/lng do endereço cair dentro,
   │     ela responde direto sem precisar de operador.
   │     Esse é o caso de uso de maior valor da Etapa 2.
   │
   └─ Caching: TODA consulta feita pela Etapa 1 (operador no CRM) grava
        em supabase viabilidade_cache → Renata se beneficia.
```

### O que a Etapa 1 já deixa pronto

- Modelo normalizado `ConsultaViabilidade` definido e estável.
- Hash de endereço (SHA-256 truncado 16 chars) como chave canônica.
- Aba `Consultas Viabilidade` no Sheets — **espelhar pra Supabase**
  numa segunda iteração da Etapa 1 (opcional, baixo custo, ver §13).
- Cleanup de endereço via Claude API testado.

---

## 11. Padrão de injeção e protocolo main-world ↔ isolated-world

Validado em 17/05/2026. **Crítico**: content scripts MV3 rodam em "isolated
world" — vê o DOM mas não vê `window.fetch` modificado pelo SPA nem o header
de `Authorization` que o SPA injeta. Por isso a divisão em dois arquivos:

```
content-ping.js          (isolated world — vê DOM, fala chrome.runtime)
   │ injeta via <script src="...ping-main-world.js">
   ▼
ping-main-world.js       (main world — mesma window do SPA)
   │ intercepta fetch + dispara consultas
   ▼
window.fetch original    (vem do SPA, já tem Authorization injetado)
   │
   ▼
gateway.pi.ngtools.com.br
```

### 11.1 `content-ping.js` — injeção no main world

```js
// Roda em isolated world. Injeta o ping-main-world.js no main world.
(function(){
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("ping-main-world.js");
  s.onload = function(){ s.remove(); };
  (document.head || document.documentElement).appendChild(s);
})();

// Recebe respostas do main world e roteia ao background.
window.addEventListener("message", (ev) => {
  const data = ev.data;
  if (!data || data.__dharmaPing !== true) return;
  if (data.kind === "ready" || data.kind === "response") {
    chrome.runtime.sendMessage({ from: "content-ping", payload: data });
  }
});

// Recebe comandos do background e despacha ao main world.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.target === "ping-main-world") {
    const id = msg.id || crypto.randomUUID();
    const handler = (ev) => {
      const d = ev.data;
      if (d && d.__dharmaPing && d.kind === "response" && d.id === id) {
        window.removeEventListener("message", handler);
        sendResponse(d.payload);
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ __dharmaPing: true, kind: "command", id, payload: msg.payload }, "*");
    return true; // mantém canal aberto para sendResponse async
  }
});
```

### 11.2 `ping-main-world.js` — interceptor + executor

```js
(function(){
  if (window.__dharmaPingMainInstalled) return;
  window.__dharmaPingMainInstalled = true;

  // 1. Mantém fetch original para nossas chamadas próprias
  const origFetch = window.fetch;

  // 2. Wrap pra capturar passivamente o que o SPA faz
  //    (útil pra debug; não obrigatório pra fluxo normal)
  window.fetch = async function(...args){
    const url = typeof args[0] === "string" ? args[0] : args[0].url;
    const resp = await origFetch.apply(this, args);
    if (url && url.includes("gateway.pi.ngtools.com.br") && resp.status === 200) {
      try {
        const cloned = resp.clone();
        const text = await cloned.text();
        // Não logamos query string nem body — apenas notificamos o content
        window.postMessage({
          __dharmaPing: true, kind: "passive",
          path: new URL(url).pathname,
          status: resp.status, bodyLen: text.length
        }, "*");
      } catch (e) {}
    }
    return resp;
  };

  // 3. Escuta comandos vindos do content script
  window.addEventListener("message", async (ev) => {
    const m = ev.data;
    if (!m || m.__dharmaPing !== true || m.kind !== "command") return;
    const id = m.id;
    try {
      const result = await executar(m.payload);
      window.postMessage({ __dharmaPing: true, kind: "response", id, payload: result }, "*");
    } catch (err) {
      window.postMessage({
        __dharmaPing: true, kind: "response", id,
        payload: { ok: false, erro: "MAIN_WORLD_ERROR", msg: String(err && err.message || err) }
      }, "*");
    }
  });

  async function executar(cmd) {
    // cmd: { action, ... }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      if (cmd.action === "autocomplete") {
        const u = new URL("https://gateway.pi.ngtools.com.br/api/autocomplete/");
        u.searchParams.set("input", cmd.input);
        if (cmd.latitude != null) u.searchParams.set("latitude", String(cmd.latitude));
        if (cmd.longitude != null) u.searchParams.set("longitude", String(cmd.longitude));
        const r = await origFetch(u.toString(), { credentials: "include", signal: ctrl.signal });
        return { ok: r.ok, status: r.status, body: await r.json() };
      }
      if (cmd.action === "coverage_area") {
        // pode receber bbox ou ser disparado pelo SPA quando o mapa muda;
        // pra MVP, dispara pelo viewport informado
        const u = new URL("https://gateway.pi.ngtools.com.br/api/coverage-area/");
        // params específicos do bbox; ver request real do SPA
        Object.entries(cmd.params || {}).forEach(([k,v]) => u.searchParams.set(k, v));
        const r = await origFetch(u.toString(), { credentials: "include", signal: ctrl.signal });
        return { ok: r.ok, status: r.status, body: await r.json() };
      }
      if (cmd.action === "detalhes_numero") {
        const u = new URL("https://gateway.pi.ngtools.com.br/api/cep/detalhes-numero");
        u.searchParams.set("string_query", cmd.string_query);
        u.searchParams.set("numero", String(cmd.numero));
        u.searchParams.set("cidade", cmd.cidade);
        u.searchParams.set("lat", String(cmd.lat));
        u.searchParams.set("long", String(cmd.long));
        const r = await origFetch(u.toString(), { credentials: "include", signal: ctrl.signal });
        return { ok: r.ok, status: r.status, body: await r.json() };
      }
      if (cmd.action === "health") {
        // chamada barata pra detectar 401/403
        const r = await origFetch("https://gateway.pi.ngtools.com.br/api/autocomplete/?input=a&latitude=0&longitude=0",
          { credentials: "include", signal: ctrl.signal });
        return { ok: r.ok, status: r.status, autenticado: r.status !== 401 && r.status !== 403 };
      }
      return { ok: false, erro: "ACAO_DESCONHECIDA" };
    } finally {
      clearTimeout(t);
    }
  }

  // 4. Sinaliza pro content script que está pronto
  window.postMessage({ __dharmaPing: true, kind: "ready" }, "*");
})();
```

**Notas importantes**:
- O `executar` faz `await origFetch(...)`. O `origFetch` é o `fetch` original
  da página — que JÁ TEM o `Authorization` injetado pelo SPA via service
  worker, ou via prototype wrapping. Por isso a chamada autentica.
- Se o SPA for restart/hot-reload, o `window.__dharmaPingMainInstalled` guard
  evita re-instalação dupla. Pra cobrir SPA totalmente reiniciado, o content
  script pode re-injetar o `<script>` a cada `chrome.tabs.onUpdated` (handled
  pelo background).
- O normalizador (regras §4) NÃO roda no main world — fica no content-ping.js
  (isolated world). Motivo: minimizar superfície de ataque no main world.

---

## 11.5 Edge cases do parser (não esquecer)

Lista derivada das capturas reais. **Cobrir todos com teste unitário**:

| Edge case | Comportamento esperado |
|---|---|
| `numero` no top-level vem como **string** (`"100"`), não number | Converter pra number antes de expor; se `parseInt` falhar, usar o número que o operador digitou |
| `coordinates` da CTO é `[lng, lat]` (array, GeoJSON), `coordenadas` do top-level é `{lat, lng}` (objeto) | Normalizar pra `{lat, lng}` no `ctos[].lat/.lng` |
| `architecture` da CTO pode ser `null` | Não erro; expor como `undefined` no normalizado |
| `cto_validation` ausente ou diferente de `"valid"` | `validada: false`; nunca asumir `true` por default |
| `available_ports > ports` ou `available_ports !== ports - occupied_ports` | Expor cru em `portasDisponiveis`, sempre calcular `portasLivres = max(0, ports - occupied_ports)` |
| `ctos_within_range` array vazio E `forbidden_areas` vazio E `disponibilidade != "no coverage"` | `INDETERMINADO`, motivo: `"Resposta inconsistente do PinG (sem CTOs e sem área proibida e sem 'no coverage')"` |
| `disponibilidade` ausente ou `null` | `INDETERMINADO`, motivo: `"Bloco disponibilidade ausente"` |
| Sugestão com `latitude:0, longitude:0` | Descarta (provavelmente erro). Se for a única, mostrar "Endereço não localizado". |
| Múltiplas sugestões com mesmo `completo` mas `cidade` diferente | Mostrar todas; deixar operador escolher |
| `marker_type === "place"` (não "street_without_number") | Tratar como endereço já com número; pular a etapa de pedir número e ir direto pro `detalhes-numero` |
| Resposta `detalhes-numero` HTTP 200 mas com `Content-Type` não JSON | `INDETERMINADO`, motivo: `"PinG retornou conteúdo não-JSON"` |
| HTTP 401 / 403 do gateway | `INDETERMINADO` + dispara health refresh — provavelmente sessão expirou |
| `cache: true` no top-level | Propagar pra `ping.cache: true` no normalizado, **NÃO** confundir com nosso `cacheHit` (que é do `chrome.storage.local`) |
| Endereço encontrado fora do Brasil (UF ausente nos `address_components`) | `INDETERMINADO`, motivo: `"Endereço fora do Brasil"` |
| `forbidden_areas` com `coverage_type !== "forbidden"` (não observado em produção, mas defensivo) | Ignorar — só polígonos com `coverage_type === "forbidden"` ativam AREA_PROIBIDA |
| Operador digita só "JF" ou "Floripa" no input | Autocomplete pode retornar muitos resultados de cidades; mostrar até 10 e pedir refinamento |

---

## 12. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| **Schema do gateway muda** | Parser tolera campos faltando/extras; cada campo crítico gera warning estruturado em log GAS quando some. Testes de regressão rodam contra fixtures reais (§13). |
| **Conta nominal `randrade.mobile@veropar.com.br` é banida por uso automatizado** | Throttling no adapter: máx 10 consultas/min por operador, 60/min global. Comportamento "humano" (sem rajadas). Validar com gerente Vero antes de subir produção. |
| **ToS Vero (engenharia reversa)** | Ricardo sinaliza/aprova como revenda oficial. Documentar consentimento no README. |
| **Operador sem PinG aberto** | Banner persistente no CRM até detectar login. Não tenta cache stale, retorna INDETERMINADO. |
| **LGPD — endereço pessoal** | Hash em log e Sheets. Endereço cru só existe em RAM do browser do operador (do CRM → extensão → SPA do PinG) e no `chrome.storage.local` por 10min. Nunca trafega para Supabase nesta Etapa. |
| **Múltiplas abas do PinG abertas** | `background.js` escolhe a primeira ativa; documentar pro operador "deixe apenas 1 aba do PinG". |
| **Timeout PinG** | 5s hard timeout; retry único com backoff 500ms apenas em erro de rede / 5xx; nunca em forbidden. |

---

## 13. Fixtures de teste

Capturados em 17/05/2026 contra a sessão de `randrade.mobile@veropar.com.br`.
**Não commitar fixtures grandes em git** — são lentos pra diff. Salvar em
`extensao-dharmapro/fixtures/ping/` listada em `.gitignore`.

| Arquivo | Caso | Origem |
|---|---|---|
| `disponivel-xv-novembro-100.json` | DISPONIVEL — 9 CTOs (mix `available` + `available_few_ports`) | XV Novembro 100, Florianópolis |
| `provavel-halfeld-200.json` | PROVAVEL — 2 CTOs, 1ª com `available_few_ports` (7/8 ocupadas) | R. Halfeld 200, Juiz de Fora |
| `sem-cobertura-flores-100.json` | SEM_COBERTURA — `disp="no coverage"`, `ctos=[]` | R. das Flores 100, Manaus |
| `area-proibida-felipe-schmidt.json` | AREA_PROIBIDA — sem chamada de `detalhes-numero`; apenas `coverage-area` retornou polígono `"ÁREA COM REDE SUBTERRÂNEA"` | Felipe Schmidt 150, Floripa |
| `area-proibida-paulista.json` | AREA_PROIBIDA — sem chamada de `detalhes-numero`; idem | Av. Paulista 1000, São Paulo |

O Claude Code deve, na primeira sprint, **recapturar esses cinco fixtures**
ele mesmo via o fetch interceptor do §11 com a aba do PinG aberta, e salvar
nos arquivos acima. Isso garante:
- Schema atual (não capturado de uma sessão antiga).
- Fixtures grandes e completos (sem truncamento do tooling).
- Pronto para regressão automatizada do parser.

**Estado INDETERMINADO**: pode ser sintetizado por timeout artificial.
Não precisa fixture real.

---

## 14. Plano de implementação sugerido

| Sprint | Entrega |
|---|---|
| **S1 — Probe + parser** | Claude Code recaptura os 5 fixtures (§13). Escreve parser puro (sem UI) que recebe response cru e devolve `ConsultaViabilidade`. Testes contra os 5 fixtures cobrem 100% dos branches da §4. |
| **S2 — Extensão** | `content-ping.js` + alterações no manifest + roteamento via background.js + `chrome.storage.local`. Testar fluxo via aba de teste do CRM (HTML standalone). |
| **S3 — UI CRM + GAS backend** | `Viabilidade.html`, `ViabilidadeAPI.js`, `getViabilidadeHtml()`, aba `Consultas Viabilidade`, item de menu, feature flag. |
| **S4 — Polish** | Banner extensão-off, "🧹 Limpar com IA", histórico em memória, badge colorido, edge cases (sugestões duplicadas, sem número, número inexistente). |
| **S5 — Validação** | Ricardo opera 20 consultas reais (Floripa, JF, cidades menores), confere taxa de acerto. Audit LGPD: confirma que `Consultas Viabilidade` não tem endereço cru. |

Entregar em PRs separados por sprint, com clasp push e deploy ao final de cada.

---

## 15. Que esta spec NÃO faz

- Não muda nada em `1 - Vendas` (coluna `VIABILIDADE` fica intocada).
- Não cria endpoint público `?action=viabilidade` no DharmaPro — fica para Etapa 3.
- Não cria tabela `viabilidade_cache` no Supabase — fica para Etapa 2.
- Não toca em `n8n` da Renata — fica para Etapa 2.
- Não toca em `ofertasverointernet` — fica para Etapa 3.

### 15.1 Funcionalidades da UI do PinG que ficam de fora

O PinG tem botões e features que **não devem ser replicados** nesta Etapa 1.
Documentando explicitamente pra evitar o Claude Code achar que precisa fazer:

- **"Proibir venda"** — botão que existe no result panel do PinG e permite ao
  operador marcar manualmente que aquele endereço não pode receber venda.
  Out of scope. Se o operador quiser proibir, ele faz direto no PinG.
- **"Reportar um problema"** — botão "Reportar" no result do PinG. Out.
- **Menu lateral "Engenharia / Visualização / Geral"** com edição de CTOs,
  proibição, exportar, busca avançada, teste massivo. Tudo isso é de
  engenharia da Vero. Out.
- **Camadas visuais do mapa** (CTOs, Clientes, Conexões, Cobertura, Nomes CTO,
  Legenda). Nosso CRM mostra texto, não mapa, na Etapa 1.
- **Edição de endereço do CTO** (cto.street/number/complement/neighborhood) — Out.
- **Busca avançada / filtros por provedor / por projeto** — Out.

Se em algum momento alguém pedir "queria ver no mapa também", isso é Etapa 4+.

---

## 16. Histórico de spec

- **v1** (15/05/2026?): escrita pelo Claude in Chrome a partir da UI do PinG.
  Tinha imprecisões de contrato + arquitetura incompatível com nossa stack
  (microsserviço Node, Redis, VPN no backend, secret manager).
- **v2** (17/05/2026): reescrita por Claude (Cowork mode) após estudo do
  ecossistema Dharma + captura real de 4 estados no PinG via Claude in
  Chrome. Arquitetura adaptada ao padrão `extensao-dharmapro` que já existe
  em produção pra Adapter/NG. Modelo normalizado expandido para refletir
  multi-CTO + estados granulares.
- **v2.1** (17/05/2026, mesma sessão): ajustes finos antes do Claude Code
  começar. Itens novos:
  - §8.1 — manifest com `externally_connectable` pra `script.googleusercontent.com`,
    porque o iframe do GAS não compartilha origem com domínios próprios da extensão.
  - §8.2/8.3 — separação clara isolated world (`content-ping.js`) ↔ main world
    (`ping-main-world.js`), com código de injeção. Sem isso, o content script
    não enxerga o `fetch` autenticado do SPA.
  - §11.1/11.2 — código de exemplo dos dois lados do bridge, com timeout 5s,
    AbortController, e protocolo de mensagens `__dharmaPing` ↔ `kind: command|response`.
  - §11.5 — 16 edge cases concretos do parser, derivados das capturas reais.
  - §6 — health check polling 30s com 4 estados de banner.
  - §7 — system prompt estrito do cleanup de endereço (Claude Haiku) + função
    `_hashEnderecoViabilidade_` em GAS com NFD + lowercase normalization.
  - §9.2 — throttling em `chrome.storage.local` com 3 buckets (user/global/suggest).
  - §15.1 — funcionalidades da UI do PinG explicitamente out of scope.

