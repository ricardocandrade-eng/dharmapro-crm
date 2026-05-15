# Plano de Implementação — Google Ads (espelho 1:1 do Meta Ads)

> **Status**: PROPOSTA · 14/05/2026
> **Autor**: Claude (Cowork) a pedido do Ricardo
> **Executor previsto**: Claude Code
> **Premissa de paridade**: 1:1 com Meta Ads — mesmas telas, mesmos KPIs, mesma cadência, mesma UX.
> **Origem dos leads**: Botconversa envia `utm_source=google` + `canal='GOOGLE ADS'` no payload do `doPost`.

---

## 0. Sumário executivo

O Meta Ads no DharmaPro é composto por 7 peças encadeadas: (1) backend `MetaAdsAPI.js`, (2) ingestão de leads via `doPost` quando vem `utm_*`, (3) auto-vínculo lead↔venda em `salvarVenda`, (4) tela `LeadsMetaAds.html` para qualificação manual, (5) `PainelAds.html` com workflow Diagnosticar→Decidir→Executar, (6) trigger 07h `gerarRelatorioDiarioAds` que grava na aba `Diagnostico Ads Diario`, (7) aba `Meta Ads ✦` no Dashboard com histórico.

Replicar isso para Google Ads é **um espelho estrutural quase idêntico**, com 3 desvios reais:

1. A Google Ads API é **REST com OAuth + developer token**, não Graph API.
2. O id de clique vem em `gclid`, não em `utm_ad`.
3. Tipos de campanha (Search, Performance Max, Display, Video) restringem que tipo de ação automática faz sentido (não dá pra "pausar por palavra-chave" numa PMax, por exemplo).

Com Espelho 1:1 + nada configurado ainda, o cronograma realista é **9 dias úteis de trabalho técnico distribuídos em 6 fases**, com **1 bloqueador externo** (aprovação do developer token leva 3–7 dias úteis e roda em paralelo).

---

## 1. Análise do espelho Meta Ads (state atual)

### 1.1 Backend (`MetaAdsAPI.js`, ~1600 linhas)

| Bloco | Funções públicas | O que faz |
|---|---|---|
| Config | `CFG_META` (linhas 7-20) | `ABA_LEADS_META`, `API_VERSION`, `AD_ACCOUNT_ID`, `LIMITES.{CPL_MAX, CTR_MIN, FREQUENCIA_MAX, CPA_META, CPA_MAX}`, `SCALE_FACTOR=1.20` |
| Ingestão | `registrarLeadMetaAds(payload)` (38-67), `registrarLeadManual(dados)` (69-86) | Append na aba `Leads Meta Ads` (12 cols), normaliza telefone (digits-only) |
| Trigger sheet | `onEditMetaAds(e)` (95-107) | Auto-timestamp em col K quando col I (status_final) ou J (motivo) muda |
| Vínculo | `vincularVendaLeadMetaAds(telefone)` (240-278) | Janela 30d, normaliza telefone (últimos 11 chars), marca `status_final='Converteu'` idempotente |
| Inteligência | `_buildInteligenciaComercialFromLeads_()` (376-465) | Agrega leads×vendas por cidade/campanha/medium/ad → melhor_cidade, melhor_oferta, pior_publico, pior_criativo |
| Painel | `getPainelAdsData(periodo)` (676-882) | POST a `https://graph.facebook.com/{version}/{ad_account}/insights`, monta `fila_prioritaria` com `modo:'cockpit_bridge'`. Períodos: hoje, 3d (default), 7d, 30d |
| Decisão | `registrarClaudeAdsActionDecision(usuario, decisionPayload)` (540-565) | Persiste decisão Aprovar/Rejeitar em Script Properties (`CLAUDE_ADS_ACTION_DECISIONS_JSON`) |
| Execução | `executarAcoesAprovadas()` (942-999), `_metaCampanhaUpdate_()` (892-908), `_metaAdsetGetBudget_()` (915-928) | Itera decisões aprovadas → POST status=PAUSED ou novo budget = atual × 1.20 |
| Relatório | `gerarRelatorioDiarioAds()` (1317-1338), `configurarTriggerRelatorioDiarioAds()` (1558-1570) | Reusa pipeline do Painel + chama `_callClaudeApiDiag_` (resumo ≤500 chars) → grava em `Diagnostico Ads Diario` (idempotente por data) |
| Histórico | `getRelatorioAdsHistorico(dias)` | Lê últimos N dias da aba para alimentar Dashboard |
| Manutenção | `excluirLeadMetaAds`, `atualizarStatusLeadMetaAds`, `removerValidacoesLeadsMetaAds` | CRUD da aba Leads |

### 1.2 Frontend

- **`LeadsMetaAds.html`** — tabela com 9 colunas, **coluna Ação sticky à direita** (`position:sticky; right:0; z-index:100`), `min-width:1280px`, scroll horizontal habilitado. Status e Motivo desq. são `<select>` populados client-side (frontend é fonte de verdade — backend limpa validações herdadas no save).
- **`PainelAds.html`** — workflow bar 3 passos (Diagnosticar → Decidir → Executar). Botões de período: Hoje · 3 dias (default) · 7 dias · 30 dias. KPIs em grid 4-col (gasto, leads, impressões, cliques, CPL, CTR, CPM, conversões, taxa, CPA). Cards de campanha (3-col grid). Fila de Decisão com cards Aprovar/Rejeitar e callout `human_check`. Botão "Executar Aprovadas" no rodapé chama `executarAcoesAprovadas()`. UX didático com "O que acontece se você aprovar/rejeitar".
- **`Dashboard.html` aba `Meta Ads ✦`** — filtros 1d/3d/7d/30d (slice client-side), KPIs do último snapshot, gráfico Chart.js de barras com seletor de métrica, lista cronológica dos resumos da Claude.

