# Fixtures reais do PinG — Sprint 1 do módulo Viabilidade

Capturas autênticas do gateway `https://gateway.pi.ngtools.com.br`, feitas em
**17/05/2026** durante a sessão de `randrade.mobile@veropar.com.br` no SPA
oficial do PinG. **NÃO** são fixtures sintéticos / chutados — são response
crus do servidor da Vero. Usar como base de teste do parser
`ViabilidadeParser.js`.

> Não commitar no git como exemplo se a regra do projeto for não versionar
> dados crus do PinG. Decisão: ficam fora do `.claspignore` (não vão para o
> Apps Script) mas **podem ir para o git** porque não contêm dado pessoal
> identificável de cliente — só endereços públicos e CTOs.

---

## Origem

Capturados via `fetch` interceptor injetado no `window.fetch` do próprio SPA
do PinG (main world), por isso a autenticação foi resolvida automaticamente
pela sessão do operador. Bundle bruto original em
`ping-fixtures-bundle-2026-05-17.json` (não usar diretamente nos testes —
preferir os arquivos por estado abaixo).

Padrão de captura está descrito no `prompt-viabilidade-ping.v2.md` §11. Para
recapturar com endereços diferentes, reusar o mesmo padrão.

---

## Os 5 fixtures

| Arquivo | Estado esperado pelo parser | Endereço | Endpoint |
|---|---|---|---|
| `disponivel.detalhes-numero.json` | `DISPONIVEL` | Rua Quinze de Novembro, 100 — Balneário, Florianópolis — SC | `GET /api/cep/detalhes-numero` |
| `provavel-portas-limitadas.detalhes-numero.json` | `PROVAVEL` | Rua Halfeld, 200 — Centro, Juiz de Fora — MG | `GET /api/cep/detalhes-numero` |
| `sem-cobertura.detalhes-numero.json` | `SEM_COBERTURA` | Rua das Flôres, 100 — Compensa, Manaus — AM | `GET /api/cep/detalhes-numero` |
| `area-proibida-floripa.flow.json` | `AREA_PROIBIDA` | Rua Felipe Schmidt, 150 — Centro, Florianópolis — SC | `GET /api/coverage-area/` (UI não chamou `detalhes-numero`) |
| `area-proibida-sao-paulo.flow.json` | `AREA_PROIBIDA` | Avenida Paulista, 1000 — Bela Vista, São Paulo — SP | `GET /api/coverage-area/` (idem) |

---

## Schema de cada arquivo

### Para os 3 estados que têm `detalhes-numero` (DISPONIVEL, PROVAVEL, SEM_COBERTURA)

```jsonc
{
  "meta": {
    "state": "DISPONIVEL" | "PROVAVEL_PORTAS_LIMITADAS" | "SEM_COBERTURA",
    "address": "...",
    "capturedAt": "ISO-8601",
    "endpoint": "GET /api/cep/detalhes-numero",
    "expectedParserResult": "DISPONIVEL" | "PROVAVEL" | "SEM_COBERTURA",
    "note": "opcional, contexto extra"
  },
  "response": {
    // JSON cru exatamente como o gateway respondeu (top-level numero, completo,
    // latitude, longitude, coordenadas, resultado_google, cache, disponibilidade).
    // Schema documentado em prompt-viabilidade-ping.v2.md §3.4 / §3.5 / §3.6
  }
}
```

O parser recebe `response` como entrada. `meta` é só pra teste — não é
input do parser.

### Para os 2 estados AREA_PROIBIDA (Felipe Schmidt, Av. Paulista)

```jsonc
{
  "meta": {
    "state": "AREA_PROIBIDA",
    "address": "...",
    "capturedAt": "ISO-8601",
    "note": "UI do PinG não chamou /api/cep/detalhes-numero...",
    "expectedParserResult": "AREA_PROIBIDA"
  },
  "autocomplete": [ /* response de /api/autocomplete/ */ ],
  "coverageArea": [ /* response de /api/coverage-area/ — array de polígonos */ ],
  "ctosMapView": [ /* response de /network/api/v1/ctos/map_view, quando capturada */ ],
  "detalhesNumero": null,        // (Floripa) OU
  "detalhesNumeroCalled": false  // (SP)
}
```

