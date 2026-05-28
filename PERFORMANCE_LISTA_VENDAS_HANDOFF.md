# Handoff — Otimização Lista de Vendas (19/05/2026)

Documento de handoff entre sessão Cowork (Claude desktop) → Claude Code (CLI).

**Contexto:** Lista de Vendas levava ~45s para carregar. Diagnóstico identificou que
o maior culpado era `sincronizarTagsBotConversa` rodando em paralelo + invalidando
cache, além de gargalos secundários no `getVendasPaginadas`.

**Decisão tomada:** eliminar BotConversa sync completamente (sem utilidade segundo Ricardo)
e aplicar todas as otimizações P0+P1. Fase Supabase (P2) descartada por ora.

**Como as mudanças foram aplicadas:** Cowork editou os arquivos no Drive diretamente,
sem git/branch. Isso NÃO está deployado em produção ainda — falta `clasp push` (ou
revisão manual no editor Apps Script).

---

## Arquivos modificados

- `Code.js` (backend GAS)
- `JS.html` (frontend — google.script.run + render)
- `Index.html` (CSS)
- `Config.js` — **não tocado** (TOTAL_COLUNAS, CONFIG.COLUNAS inalterados)

---

## Mudanças por fase

### Fase 1 — Eliminar `sincronizarTagsBotConversa` (MAIOR GANHO)

**Code.js:**
- Função `sincronizarTagsBotConversa(forcar)` reduzida a stub que retorna `{ sucesso: true, atualizados: 0, skip: true }`. ~140 linhas de corpo original removidas (incluindo o loop de 100 chamadas HTTP em série + setValue por linha + LockService).
- Stub mantido pra evitar que algum trigger legado quebre. Pode ser apagado completamente quando confirmado que ninguém mais chama.
- Campos `bcTags` / `bcStatus` removidos do payload em:
  - `_mapearLinhaLista` (~linha 5160)
  - `_mapearLinha` (~linha 5240)
  - `_construirLinhaDados` (~linha 5305) — comentado: ao salvar venda, deixa de sobrescrever AN/AO
  - default da venda vazia (~linha 4186)

**JS.html:**
- Bloco `else if (pagina === 'lista')` (linha ~5162): removida a chamada `google.script.run.sincronizarTagsBotConversa(false)` e o handler que forçava `carregarVendas(1, '')` a recarregar quando `atualizados > 0`.
- `_renderizarLista` (linha ~7245): removido o badge `vi-bc-tags` / `vi-bc-status` do card.

**Index.html:**
- Removidas regras CSS `.vi-bc-status`, `.vi-bc-status--aberto/ok`, `.vi-bc-tags`.

**Impacto esperado:** elimina os ~30s recorrentes a cada 30min (gate da sync) que
forçavam recarregamento da Lista invalidando o cache local.

### Fase 2 — Cache em `_getVinculosVendasMap_`

**Code.js (~linha 5450):**
- `_getVinculosVendasMap_` agora consulta cache chunked (`CONFIG.CACHE_PREFIX + 'vinculos_map_v1'`) antes de ler o Sheets. TTL 300s.
- Novo helper `_limparCacheVinculosVendas_()` adicionado.
- `_limparCacheListaV3` agora chama `_limparCacheVinculosVendas_` no final (acoplamento — sempre que a Lista é invalidada, vínculos junto).
- `_registrarVinculoVenda_` também chama `_limparCacheVinculosVendas_` ao final.

**Impacto:** economiza 1-2s por chamada em cache MISS da Lista (eliminando 1 leitura do Sheets).

### Fase 3 — sessionStorage no frontend

**JS.html (~linha 6045):**
- Adicionados helpers `_listaCacheSalvarSS()`, `_listaCacheCarregarSS()`, `_listaCacheLimparSS()`.
- Chave `dharmapro_lista_v1`, TTL 120s.
- `pageLista` (linha ~5162): tenta `_listaCacheCarregarSS()` antes de chamar `carregarVendas`.
- `carregarVendas` (path com cache local): salva via `_listaCacheSalvarSS()` quando popula cache.
- `_carregarMaisDoServidor` e o prefetch silencioso (linha ~4900) também persistem após concat.
- `_listaNeedsReload = true` agora também chama `_listaCacheLimparSS()` pra evitar dado obsoleto.

**Impacto:** F5 / troca de aba na mesma sessão = lista renderiza em <200ms (vs 12-15s do MISS atual).

### Fase 4 — `Utilities.formatDate` → puro JS

