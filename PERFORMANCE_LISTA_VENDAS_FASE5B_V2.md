# Fase 5b V2 — Hot Working Set para Lista de Vendas

**Status:** branch `feat/perf-lista-vendas-fase5b`, 9 commits, sem deploy.
**Pré-requisito:** Fases 1–5 deployadas em v694 (19/05/2026).
**Origem:** insight do Ricardo — backoffice trabalha nas ~200 vendas mais recentes; cachear o universo quente e atualizar só a linha que muda em vez de invalidar tudo a cada save.

V2 substitui o spec original (`PERFORMANCE_LISTA_VENDAS_FASE5B.md`, descartado) após auditoria revelar 3 erros estruturais — ver §Apêndice A.

---

## Objetivo

Hoje, todo `save` invalida o cache da Lista via `_limparCache()` → `_limparCacheListaV3()`, forçando o próximo load a reconstruir 500 linhas (~40s). Pós-Fase 5b, save mantém cache quente e o próximo load é HIT (~500ms).

| Cenário | Pós-Fases 1–5 (v694) | Pós-Fase 5b |
|---|---|---|
| Cache HIT (abrir Lista 2x em sequência) | 520ms | 520ms |
| **Pós-save → reload da Lista** | **~7s pipeline Lite** | **~500ms cache HIT** |
| Pós-edição inline (turno/PAP/viabilidade/agendamento) | ~7s + bug do cache | ~500ms + bug corrigido |
| Primeira carga do dia | ~7–40s pipeline Lite→Full | igual (cache vazio) |
| Edição direta no Sheets sem passar pelo CRM | stale até TTL (5min) | stale até TTL (30min) ou clique no ↻ |

> O bug: edições rápidas (`salvarTurno`, `salvarStatusPAP`, etc.) chamavam só `_limparCacheListaCompleta()`. Mas o cache da Lista UI principal é `lista_v4`, invalidado por `_limparCacheListaV3()`. Resultado: edição não aparecia na Lista por até 5min. Os call sites refatorados (commits 5–7) corrigem isso de tabela.

---

## Pilares

1. **`_limparCacheSemLista()`** — variante de `_limparCache()` sem cascata em `lista_v4`/`lista_completa`. Sem essa função, `salvarVenda` continua invalidando tudo via cascata e a Fase 5b é teatro. Foi o achado central da auditoria do spec original.
2. **`_atualizarVendaNoCache_(numeroLinha)`** — UPDATE/INSERT cirúrgico. Reconstrói vínculos mãe+filhas pra manter card combo correto. Fallback gracioso pra invalidação total em erro.
3. **TTL 5min → 30min** — agressivo o suficiente pra reduzir MISSes operacionais, conservador o suficiente pra absorver edições externas (Sheets direto, n8n, scripts) sem virar dor crônica. 6h do spec original era exagerado.
4. **Badge "Há X min" + tooltip do ↻** — afordância visível pro usuário detectar stale e dar refresh manual.
5. **Telemetria HIT/MISS** via Script Properties — sem dado, é fé; com dado, decisão informada sobre o TTL.

---

## Commits aplicados (9)

| # | Commit | Risco | Impacto |
|---|---|---|---|
| 1 | `feat(lista): helpers de update fino + telemetria HIT/MISS` | Zero (aditivo) | Helpers disponíveis, sem chamadores |
| 2 | `feat(lista): TTL cache lista_v4 — 5min → 30min` | Baixo | 6× menos MISSes operacionais |
| 3 | `refactor(lista): salvarVenda usa update fino do cache` | **Alto** | Fluxo principal — o coração da Fase 5b |
| 4 | `refactor(lista): criarVendaMovelVinculada usa update fino` | Médio | Card combo atualiza imediatamente |
| 5 | `refactor(lista): call sites Adapter/NG usam update fino` | Médio | Var corrigida (`linha`, não `linhaNum`) |
| 6 | `refactor(lista): call sites de campos usam update fino` | Baixo | 7 funções (VeroHub, Turno, etc.) |
| 7 | `refactor(lista): call sites PAP usam update fino` | Baixo | 3 funções, var `payload.linha` na 3ª |
| 8 | `feat(lista): badge "Dados de até X min" + helper update fino local` | Médio | Afordância visual + opt-in pro futuro |
| 9 | `docs: PERFORMANCE_LISTA_VENDAS_FASE5B_V2.md` | Zero | Este arquivo |