### 1.3 Roteamento `doPost` (Code.js:1272-1281)

```js
if (payload.utm_source || payload.utm_campaign) {
  // (mesmo com payload.secret presente — fix v462)
  var linhaMetaAds = registrarLeadMetaAds(payload);
  return ContentService
    .createTextOutput(JSON.stringify({ ok:true, modulo:'meta_ads', linha:linhaMetaAds }))
    ...
}
```

E na rota default de venda (`Code.js:1366`): `canal: String(payload.canal || 'META ADS').trim()`.

### 1.4 Schemas

**Aba `Leads Meta Ads`** (12 cols A-L):

| Col | Campo | Tipo |
|---|---|---|
| A | data_entrada | Date |
| B | nome | String |
| C | telefone | String (digits-only) |
| D | cidade | String |
| E | utm_source | String |
| F | utm_campaign | String |
| G | utm_ad | String |
| H | utm_medium | String |
| I | status_final | Enum (vazio / Converteu / Desqualificado / Em negociação / Sem contato) |
| J | motivo_desqualificacao | String (opcional) |
| K | data_status | Date (auto via `onEditMetaAds`) |
| L | observacao | String |

**Aba `Diagnostico Ads Diario`** (compartilhada para histórico): data como chave de idempotência, KPIs do dia, resumo Claude ≤500 chars.

### 1.5 Config / Permissões / Escopos

- `Config.js:54-58` — `PERFIS_MENUS` libera `metaads` e `painelads` para admin/supervisor/backoffice.
- `appsscript.json:6-15` — escopos atuais (`drive`, `spreadsheets`, `script.external_request`, `script.scriptapp`, `userinfo.email`, `gmail.readonly`).
- Script Properties: `META_ACCESS_TOKEN`, `CLAUDE_ADS_ACTION_DECISIONS_JSON`, idempotência diária em outra property.

### 1.6 Triggers

- `onEditMetaAds` — sheet trigger.
- Time-based 07h `gerarRelatorioDiarioAds` configurado por `configurarTriggerRelatorioDiarioAds()` (idempotente).

---

## 2. Diferenças Google Ads × Meta Ads

| Tópico | Meta Ads (atual) | Google Ads (proposto) |
|---|---|---|
| Auth | Long-lived Page Access Token (`META_ACCESS_TOKEN`) | OAuth 2.0 (refresh token) **+** Developer Token **+** Customer ID |
| Endpoint | `graph.facebook.com/v20.0` | `googleads.googleapis.com/v17` |
| Body | Form-urlencoded em POSTs | JSON com header `developer-token` + `Authorization: Bearer …` + `login-customer-id` (se MCC) |
| Métrica de campanha | `/insights` com `actions[]` para conversões | GAQL (Google Ads Query Language) via `customers/{id}/googleAds:searchStream` |
| Identificação do lead | `utm_campaign` (id da campanha) + `utm_ad` (id do anúncio) | `gclid` (clique único) — opcionalmente `utm_source=google&utm_medium=cpc&utm_campaign=<id>` se a LP usa Google Click Tracking template |
| Hierarquia de objetos | Campaign → AdSet → Ad | Campaign → AdGroup → Ad (Search/Display); Campaign único (PMax/Demand Gen/Video) |
| Pausar | `POST {ad_account}/insights` com `status=PAUSED` no nível campanha/adset | Mutate `customers/{id}/campaigns:mutate` com `update_mask=status` valor `PAUSED` |
| Scale (+budget) | PATCH no adset com `daily_budget` em centavos | Mutate `customers/{id}/campaignBudgets:mutate` com `amount_micros` (R$ × 1.000.000) |
| Limites operacionais | CPL_MAX, CTR_MIN, FREQUENCIA_MAX | Equivalentes: CPL_MAX, CTR_MIN, IMPRESSION_SHARE_LOST_RANK_MIN, SEARCH_TOP_IS_MIN, AVERAGE_CPC_MAX |
| Restrição por tipo | Não relevante | **PMax/Demand Gen** não permitem pausar por anúncio nem editar bid por keyword. A fila de decisão precisa filtrar ações por `advertising_channel_type` |
| Validação webhook | Idem | Idem (`payload.secret`) |
| Integração com Botconversa | Configurar fluxo p/ enviar `utm_source=google` quando lead vier do Google | Idem |

---

## 3. Pré-requisitos / Acessos / Credenciais (Fase 0 — bloqueador)

Como **nada está configurado**, esta fase precisa começar **agora** porque o developer token tem aprovação manual do Google (3–7 dias úteis em média) e roda em paralelo com o trabalho técnico.

### 3.1 Conta Google Ads