**Code.js (~linha 4998):**
- Adicionados helpers `_fmtDataBR(d)` e `_fmtDataHoraBR(d)` (puro JS, getDate/getMonth/getFullYear).
- `_mapearLinhaLista`: 5 chamadas `Utilities.formatDate(..., tz, 'dd/MM/yyyy')` trocadas pelos helpers.
- O parâmetro `tz` continua sendo passado pro `_mapearLinhaLista` (compatibilidade), mas não é mais usado internamente nas datas.

**Impacto:** ~100× mais rápido por chamada. 500 linhas × 5 datas = 2500 calls → economiza ~7-12s no MISS.

**RISCO POTENCIAL:** se o script timezone do GAS estiver desalinhado com a TZ do
storage das datas, pode haver off-by-one. Validação: comparar 10 datas formatadas
antes/depois — devem bater 100%. Se notar erro, voltar a `Utilities.formatDate`.

### Fase 5 — Endpoint Lite + pipeline frontend

**Code.js (~linha 3942):**
- Novo `getVendasPaginadasLite(limite, offset)` adicionado após `getVendasPaginadas`. SEM cache, processa apenas o pedido. Reutiliza helpers (`_preScanColuna`, `_getVinculosVendasMap_`, `_lerBlocos`, `_mapearLinhaLista`, `_decorarVendaComVinculos_`).

**JS.html (~linha 6195):**
- `carregarVendas` reescrita no path de cache MISS pra fazer pipeline:
  1. `getVendasPaginadasLite(50, 0)` → renderiza imediato
  2. `getVendasPaginadas(1, '', {limite:500})` em background → popula cache backend + local
- Helpers internos: `_renderListaCacheLocal()`, `_erroListaHtml()`, `_carregarVendasFull()`
- Fallback automático para Full direto caso Lite falhe (compatibilidade com deploys parciais).

**Impacto:** primeiro paint ~2-3s (vs ~15s).

### Fase 6a — Limpeza de referências BC (já incluída na Fase 1)

### Fase 6b — Pendente (manual no Sheets)

Ricardo deve **limpar os valores** das colunas AN (BC_TAGS) e AO (BC_STATUS) na aba `'1 - Vendas'`:
1. Selecionar header AN e AO
2. Botão direito → "Limpar valores"
3. **NÃO excluir as colunas** — `CONFIG.COLUNAS` ainda referencia BC_TAGS/BC_STATUS (apenas não usa mais). Manter colunas = nenhuma re-indexação necessária.

### Fase 7 — Descartada por ora

Supabase read-model não vai ser implementado nesta rodada. Reavaliar após medir
ganho real das Fases 1-5 em produção.

---

## Checklist de validação antes do deploy

### Sintaxe & lint

- [ ] Abrir cada arquivo no editor Apps Script e verificar que não há erro de parsing
- [ ] Rodar `clasp push --dry-run` (se disponível) ou comparar diff manualmente
- [ ] Buscar referências órfãs: `grep -n "bcTags\|bcStatus\|sincronizarTagsBotConversa(" *.js *.html`
  - Devem aparecer **apenas** em comentários e no stub. Nenhuma chamada ativa.

### Smoke test no editor Apps Script (antes do clasp push)

Rodar manualmente cada uma destas funções e olhar o `Logger.log`:

```js
// 1. Lite — deve retornar em ~2-3s com 50 itens
function _testLite() {
  var t0 = Date.now();
  var res = getVendasPaginadasLite(50, 0);
  Logger.log('Lite: ' + (Date.now() - t0) + 'ms, dados=' + res.dados.length + ', totalGeral=' + res.totalGeral);
}

// 2. Full sem cache (limpe antes) — deve retornar em ~10-15s com 500 itens
function _testFull() {
  _limparCacheListaV3();
  var t0 = Date.now();
  var res = getVendasPaginadas(1, '', { limite: 500, offset: 0 });
  Logger.log('Full MISS: ' + (Date.now() - t0) + 'ms, dados=' + res.dados.length);
}

// 3. Full com cache — deve retornar em <1s
function _testFullCacheHit() {
  var t0 = Date.now();
  var res = getVendasPaginadas(1, '', { limite: 500, offset: 0 });
  Logger.log('Full HIT: ' + (Date.now() - t0) + 'ms');
}

// 4. Stub do BotConversa — deve retornar instantâneo com skip:true
function _testStub() {
  var res = sincronizarTagsBotConversa(false);
  Logger.log(JSON.stringify(res));
}

// 5. Vínculos cacheados — chama 2x, segunda em <50ms
function _testVinculos() {
  _limparCacheVinculosVendas_();
  var t0 = Date.now(); _getVinculosVendasMap_();
  Logger.log('Vinculos MISS: ' + (Date.now() - t0) + 'ms');
  t0 = Date.now(); _getVinculosVendasMap_();
  Logger.log('Vinculos HIT: ' + (Date.now() - t0) + 'ms');
}
```