Cada commit é deployável independentemente. Rollback de qualquer um (1–8) preserva os anteriores.

---

## Mudanças por arquivo

### `Code.js` — helpers novos (commit 1)

Adicionados após `_limparCache()`:

- `_limparCacheSemLista()` — fork de `_limparCache` sem invalidação de lista.
- `_atualizarVendaNoCache_(numeroLinha)` — UPDATE/INSERT no `lista_v4` e `lista_completa`. Lê venda + filhas + pai do Sheets, reconstrói resumo de vínculos.
- `_aplicarUpdateNoChunked_(key, linha, venda)` — helper privado. No-op se cache não existe.
- `_incCounter_(key)` — telemetria via Script Properties. Try/catch silencioso.

Plug em `getVendasPaginadas`:
- HIT → `_incCounter_('lista_cache_hit')` antes do return.
- MISS → `_incCounter_('lista_cache_miss')` antes do `var tz =`.

TTL bumpado de `300` para `1800` na linha 3922 (commit 2).

### `Code.js` — call sites refatorados (commits 3–7)

**`salvarVenda`** (commit 3, função 4214–4495):
- 3 dos 4 `_limparCache()` substituídos por `_limparCacheSemLista() + _atualizarVendaNoCache_(linhaNum/novaLinha)`.
- O 4º (rollback de Fibra Combo com `clearContent`) **mantém `_limparCache()`** — linha vazia degradaria o update fino. Comentário inline registra a decisão.
- No rollback do Móvel, atualiza também `linhaMv` se ≥ 3.

**`criarVendaMovelVinculada`** (commit 4, linha 4205):
- `_limparCache()` → `_limparCacheSemLista() + _atualizarVendaNoCache_(novaLinha) + _atualizarVendaNoCache_(linhaOrigem)`.
- Update da mãe garante que o vínculo recém-registrado em `Vinculos Vendas` apareça no card agrupado.

**Adapter/NG** (commit 5, linhas 625 e 689):
- `_limparCacheListaCompleta()` → `_atualizarVendaNoCache_(linha)`.
- Var corrigida: `linha`, **não** `linhaNum` (que o spec original errado dizia — quebraria por ReferenceError).

**Campos** (commit 6, 7 funções):
- `salvarVeroHub` (293), `salvarVeroHubPedidoManual` (317), `salvarTurno` (331), `salvarAgendamentoComContador` (367), `salvarPedidoVeroHub` (388), `criarPedidoVeroHub` (498), `salvarViabilidadeVenda` (523).
- Todos usam var `linha`. Substituição direta.

**PAP** (commit 7, 3 funções):
- `salvarStatusPAP` (2225), `marcarPagoPAP` (2239), `marcarPagoENotificarPAP` (2256).
- A terceira usa `payload.linha`; comentário inline registra.

**Sanity check final**: as 3 ocorrências remanescentes de `_limparCacheListaCompleta()` em `Code.js` são:
- Linha 4933: definição da função.
- Linha 5065: cascata interna de `_limparCache()` (intencional, p/ casos que invalidam de propósito).
- Linha 5141: fallback dentro de `_atualizarVendaNoCache_` quando o update fino falha.

### `JS.html` + `Index.html` (commit 8)