| Item | Como obter | Custo | Prazo |
|---|---|---|---|
| Conta Google Ads do anunciante (Mobile Digital) | https://ads.google.com (criar nova conta) | 0 (cobrança ocorre nos anúncios) | 30 min |
| Conta MCC (My Client Center) | https://ads.google.com/intl/pt-BR_br/home/tools/manager-accounts/ | 0 | 30 min |
| Vincular Anunciante ao MCC | Pelo MCC: "Contas → +" → enviar convite → anunciante aceita | 0 | 1 dia (espera de aceite) |
| Customer ID (10 dígitos, formato `123-456-7890`) do anunciante | Visível no canto sup. dir. da conta | — | imediato |
| Customer ID do MCC (`login-customer-id`) | Idem dentro do MCC | — | imediato |

### 3.2 Developer Token

| Item | Como obter | Custo | Prazo |
|---|---|---|---|
| Developer Token nível Test | Dentro do MCC: Tools → API Center → "Apply for access" | 0 | 1-3 dias úteis (aprovação automática para Test) |
| Promover para Standard (necessário pra contas reais) | Dentro do API Center: "Apply for Basic/Standard access" — preencher questionário descrevendo o uso | 0 | **3-7 dias úteis** (revisão humana) |

> ⚠️ Test token só funciona contra contas de teste, **não contra a conta real**. É preciso o Standard antes de coletar dados verdadeiros.

### 3.3 OAuth 2.0

| Item | Como obter | Prazo |
|---|---|---|
| Projeto no Google Cloud Console | https://console.cloud.google.com → Novo projeto | 5 min |
| Habilitar Google Ads API no projeto | "APIs & Services → Enable APIs → Google Ads API" | 1 min |
| OAuth Consent Screen (Internal ou External) | Configurar — se External, fica em "Testing" e basta adicionar Ricardo como tester | 10 min |
| OAuth Client ID (tipo "Desktop app" ou "Web app") | "Credentials → + Create credentials → OAuth client ID" | 5 min |
| Refresh Token | Rodar one-shot OAuth flow local (Node `google-ads-api` lib OU `oauth2l` CLI OU helper Apps Script com redirect manual) | 30 min |