### Validação visual após deploy

- [ ] Datas (dataAtiv, agenda, instal, verohub, criadoEm) aparecem no formato dd/MM/yyyy igual antes
- [ ] Spot-check: pegar 5 vendas conhecidas e comparar datas exibidas vs valor na planilha
- [ ] Vendas Fibra+Móvel ainda aparecem agrupadas no card
- [ ] Filtros (busca por nome, CPF, status, etc) funcionam localmente sem round-trip
- [ ] Paginação (carregar mais) funciona
- [ ] Salvar uma venda invalida cache (próximo load tem o dado novo)
- [ ] Abrir painel lateral de uma venda traz todos os campos completos (via getVendaPorLinha)
- [ ] F5 com Lista aberta → re-hidrata em <200ms

### Métricas a coletar

Logs `getVendasPaginadasLite` e `getVendasPaginadas` no executions panel do GAS após 1 dia:
- Mediana de tempo do Lite (esperado: ~2-3s)
- Mediana do Full MISS (esperado: ~10-15s)
- Taxa de Full HIT vs MISS (esperado: >70% HIT)

---

## Rollback se quebrar

Restaurar versão histórica dos 4 arquivos no Drive:
1. Cada arquivo → Arquivo → Histórico de versões → escolher versão de antes 19/05/2026
2. Após restaurar, `clasp push` da pasta restaurada

Se já estiver em produção (deploy feito) e tiver problema parcial:

**Datas off-by-one** (Fase 4):
Editar `_mapearLinhaLista` e voltar as 5 ocorrências de `_fmtDataBR(...)` / `_fmtDataHoraBR(...)` para `Utilities.formatDate(..., tz, 'dd/MM/yyyy')` e `'dd/MM/yyyy HH:mm'`.

**Cache de vínculos inconsistente** (Fase 2):
Rodar `_limparCacheVinculosVendas_()` no editor. Se ainda persistir, remover o cache HIT no início de `_getVinculosVendasMap_`.

**Lite com bug**:
No JS.html, em `carregarVendas`, trocar a primeira chamada `.getVendasPaginadasLite(50, 0)` por `.getVendasPaginadas(1, '', JSON.stringify({ limite: 500, offset: 0 }))`. Volta ao comportamento antigo.

**sessionStorage causando estado obsoleto**:
No console do navegador dos usuários: `sessionStorage.removeItem('dharmapro_lista_v1')`. Ou reduzir TTL de 120s para 30s no `_LISTA_SS_TTL`.

---

## Comandos sugeridos pro Claude Code

```bash
cd "G:\Meu Drive\Projetos Claude\dharmapro-crm"

# 1. (Se quiser inicializar git agora — projeto não está versionado)
git init
git add .
git commit -m "chore: snapshot antes de deploy performance lista (19/05/2026)"

# 2. Conferir diffs antes de push (compare contra a versão histórica do Drive
#    ou contra o GAS atual via clasp pull em outra pasta temp)
# Exemplo: clasp pull em pasta temp e diff
mkdir /tmp/dharmapro-prod && cd /tmp/dharmapro-prod
clasp clone <SCRIPT_ID>
diff -ru /tmp/dharmapro-prod "G:\Meu Drive\Projetos Claude\dharmapro-crm" | less

# 3. Rodar smoke tests no editor (manual)

# 4. Deploy
cd "G:\Meu Drive\Projetos Claude\dharmapro-crm"
clasp push
```

---

## Pontos que o Claude Code deve confirmar com Ricardo

1. **Stub `sincronizarTagsBotConversa`**: manter como segurança ou deletar completamente?
2. ~~**Helpers `_bcEnviarFluxo`, `_bcSubscriberByPhone`, `enviarMensagemBotConversa`**: continuam ativos no Code.js — são usados pra disparar fluxos pro cliente via botão no card. NÃO mexer.~~ **REMOVIDOS em 27/05/2026** junto com o botão 🤖 do card e a migração das notificações PAP pra Evolution API. Ver § "NOTIFICAÇÕES PAP" em `ParceirosAPI.js`.
3. **Trigger time-based** do GAS: confirmar que NÃO existe trigger chamando `sincronizarTagsBotConversa` (se existir, desativar manualmente em `Apps Script → Triggers`).
4. **Versão do CACHE_PREFIX**: o atual é `'crm_v3_'`. Se quiser invalidar TODOS os caches num bump, atualizar pra `'crm_v4_'` em Code.js.