- Nova var `_dadosListaTimestamp` (ms epoch do último populate do cache local).
- 4 pontos de populate (prefetch sync, Full direto, Lite success, Full background) agora setam o timestamp.
- `_listaCacheCarregarSS` lê o timestamp do sessionStorage; `_listaCacheLimparSS` zera.
- `_atualizarBadgeIdadeLista()` renderiza idade humana ("Agora" / "Há Xs" / "Há X min" / "Há Xh") + tooltip com timestamp legível.
- `_renderizarLista` chama o badge ao final.
- `_atualizarVendaNoCacheLocal(venda)` disponível como top-level — **não amarrado nesta rodada** (backend já entrega cache HIT ~500ms; ganho marginal de fazer update local sub-100ms não justifica refetch da venda completa). Rodadas futuras podem plugar nos handlers de save.
- Badge `<span id="badgeIdadeLista">` no header da Lista + CSS discreto.
- Tooltip do botão ↻ reescrito.

### NÃO modificado (decisões explícitas)

- **`_arquivo.js:818`** (`_backfillSistemaVendas`): mantém `_limparCacheListaCompleta()`. Batch de N linhas — substituir por loop de update fino seria mais caro que invalidação total.
- **`arquivarVenda` (Code.js:226)**: usa `_limparCache()` mais `deleteRow`. `deleteRow` renumera todas as linhas abaixo — update fino com índice antigo bagunçaria o cache. Mantém intacto.
- **Otim A do spec original (pre-scan reduzido)**: pulado nesta rodada. Ganho marginal (-1 a -3s sobre 40s) e risco real de quebrar vínculos antigos (combo cuja Fibra está nas últimas 200 linhas mas Móvel está em linha 1800 sairia da janela). Reavaliar com telemetria.

---

## Smoke tests obrigatórios (`_perfListaSmokeTests.js`)

Rodar **na ordem** no editor Apps Script após `clasp push`:

| # | Função | Esperado | Crítico? |
|---|---|---|---|
| 1 | `_testUpdateFinoSemCache` | Sem erro, no-op se cache vazio | Não |
| 2 | `_testUpdateFinoComCache` | Update fino <1s; HIT pós-update <1s | Sim |
| 3 | **`_testSaveQuente`** | **save → reload <1s ✓ PASSOU** | **CRÍTICO — se >5s, não deploya** |
| 4 | `_testStubBcAposFase5b` | `{sucesso:true, skip:true}` | Sim |
| 5 | `_testTelemetria` | Imprime contadores (vai estar tudo zero antes de uso real) | Não |
| 6 | `_resetTelemetriaLista` | Zera contadores | Só na janela de medição |

O `_testSaveQuente` é o smoke test que valida o ponto central da Fase 5b. Se ele não passar, alguma invalidação total sobreviveu e a Fase 5b não está fazendo efeito. Não deployar até passar.

Arquivo deletar antes do deploy final.

---

## Telemetria (decidir o TTL com dado)

4 contadores em Script Properties:

- `counter_lista_cache_hit` — incrementado em cada HIT do `getVendasPaginadas`.
- `counter_lista_cache_miss` — incrementado em cada MISS (offset=0, sem filtro).
- `counter_lista_fine_update` — sucesso de `_atualizarVendaNoCache_`.
- `counter_lista_fine_update_fallback` — quantas vezes caiu no fallback de invalidação total (sinal de bug ou edge case).

**Procedimento de medição (1 semana):**

1. Logo após o deploy, no editor: `_resetTelemetriaLista()` zera contadores.
2. 7 dias depois: `_testTelemetria()` imprime os valores + HIT ratio.
3. Decisão:
   - **HIT ratio > 70%** → TTL adequado, deixar 1800s.
   - **HIT ratio 50–70%** → considerar subir para 3600s (1h).
   - **HIT ratio < 50%** → algo está invalidando o cache demais. Investigar `counter_lista_fine_update_fallback` — se for alto, há bug no helper.

---

## Rollback

**Reverter só o TTL** (commit 2):
```bash
git revert b1a4b1f
```

**Reverter um call site específico**: cada `refactor` (commits 3–7) é independente. `git revert <hash>` da função problemática.

**Reverter Fase 5b inteira**:
```bash
git checkout main
clasp deploy --deploymentId AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw --description "rollback fase 5b" --versionNumber 694
```