Resultado: armazenar nos Script Properties:
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID` (anunciante, 10 dígitos sem hífen)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (MCC, 10 dígitos sem hífen — opcional, só se houver MCC)

### 3.4 Botconversa / Tracking

Configurar o fluxo do Botconversa para reconhecer leads vindos do Google:
- Quando o lead chega via LP do Google Ads (a LP precisa propagar `utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&gclid={gclid}` na URL — **template de tracking nativo do Google Ads** que adiciona automaticamente os UTMs).
- O Botconversa envia ao webhook do DharmaPro: `{ utm_source:'google', utm_campaign:'…', utm_medium:'cpc', gclid:'…', canal:'GOOGLE ADS', secret:'…', nome, telefone, cidade }`.

---

## 4. Arquitetura proposta

### 4.1 Arquivos novos

```
GoogleAdsAPI.js           ← backend, espelho de MetaAdsAPI.js
LeadsGoogleAds.html       ← espelho de LeadsMetaAds.html
PainelAdsGoogle.html      ← espelho de PainelAds.html  (alternativa: aba dentro do PainelAds existente — ver §11)
```

### 4.2 Arquivos modificados

```
Code.js                   ← roteamento do doPost (§7), getPainelAdsGoogleHtml(), getLeadsGoogleAdsHtml()
Config.js                 ← PERFIS_MENUS adiciona 'googleads' e 'painelAdsGoogle' (ou mantém unificado — §11)
Index.html                ← itens de menu novos + páginas
JS.html                   ← navegar() reconhece 'googleads' / 'painelAdsGoogle'
Dashboard.html            ← nova aba "Google Ads ✦" OU evolução da "Meta Ads ✦" para multi-canal (§11)
appsscript.json           ← (nenhum escopo novo — script.external_request já cobre)
Usuarios.html             ← labels dos novos menus na grade de permissões
```

### 4.3 Convenção de nomes

Tudo o que hoje é `meta` / `Meta` vira o equivalente `google` / `Google` em ambos backend e frontend, **mantendo a mesma assinatura de função** quando possível, para facilitar futura abstração comum.

---

## 5. Schemas

### 5.1 Aba nova: `Leads Google Ads`

Idêntica à `Leads Meta Ads`, com **uma coluna a mais** para `gclid`:

| Col | Campo | Tipo | Observação |
|---|---|---|---|
| A | data_entrada | Date | |
| B | nome | String | |
| C | telefone | String | digits-only, normalizado |
| D | cidade | String | |
| E | utm_source | String | sempre `google` |
| F | utm_campaign | String | id ou nome da campanha |
| G | utm_ad | String | id do anúncio (search/display) ou vazio (PMax) |
| H | utm_medium | String | `cpc`, `display`, `video` |
| I | gclid | String | identificador único do clique do Google (novidade vs Meta) |
| J | status_final | Enum | vazio / Converteu / Desqualificado / Em negociação / Sem contato / Base Vero |
| K | motivo_desqualificacao | String | opcional |
| L | data_status | Date | auto via `onEditGoogleAds` |
| M | observacao | String | |

> **Decisão de design**: por que não reusar a mesma aba? Porque (a) Meta Ads roda há tempo e tem 1k+ linhas que não devem migrar de schema, (b) Painéis e relatórios consultam por canal — separar é mais simples que filtrar, (c) `gclid` só faz sentido em Google.

### 5.2 Aba `Diagnostico Ads Diario` — expandir, NÃO duplicar

A aba já existe e é referenciada pelo Dashboard. Em vez de criar uma `Diagnostico Ads Diario Google` separada, **adicionar coluna `canal`** (após a data) e adaptar:

| Antes | Depois |
|---|---|
| `data, gasto, leads, conversoes, ctr, cpm, frequency, resumo_claude` | `data, canal ('META' \| 'GOOGLE'), gasto, leads, conversoes, ctr, cpm, frequency, resumo_claude` |

Justificativa: mantém histórico no mesmo lugar, simplifica gráficos comparativos no Dashboard, idempotência passa a ser por `(data, canal)`. Migração: rodar one-shot `_backfillCanalDiagnosticoAds` que preenche `META` em todas as linhas existentes.

### 5.3 Coluna `canal` na aba `1 - Vendas`

Já existe. Valor `GOOGLE ADS` já está documentado (`Code.js:33`). Nada a fazer no schema.

---

## 6. Backend `GoogleAdsAPI.js` — funções espelhadas

### 6.1 Config

```js
var CFG_GOOGLE = {
  ABA_LEADS_GOOGLE:    'Leads Google Ads',
  API_VERSION:         'v17',
  ENDPOINT_BASE:       'https://googleads.googleapis.com',
  // Credenciais via Script Properties:
  //   GOOGLE_ADS_DEVELOPER_TOKEN
  //   GOOGLE_ADS_CLIENT_ID
  //   GOOGLE_ADS_CLIENT_SECRET
  //   GOOGLE_ADS_REFRESH_TOKEN
  //   GOOGLE_ADS_CUSTOMER_ID
  //   GOOGLE_ADS_LOGIN_CUSTOMER_ID  (opcional — só se houver MCC)
  LIMITES: {
    CPL_MAX:                   30,    // mesma régua do Meta
    CTR_MIN:                   0.5,
    AVG_CPC_MAX:               3.50,
    SEARCH_TOP_IS_MIN:         60,    // % share de impressões no topo
    SEARCH_LOST_IS_RANK_MAX:   30,    // % perda por rank baixo
    CPA_META:                  60,
    CPA_MAX:                   120,
  },
  SCALE_FACTOR: 1.20
};
```

### 6.2 Funções — paridade 1:1

| Espelho de | Nova função | O que muda |
|---|---|---|
| `registrarLeadMetaAds(payload)` | `registrarLeadGoogleAds(payload)` | grava col I = `payload.gclid` |
| `registrarLeadManual(dados)` | `registrarLeadGoogleManual(dados)` | wrapper |
| `onEditMetaAds(e)` | `onEditGoogleAds(e)` | timestamp em col L (em vez de K) quando J ou K editadas |
| `vincularVendaLeadMetaAds(telefone)` | `vincularVendaLeadGoogleAds(telefone)` | mesma janela 30d, mesma normalização. Em `salvarVenda` → tentar vincular Meta E Google (chamadas independentes) |
| `_buildInteligenciaComercialFromLeads_()` | `_buildInteligenciaComercialFromLeadsGoogle_()` | agrega por cidade/campanha/medium/gclid |
| `getPainelAdsData(periodo)` | `getPainelAdsGoogleData(periodo)` | usa GAQL (§6.3); monta `fila_prioritaria` por tipo de campanha |
| `registrarClaudeAdsActionDecision(...)` | **REUSAR** com sufixo de canal no `action_id` (`google_<id>` vs `meta_<id>`) | nova property `CLAUDE_ADS_ACTION_DECISIONS_GOOGLE_JSON` |
| `executarAcoesAprovadas()` | `executarAcoesAprovadasGoogle()` | usa mutate API (§6.3) |
| `_metaCampanhaUpdate_`, `_metaAdsetGetBudget_` | `_googleCampanhaPause_`, `_googleBudgetUpdate_` | endpoints/payloads diferentes |
| `gerarRelatorioDiarioAds()` | `gerarRelatorioDiarioAdsGoogle()` | grava com `canal='GOOGLE'` |
| `configurarTriggerRelatorioDiarioAds()` | `configurarTriggerRelatorioDiarioAdsGoogle()` | trigger 07h05 (5 min após Meta pra evitar concorrência de Claude API) |
| `getRelatorioAdsHistorico(dias)` | adaptar para receber filtro `canal` | `getRelatorioAdsHistorico(dias, canal='ALL')` |
| `excluirLeadMetaAds`, `atualizarStatusLeadMetaAds`, `removerValidacoesLeadsMetaAds` | versões `…GoogleAds` | mesma lógica, outra aba |

### 6.3 Detalhes técnicos novos

**OAuth (refresh access token)** — helper `_googleAdsAccessToken_()`:

```js
function _googleAdsAccessToken_() {
  var props = PropertiesService.getScriptProperties();
  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      client_id:     props.getProperty('GOOGLE_ADS_CLIENT_ID'),
      client_secret: props.getProperty('GOOGLE_ADS_CLIENT_SECRET'),
      refresh_token: props.getProperty('GOOGLE_ADS_REFRESH_TOKEN'),
      grant_type:    'refresh_token'
    },
    muteHttpExceptions: true
  });
  var data = JSON.parse(resp.getContentText());
  if (!data.access_token) throw new Error('OAuth Google Ads falhou: ' + resp.getContentText());
  return data.access_token;  // válido por ~1h — não cachear se o ciclo for curto
}
```

**Headers padrão para qualquer chamada**:

```js
function _googleAdsHeaders_() {
  var props = PropertiesService.getScriptProperties();
  var h = {
    'Authorization':    'Bearer ' + _googleAdsAccessToken_(),
    'developer-token':  props.getProperty('GOOGLE_ADS_DEVELOPER_TOKEN'),
    'Content-Type':     'application/json'
  };
  var loginCid = props.getProperty('GOOGLE_ADS_LOGIN_CUSTOMER_ID');
  if (loginCid) h['login-customer-id'] = loginCid;
  return h;
}
```

**Insights via GAQL** (substitui o `/insights` do Meta):

```js
function _googleAdsQueryCampanhas_(since, until) {
  var props = PropertiesService.getScriptProperties();
  var cid = props.getProperty('GOOGLE_ADS_CUSTOMER_ID');  // sem hífen
  var query = [
    'SELECT',
    '  campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,',
    '  campaign_budget.amount_micros,',
    '  metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,',
    '  metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion,',
    '  metrics.search_top_impression_share, metrics.search_impression_share,',
    '  metrics.search_rank_lost_impression_share',
    'FROM campaign',
    "WHERE segments.date BETWEEN '" + since + "' AND '" + until + "'",
    "  AND campaign.status != 'REMOVED'"
  ].join('\n');
  var resp = UrlFetchApp.fetch(
    CFG_GOOGLE.ENDPOINT_BASE + '/' + CFG_GOOGLE.API_VERSION + '/customers/' + cid + '/googleAds:searchStream',
    { method: 'post', headers: _googleAdsHeaders_(), payload: JSON.stringify({ query: query }), muteHttpExceptions: true }
  );
  // Resposta vem como NDJSON (uma linha por chunk) — parsear acumulando
  return _parseSearchStream_(resp.getContentText());
}
```

**Pausar campanha** (substitui `_metaCampanhaUpdate_`):

```js
function _googleCampanhaPause_(campaignResourceName) {
  var props = PropertiesService.getScriptProperties();
  var cid = props.getProperty('GOOGLE_ADS_CUSTOMER_ID');
  var body = { operations: [{ update: { resource_name: campaignResourceName, status: 'PAUSED' }, update_mask: 'status' }] };
  var resp = UrlFetchApp.fetch(
    CFG_GOOGLE.ENDPOINT_BASE + '/' + CFG_GOOGLE.API_VERSION + '/customers/' + cid + '/campaigns:mutate',
    { method: 'post', headers: _googleAdsHeaders_(), payload: JSON.stringify(body), muteHttpExceptions: true }
  );
  return JSON.parse(resp.getContentText());
}
```

**Atualizar budget** (Google usa `amount_micros`: R$ 50,00 = 50.000.000):

```js
function _googleBudgetUpdate_(budgetResourceName, novoValorReais) {
  var amountMicros = Math.round(novoValorReais * 1000000);
  var body = { operations: [{ update: { resource_name: budgetResourceName, amount_micros: amountMicros }, update_mask: 'amount_micros' }] };
  // POST customers/{cid}/campaignBudgets:mutate ...
}
```

**Restrição por tipo de campanha** — antes de gerar fila prioritária:

```js
function _googleAcoesPermitidasParaTipo_(channelType) {
  // SEARCH/DISPLAY: pause, scale_budget, scale_keyword
  // VIDEO:         pause, scale_budget
  // PERFORMANCE_MAX/DEMAND_GEN: pause, scale_budget (nada de keyword)
  // SHOPPING:      pause, scale_budget
  switch ((channelType||'').toUpperCase()) {
    case 'PERFORMANCE_MAX':
    case 'DEMAND_GEN':
    case 'VIDEO':
    case 'SHOPPING':   return ['pause_campaign','scale_budget'];
    default:           return ['pause_campaign','scale_budget','scale_keyword'];
  }
}
```

---

## 7. Roteamento `doPost` (Code.js)

Padrão atual em `Code.js:1272-1281` — adicionar **antes** dele uma verificação específica de Google e antes manter o fallback Meta:

```js
// PRIORIDADE 1: gclid presente → Google Ads (mais específico que utm_*)
if (payload.gclid || (String(payload.utm_source||'').toLowerCase() === 'google')) {
  if (SECRET && payload.secret && payload.secret !== SECRET) { /* return 403 */ }
  var linhaGoogle = registrarLeadGoogleAds(payload);
  return ContentService
    .createTextOutput(JSON.stringify({ ok:true, modulo:'google_ads', linha:linhaGoogle }))
    .setMimeType(ContentService.MimeType.JSON);
}