Estes são usados para testar o **fast-path client-side** do parser:
`pointInForbidden(lat, lng, coverageArea)` → `true` → resultado
`AREA_PROIBIDA` sem precisar do `detalhes-numero`.

---

## Casos cobertos pelos fixtures

| Caso de teste | Fixture | Por que importa |
|---|---|---|
| `disponibilidade=available` + CTO `availability_status=available` + portas livres > 0 | `disponivel` | DISPONIVEL feliz |
| Múltiplos CTOs no array `ctos_within_range` (9 no fixture) | `disponivel` | Parser não pode assumir array de 1 |
| Top-level `disponibilidade=available` MAS 1ª CTO tem `availability_status=available_few_ports` | `provavel-portas-limitadas` | **Regra crítica**: agregação top-level mente; nosso `resultado` deriva da lista, não copia do gateway |
| `disponibilidade="no coverage"` (com espaço) + `tipo_disponibilidade="no_coverage"` (com underscore) | `sem-cobertura` | Mostra que os 2 campos têm convenções de string diferentes |
| `ctos_within_range=[]` + `forbidden_areas=[]` + `disponibilidade="no coverage"` | `sem-cobertura` | SEM_COBERTURA legítimo, distinto de erro |
| Ponto dentro de polígono `coverage_type=forbidden` — UI **NÃO chama detalhes-numero** | `area-proibida-floripa` / `area-proibida-sao-paulo` | Parser tem que fazer point-in-polygon (`pointInForbidden`) ANTES de chamar `detalhes-numero` |
| `cto_validation === "valid"` → `validada: true` | `disponivel` (CTO 38/2) | Mapeamento de campo |
| `available_ports !== ports - occupied_ports` | `disponivel` (CTO 38/2: ports=16, occupied=3, available_ports=16) e `provavel-portas-limitadas` (CTO #1: ports=8, occupied=7, available_ports=8) | **NÃO usar `available_ports` como "portas livres"**; usar `ports - occupied_ports` |
| `architecture === null` | `disponivel` (CTO 38/2) | Tolerância — não tratar null como `"unknown"` |
| `coordinates` da CTO é array `[lng, lat]` (GeoJSON) | todas | NÃO é objeto `{lat, lng}` como o `coordenadas` top-level |
| `numero` do top-level vem como string `"100"`, não number | todos os 3 com `detalhes-numero` | Parser deve converter |
| `cache: true` no top-level (cache do gateway) | `disponivel` | Propagar pra `ping.cache: true` no normalizado |

Os 16 edge cases enumerados em §11.5 da spec devem ter teste; nem todos
caem nos 5 fixtures — para os que não caem, o teste pode usar fixture
modificado / sintético.

---

## Como rodar

```js
const fs = require("fs");
const { normalizar, pointInForbidden } = require("../../ViabilidadeParser.js");

const fixture = JSON.parse(fs.readFileSync("disponivel.detalhes-numero.json", "utf8"));
const resultado = normalizar(fixture.response);
console.assert(resultado.resultado === fixture.meta.expectedParserResult,
  "DISPONIVEL fixture: esperado " + fixture.meta.expectedParserResult + ", veio " + resultado.resultado);
```

Para os fixtures AREA_PROIBIDA:

```js
const fixture = JSON.parse(fs.readFileSync("area-proibida-floripa.flow.json", "utf8"));
const sug = fixture.autocomplete[0]; // ou o que a busca selecionou
const lat = sug.latitude, lng = sug.longitude;
const inside = pointInForbidden(lat, lng, fixture.coverageArea);
console.assert(inside === true, "Felipe Schmidt deve cair em forbidden area");
```

---

## Histórico de capturas

- **2026-05-17** — captura inicial via Claude in Chrome (Cowork mode),
  sessão de Ricardo logado em `randrade.mobile@veropar.com.br`. Os 5
  fixtures listados acima.

Quando o Vero mudar schema, capturar de novo com o mesmo padrão e
versionar este arquivo + os JSONs.