Volta exatamente ao estado pré-Fase 5b. O `_atualizarVendaNoCache_` tem fallback automático pra invalidação total em qualquer erro, então mesmo um bug discreto não derruba a operação — só faz cair em performance.

---

## Notas de risco residual

1. **Race condition** entre 2 saves simultâneos em funções não-locked (`salvarTurno`, `salvarStatusPAP`): o cache read-modify-write tem janela. Probabilidade baixa, dano contido (perde 1 update — telemetria captura via fallback contador).
2. **Reversão parcial de Móvel em combo**: bug pré-existente, comentado inline. Reversão só cobre Fibra; Móvel pode ficar em estado intermediário. Não é da Fase 5b.
3. **Edição externa (Sheets/n8n)**: até 30min stale. Solução: ↻ no header da Lista. Badge "Há X min" guia o usuário.
4. **`_atualizarVendaNoCache_` faz 1–3 leituras do Sheets** (venda + filhas + pai). Pra combo, ~3 reads. Vs ~40s do MISS, é negligível.
5. **`totalGeral` no cache pode divergir** em INSERTs concorrentes. Auto-corrige na próxima invalidação ou em ↻ manual.

---

## Pendências / próximos passos

- **Deploy formal**: rodar `_testSaveQuente` no editor → se passar, `clasp push --force` + `clasp deploy --deploymentId ... --description "perf(lista) fase 5b"`. Smoke tests `_perfListaSmokeTests.js` devem ser apagados no push seguinte.
- **Telemetria de 1 semana** antes de decidir ajuste no TTL.
- **Update fino frontend nos handlers de save** (linhas 855, 5944, 8003, 8143 do JS.html) — opcional, ganho marginal sobre o cache HIT backend de ~500ms. Helper `_atualizarVendaNoCacheLocal` já disponível.
- **Otim A (pre-scan reduzido)**: reavaliar após telemetria. Se MISS for raro, ganho de -2s é irrelevante; se for comum, vale o risco.
- **`_backfillSistemaVendas` e `arquivarVenda`**: estratégia separada se virarem dor. Hoje, intencionalmente fora do escopo.

---

## Apêndice A — Por que V2 (auditoria do spec original)

O spec original (`PERFORMANCE_LISTA_VENDAS_FASE5B.md`) tinha 3 problemas estruturais:

1. **Ignorou o caminho principal.** `salvarVenda` (função central de save) chama `_limparCache()`, não `_limparCacheListaCompleta()`. E `_limparCache()` cascateia em `_limparCacheListaV3()` ao final (linhas 5042–5043 da v694). A tabela A4 do spec listava 13 call sites de `_limparCacheListaCompleta()`, mas ignorava as 4 chamadas de `_limparCache()` em `salvarVenda` e a 1 em `criarVendaMovelVinculada`. Aplicar só a tabela A4 deixava `salvarVenda` invalidando tudo via cascata — Fase 5b virava teatro. V2 introduz `_limparCacheSemLista()` como peça central.

2. **9 nomes de função errados + 2 vars erradas + 1 sub que quebra** na tabela A4. Exemplos:
   - Linhas 625/689: spec dizia "salvarVenda (1)" e "salvarVenda (2)" com var `linhaNum`. Na verdade são `atualizarVendaComAdapter` e `atualizarVendaComNG` com var `linha`. `linhaNum` daria `ReferenceError`.
   - Linha 818 do `_arquivo.js`: spec dizia "arquivamento de venda". Na verdade é `_backfillSistemaVendas` (batch). Sem `linha` no escopo. Spec quebra na execução.

3. **TTL 6h era exagerado.** Stale operacional de 6h transforma o botão ↻ em ferramenta obrigatória. V2 usa 30min — equilibra HIT ratio com tolerância a edições externas, e o badge "Há X min" ensina o usuário a usar o ↻ quando necessário.

A análise completa está no histórico de conversa que gerou V2.