// PRIORIDADE 2: utm_source/utm_campaign genérico → Meta Ads (rota atual)
if (payload.utm_source || payload.utm_campaign) {
  // ... código atual mantido
}
```

Justificativa da ordem: leads Google **podem** vir com `utm_source=google` (que satisfaz a condição Meta-genérica também). Verificar `gclid` ou `utm_source==='google'` ANTES garante que Google captura primeiro.

Para a **rota default de venda** (`Code.js:1366`), `canal` continua vindo de `payload.canal || 'META ADS'`. Botconversa configurado para enviar `canal:'GOOGLE ADS'` em leads Google — nenhuma mudança no código necessária aqui, só na config do Botconversa.

---

## 8. Frontend

### 8.1 `LeadsGoogleAds.html`

Cópia de `LeadsMetaAds.html` com diff cirúrgico:
- Renomear ids: `pageLeadsMetaAds` → `pageLeadsGoogleAds`, `_lmaDados` → `_lgaDados`, etc.
- Adicionar **coluna `gclid`** entre `utm_ad` e `status` (truncar para 16 chars com `title=…` exibindo o id completo).
- Manter coluna Ação sticky.
- Modal de "registrar manual" ganha campo opcional `gclid`.
- Filtros: status / campanha / busca de texto + **filtro de tipo de campanha** (Search/PMax/Display/Video) lido de `_buildInteligenciaComercialFromLeadsGoogle_`.

### 8.2 `PainelAdsGoogle.html`

Cópia de `PainelAds.html` com diff:
- Workflow bar idêntica.
- KPIs: substituir `frequency` por `search_top_is` (% de impressões no topo) e `cpa` por `cpa_real_google` (cálculo idêntico).
- Cards de campanha mostram `advertising_channel_type` em badge (Search/PMax/Display/Video).
- Fila de Decisão: ações filtradas por `_googleAcoesPermitidasParaTipo_`.
- Cards Aprovar/Rejeitar continuam idênticos; ids prefixados com `google_` para não colidir com Meta no Script Properties.
- Botão "Executar Aprovadas" chama `executarAcoesAprovadasGoogle()`.

### 8.3 Dashboard — aba `Google Ads ✦` ou `Ads ✦` unificada?

**Recomendação**: criar primeiro como aba separada `Google Ads ✦`, espelho da `Meta Ads ✦`, lendo `getRelatorioAdsHistorico(dias, 'GOOGLE')`. Ambas convivem.

Em uma fase 2 (depois que Google estiver estabilizado), avaliar consolidar em uma única aba `Ads ✦` com toggle Meta/Google/Ambos no header — fica como ITEM DE BACKLOG, não no escopo deste plano.

### 8.4 Menu / `Index.html` / `JS.html`

Adicionar dois itens novos no menu lateral, **logo abaixo dos itens Meta**:

```html
<!-- Index.html, próximo da linha 2176-2177 -->
<div class="nav-item" id="menuPainelAdsGoogle"   onclick="navegar('painelAdsGoogle')"><span class="icon">▲</span> Painel Ads Google</div>
<div class="nav-item" id="menuLeadsGoogleAds"    onclick="navegar('googleads')">     <span class="icon">◇</span> Leads Google Ads <span class="nav-badge" id="badgeLeadsGoogleAds"></span></div>
```

> Manter ícone `◈` no Meta e `◇` no Google para diferenciar visualmente.

`JS.html` — adicionar branches em `navegar()` (próximo de `JS.html:4221`):

```js
} else if (pagina === 'googleads') {
  document.getElementById('menuLeadsGoogleAds').classList.add('ativo');
  document.getElementById('pageLeadsGoogleAds').classList.add('ativa');
  carregarLeadsGoogleAds();
} else if (pagina === 'painelAdsGoogle') {
  document.getElementById('menuPainelAdsGoogle').classList.add('ativo');
  document.getElementById('pagePainelAdsGoogle').classList.add('ativa');
  google.script.run.withSuccessHandler(/*…*/).getPainelAdsGoogleHtml();
}
```

E o array `_menusPermitidos` em `JS.html:4098` recebe `'googleads'` e `'painelAdsGoogle'`. O mapa `id-menu` em `JS.html:4108` ganha `'googleads': 'menuLeadsGoogleAds'` e `'painelAdsGoogle': 'menuPainelAdsGoogle'`.

### 8.5 `Config.js` / `Usuarios.html`

`Config.js` — `PERFIS_MENUS` ganha `'googleads'` e `'painelAdsGoogle'` para os 3 perfis (mesma matriz de Meta):

```js
'admin':      [..., 'metaads','painelads', 'googleads','painelAdsGoogle', ...],
'supervisor': [..., 'metaads','painelads', 'googleads','painelAdsGoogle', ...],
'backoffice': [..., 'metaads','painelads', 'googleads','painelAdsGoogle']
```

`Usuarios.html` — `:294-311` ganha labels:

```js
'googleads':       'Leads Google Ads',
'painelAdsGoogle': 'Painel Ads Google',
```

E o array de toggles na linha 311 inclui os 2 novos.

---

## 9. Triggers / Cron

| Trigger | Quando | O que faz |
|---|---|---|
| `onEditGoogleAds` (sheet trigger) | Edit em `Leads Google Ads` cols J/K | Auto-timestamp em col L |
| `gerarRelatorioDiarioAdsGoogle` (time-based) | **07h05 BRT** (5 min depois do Meta) | Idêntico ao Meta, com `canal='GOOGLE'` |

Configurar via `configurarTriggerRelatorioDiarioAdsGoogle()` (one-shot a rodar no editor).

---

## 10. Testes / smoke / aceite

### 10.1 Smoke tests por fase

| Fase | Smoke test | Resultado esperado |
|---|---|---|
| 0. Credenciais | `_googleAdsAccessToken_()` no editor | Retorna string longa começando com `ya29.…` |
| 0. Credenciais | `_googleAdsHeaders_()` no editor | Retorna 4 headers (5 se MCC) |
| 0. Credenciais | GAQL básica `SELECT customer.id FROM customer LIMIT 1` | 200 OK |
| 1. Schema | Aba `Leads Google Ads` criada com 13 cols | Header correto |
| 1. Schema | `_backfillCanalDiagnosticoAds` rodado | Todas linhas históricas com `canal='META'` |
| 2. Ingestão | POST manual no webhook com `gclid`+`utm_source=google` | 200, `modulo:'google_ads'`, linha nova |
| 2. Ingestão | POST sem `gclid` mas com `utm_source=google` | 200, vai pra Google |
| 2. Ingestão | POST sem `gclid` com `utm_source=meta_ads` | 200, vai pra Meta (regressão zero) |
| 3. Vínculo | Criar venda com mesmo telefone de lead Google últimos 30d | `status_final='Converteu'` automático |
| 4. Painel | `getPainelAdsGoogleData('3d')` no editor | JSON com `kpis`, `campanhas[]`, `fila_prioritaria[]` |
| 4. Painel | Aprovar 1 ação de pause + `executarAcoesAprovadasGoogle()` | Campanha vira PAUSED na Google Ads UI |
| 5. Relatório | Chamar `gerarRelatorioDiarioAdsGoogle()` manual | Linha nova em `Diagnostico Ads Diario` com canal='GOOGLE' |
| 5. Relatório | Chamar 2x mesma data | Idempotente — só 1 linha |
| 6. Dashboard | Aba `Google Ads ✦` mostra último snapshot | KPIs corretos |
| 7. Permissões | Login como `supervisor` | Vê `Leads Google Ads` e `Painel Ads Google` |
| 7. Permissões | Login como `backoffice` | Idem |

### 10.2 Critérios de aceite end-to-end

- [ ] Lead novo do Google (Botconversa → webhook) cai em `Leads Google Ads` com `gclid` preservado.
- [ ] Venda com canal=`GOOGLE ADS` é gravada corretamente no `1 - Vendas`.
- [ ] Vínculo lead↔venda funciona pra Google e pra Meta no mesmo `salvarVenda` (chamadas independentes, ambas opcionais).
- [ ] Painel Ads Google carrega em ≤5s para período `3d`.
- [ ] Pausar uma campanha pelo Painel altera o status real na Google Ads.
- [ ] Aumentar budget +20% pelo Painel altera o budget real.
- [ ] Relatório 07h05 grava 1 linha por dia em `Diagnostico Ads Diario`.
- [ ] Dashboard `Google Ads ✦` exibe os últimos N dias filtrados.
- [ ] Meta Ads continua funcionando 100% sem regressão (testar todos os flows do Meta após cada deploy de Google).

---

## 11. Plano de execução por fases

| Fase | Trabalho | Dias úteis | Bloqueador externo |
|---|---|---|---|
| **0. Acessos & credenciais** | Criar conta MCC + anunciante, vincular, solicitar developer token Standard, OAuth Client, refresh token, configurar Script Properties | **1-2** + **3-7 espera Standard token** | ✅ Sim — começar JÁ |
| **1. Schemas & migração** | Criar aba `Leads Google Ads` (13 cols), expandir `Diagnostico Ads Diario` com col `canal`, rodar `_backfillCanalDiagnosticoAds` | 0,5 | — |
| **2. Backend ingestão & vínculo** | `GoogleAdsAPI.js` com `CFG_GOOGLE`, `registrarLeadGoogleAds`, `onEditGoogleAds`, `vincularVendaLeadGoogleAds`. `doPost` rota nova. `salvarVenda` chama os 2 vínculos | 1 | — |
| **3. Backend painel & insights** | `_googleAdsAccessToken_`, `_googleAdsHeaders_`, `_googleAdsQueryCampanhas_`, `getPainelAdsGoogleData`, helpers de mutate, `executarAcoesAprovadasGoogle` | 2 | Token Standard precisa estar pronto |
| **4. Frontend Leads Google Ads** | `LeadsGoogleAds.html` (cópia adaptada), wiring no `Index.html` / `JS.html` / `Code.js`, perfis em `Config.js` / `Usuarios.html` | 1 | — |
| **5. Frontend Painel Ads Google** | `PainelAdsGoogle.html` (cópia adaptada), restrição por tipo de campanha | 1 | — |
| **6. Relatório diário & Dashboard** | `gerarRelatorioDiarioAdsGoogle`, trigger 07h05, aba `Google Ads ✦` no Dashboard, `getRelatorioAdsHistorico` aceita `canal` | 1 | — |
| **7. QA, smoke, deploy** | Rodar a matriz de testes da §10, deploy `clasp`, atualizar `CLAUDE.md` com nova seção | 1 | — |
| **TOTAL** | | **9 dias úteis** + janela paralela de espera do token | |

### Sequenciamento recomendado

1. **Dia 0 (hoje)**: solicitar developer token + criar OAuth client + iniciar conta MCC (~2h de trabalho de Ricardo, depois roda em background).
2. **Dias 0-2**: Fase 1 + Fase 2 (schemas + ingestão) — não dependem de token Google. Já dá pra testar com payloads sintéticos no webhook.
3. **Dias 2-3**: Fases 4 + 6 parciais (Leads Google Ads + relatório base SEM API real, só esqueleto). Mostra UX pro Ricardo.
4. **Dia X (quando token chega)**: Fase 3 (insights) + Fase 5 (painel completo) + Fase 6 final (relatório real).
5. **Dia X+1**: Fase 7 (QA + deploy).

---

## 12. Riscos / atenção

| Risco | Mitigação |
|---|---|
| Aprovação Standard do developer token demora > 7 dias | Continuar Fases 1, 2, 4, 6-parcial sem depender de API real. Mockar resposta pra testar o pipeline UI. |
| Quota da Google Ads API (15k operações/dia em Standard, ilimitado em Premium) | Cachear `getPainelAdsGoogleData` por 5 min em CacheService (mesmo padrão do `_getTabela`). Relatório 07h faz 1 query por dia — folgado. |
| OAuth refresh token revogado | Helper `_googleAdsAccessToken_()` lança erro claro; fallback no Painel mostra "Reconectar Google Ads" como CTA. |
| Botconversa não consegue propagar `gclid` | A LP precisa ler `gclid` da URL e passar para o Botconversa. Validar com Botconversa que isso é possível antes de Fase 0. Se não for: chave de roteamento vira só `utm_source=google`. |
| `gclid` legítimo expira em 90 dias para vínculo de conversões offline (uploads de conversão na API) | Por ora não estamos enviando conversões offline pro Google — só usando como id de auditoria. Quando isso virar requisito, adicionar `gerarUploadConversao` em fase 2 do roadmap. |
| Tipos de campanha (PMax/DemandGen) restringem ações | `_googleAcoesPermitidasParaTipo_` filtra antes de gerar fila — usuário nunca vê ação inválida. |
| Concorrência com trigger Meta (07h) — Claude API rate limit | Trigger Google em 07h05 (5 min depois). Anthropic API tier atual aguenta os 2 chamados sequenciais sem problema. |
| Conta MCC mal configurada (anunciante não aceitou convite) | Smoke test 0.3 (GAQL básica) pega isso imediatamente. |
| Misturar leads Meta e Google no mesmo telefone | `vincularVendaLeadMetaAds` e `vincularVendaLeadGoogleAds` rodam independentes — não há conflito; pior caso é 2 leads marcados Convertidos pro mesmo telefone (intencional, pois cada canal contabiliza separado). |
| Regressão Meta Ads | Cada deploy precisa rodar smoke completo Meta antes de subir. Adicionar `_smokeTestMetaAds()` em `_arquivo.js` para checar saúde do pipeline Meta. |

---

## 13. Itens de backlog (NÃO escopo desta entrega)

- Unificação visual: `Painel Ads` único com toggle Meta/Google/Ambos, e Dashboard com aba `Ads ✦` consolidada.
- Upload de conversões offline para Google (Smart Bidding melhora quando recebe sinal de venda fechada).
- Comparativo cross-canal automático (CPL Meta vs Google por cidade, qual canal traz mais Combo, etc) — hoje fica disperso entre Painéis.
- TikTok Ads no mesmo molde (caso Mobile Digital invista lá).
- Relatório semanal consolidado por e-mail (Meta + Google) na segunda-feira.

---

## 14. Mapa rápido para Claude Code

Quando for executar, abra na seguinte ordem:

1. Este arquivo (`PLANO_GOOGLE_ADS.md`).
2. `MetaAdsAPI.js` inteiro como referência viva.
3. `Code.js` linhas **1210-1422** (doPost) + **3863-4128** (salvarVenda) + **5798** (getPainelAdsHtml).
4. `LeadsMetaAds.html` (template para o Google).
5. `PainelAds.html` (template para o Google).
6. `Dashboard.html` aba `Meta Ads ✦` (template).
7. `Config.js` linhas **54-58** (PERFIS_MENUS).
8. `Index.html` linhas **2176-2177** (menus) + **3300-3304** (páginas).
9. `JS.html` linhas **4098-4231** (navegação e permissões).
10. `Usuarios.html` linhas **294-311** (labels).

E executar **na ordem das fases** da §11.

---

## 15. Pendências do Ricardo antes de começar

Antes do Claude Code executar a Fase 1, Ricardo precisa:

- [ ] **(Fase 0.1)** Criar conta Google Ads MCC + vincular conta da Mobile Digital
- [ ] **(Fase 0.2)** Solicitar Developer Token Standard
- [ ] **(Fase 0.3)** Criar projeto no Google Cloud Console + habilitar Google Ads API
- [ ] **(Fase 0.4)** Criar OAuth Client (Desktop ou Web app) — me passar Client ID e Secret
- [ ] **(Fase 0.5)** Gerar Refresh Token (rodo um helper one-off pra isso quando estivermos na fase)
- [ ] **(Fase 0.6)** Confirmar com o Botconversa que o `gclid` da URL pode ser propagado no payload do webhook
- [ ] **(Fase 0.7)** Configurar tracking template no Google Ads para injetar `?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&gclid={gclid}` na LP

Tudo o resto Claude Code resolve.
