# Changelog — Reforma dos Painéis Meta Ads do DharmaPro

Documentação viva da reformulação especificada em
`meta-ads-vero/auditoria_paineis_meta_ads.md`. Uma entrada por fase.

---

## Fase 1 — Quick wins (20/05/2026)

Correções pontuais, sem mudança estrutural. Branch `feat/reforma-paineis-meta-ads-fase1`.

### Alterações

- **1.1 — Dropdown manual de Campanha (`LeadsMetaAds.html`)**
  - `select#mlCampanha`: removidas as 3 campanhas pausadas desde 30/04
    (`A - JF Principal`, `B - Órbita JF`, `C - BH Metro`); adicionada
    `AG - Vero Fibra Amplo`. Restam: AG, VENDAS, Orgânico/Indicação.
  - `CRIATIVOS_POR_CAMPANHA`: entradas de A/B/C removidas; nova entrada
    `'AG - Vero Fibra Amplo': ['P2 (cópia)', 'P2 (Andromeda)', 'Indefinido']`.

- **1.2 — Filtrar narrativas de IA de campanhas pausadas (`MetaAdsAPI.js`)**
  - `_buildDiagnosisPrompt_` (diagnóstico longo do botão ✦ Diagnosticar):
    removida a linha de contexto que nomeava A/B/C hardcoded; adicionado
    filtro `spend > 0` na seção de dados (antes listava campanhas pausadas
    com R$0).
  - `_buildDiagnosisPromptResumo_` (relatório diário 07h → aba
    `Diagnostico Ads Diario` → Dashboard "Meta Ads ✦"): removida a mesma
    linha hardcoded de A/B/C. A seção de dados já filtrava `gasto > 0`.
  - Causa raiz: o contexto do prompt afirmava que as campanhas eram A/B/C
    (pausadas), então a IA as citava mesmo sem dados. Agora a IA só fala das
    campanhas presentes nos dados reais filtrados.
  - **Escopo**: só a geração daqui pra frente. Narrativas já gravadas
    (18/05, 19/05) permanecem na aba como histórico até saírem da janela do
    Dashboard. Decisão do Ricardo: não regenerar manualmente.

- **1.3 — Badge "PAUSADA" no Painel Ads (`MetaAdsAPI.js` + `PainelAds.html`)**
  - Novo helper `_mapaStatusCampanhas_()`: busca `campaign_id → effective_status`
    de todas as campanhas da conta via `/campaigns` (o endpoint de insights não
    retorna status). Defensivo — retorna `{}` em falha, sem derrubar o painel.
  - `getPainelAdsData`: campanha com `effective_status !== 'ACTIVE'` recebe
    `status: 'pausada'`; não gera alerta de pausa/atenção nem entra na fila de
    decisão (não faz sentido sugerir pausar o que já está parado).
  - `_paCampCard`: badge "PAUSADA" (classe `dim`) + tom de card `c-dim`
    (cinza, opacity .62) em vez de "Normal"/verde.

- **1.4 — Janela do Painel Ads = últimos 7 dias incluindo hoje**
  - `getPainelAdsData`: default `3d` → `7d` (`MetaAdsAPI.js`). O branch `7d`
    já usa `since = hoje-6, until = hoje` (inclui hoje).
  - `PainelAds.html`: `paAtualPeriodo='7d'`, `paInit` chama `paCarregar('7d')`,
    classe `ativo` movida do botão "3 dias" para "7 dias". Botão "3 dias"
    mantido como opção (continua `since=hoje-3, until=ontem`).

### Antes/Depois

- Dropdown: A/B/C pausadas → AG - Vero Fibra Amplo.
- Narrativas: citavam Campanha D/A/B/C pausadas → só campanhas com gasto real.
- Badge: pausada aparecia como "Normal" (verde) → "PAUSADA" (cinza).
- Janela: default 16-18/05 (3 dias passados, sem hoje) → últimos 7 dias incl. hoje.

### Validação

- `node --check` em `MetaAdsAPI.js` e `Code.js`: OK.
- Validação visual no CRM deployado: **pendente** (requer deploy).

### ⚠️ Caveat estrutural (não resolvido na Fase 1)

O Painel Ads e o diagnóstico leem `CFG_META.AD_ACCOUNT_ID = act_971543562231015`
— a conta **antiga**, onde A/B/C/D estão pausadas. As campanhas **ativas da
agência** (`[IMP] [ATIVA] P2 ...`) vivem em `act_2839032026433564`, que o painel
não lê. As correções da Fase 1 deixam o painel honesto sobre a conta antiga, mas
ele só refletirá a operação real da agência quando passar a ler a conta nova
(provável Fase 2; depende do `META_ACCESS_TOKEN` do DharmaPro ter acesso a ela).

**Update (20/05):** confirmado via `meta-ads-vero/meta-ads-mcp/check_account.js` que o
token do system user `Admin_API_Renata` (mesmo do DharmaPro, por INFRA.md) lê **as
duas** contas: `act_971543562231015` (Vero 01, antiga) e `act_2839032026433564`
(Vero 02, agência ATIVA). A operação migrou Vero 01 → Vero 02 em ~18-19/05 (ambas
têm campanhas "P2"; a viva está na 02). Decisão do Ricardo: Fase 2 vai **ler as duas
contas** (agregar). As "9 conversões" que a auditoria estranhou são reais — da conta
02, que o painel ainda não lê.

---

## Fase 2 — Reformulação visual (em andamento)

Ordem escolhida pelo Ricardo: começar pela parte independente (2.3, coluna Cidade),
depois o multi-conta (Dashboard + Painel Ads).

### 2.3 — Coluna CIDADE auto-preenchida via DDD (20/05/2026)

Branch `feat/reforma-paineis-fase2-cidade-ddd`. Independente da conta de anúncios.

- **Frontend (`LeadsMetaAds.html`)**: novo `inferirCidadePorDDD(telefone)` + mapa
  `DDD_CIDADE` (DDDs do SE: MG 31-38, RJ 21/22/24, ES 27/28, SP 11-19) → cidade
  principal do DDD. Normaliza o telefone (tira DDI 55, exige 10-11 dígitos). DDD fora
  da cobertura → sem sugestão.
- A coluna **Cidade** (antes sempre `—`) agora:
  - mostra a cidade real se houver (clicável pra editar);
  - se vazia e há DDD conhecido, mostra a sugestão **faded em itálico** com `≈ Cidade`
    (ex: `≈ Juiz de Fora`) — clique confirma/edita;
  - se vazia e sem DDD, mostra `—` clicável.
  - Edição inline (input; Enter salva, Esc cancela, blur salva) via
    `_lmaEditarCidade` / `_lmaSalvarCidade` / `_lmaRenderCidadeCell`. Não grava se o
    valor não mudou.
- **Backend (`MetaAdsAPI.js`)**: novo `atualizarCidadeLeadMetaAds(linha, cidade)`
  grava a col D da aba "Leads Meta Ads" (espelha `atualizarStatusLeadMetaAds`).
- **Escopo**: a sugestão é só display/edição manual — **não** auto-persiste no webhook
  de ingestão (continua chegando `cidade: ""`); o time confirma na tela.

**Validação**: `node --check` em `MetaAdsAPI.js` + no `<script>` extraído do HTML;
teste node do `inferirCidadePorDDD` em 9 formatos de telefone (DDI/fixo/mobile/
formatado/fora-de-cobertura). Validação visual no CRM pendente de deploy.

### 2.0/2.2/2.1 — Multi-conta + Painel Ads reescrito + Dashboard executivo (20/05/2026)

Branch `feat/reforma-paineis-fase2-multiconta`. Decisão: ler/agregar as 2 contas
(token Admin_API_Renata lê ambas, confirmado).

**2.0 — Multi-conta (`MetaAdsAPI.js`)**
- `CFG_META`: novo `AD_ACCOUNT_IDS` (`['act_2839032026433564','act_971543562231015']`,
  agência primeiro) + `AD_ACCOUNT_NOMES` (Vero 02 / Vero 01). `AD_ACCOUNT_ID`
  (primária) intocada — segue servindo o layer de ações e `getResumoTrafegoHoje`
  (alerta 7), que **continuam só na conta antiga** (ver pendência abaixo).
- Helpers `_getContasMetaAds_()` e `_nomeContaMeta_()`. `_mapaStatusCampanhas_(accountId)`
  parametrizado.
- `getPainelAdsData`: agora **itera as contas**, agrega Gasto/Leads/Impr/Cliques,
  concatena campanhas (cada uma com `conta`), ordena ativas→pausadas (gasto desc).
  Conta que falha é pulada (`contasComErro`); só erra se TODAS falham.

**2.2 — Painel Ads (`PainelAds.html` + `MetaAdsAPI.js`)**
- **Removidos** os 4 cards quebrados de "Inteligência Comercial" (front + função
  backend `_buildInteligenciaComercialFromLeads_` + helper front `_paIntelligenceCard`
  + card de ajuda no modal — tudo deletado).
- Lista de campanhas: **ativas por padrão**; pausadas num `<details>` "Ver pausadas (N)".
  Cada card mostra a conta (`◈ Vero 02`).
- Nova seção **🔔 Alertas operacionais** (backend `_alertasOperacionaisLeads_`):
  hoje, leads sem triagem há +24h.
- Mantidos os KPIs e o funil existentes (não estavam quebrados).

**2.1 — Dashboard executivo (`Dashboard.html` + `MetaAdsAPI.js`)**
- Novo backend `getDashboardMetaAdsExecutivo()`: Gasto (agrega 2 contas via insights
  `time_increment=1`, 30d) + Leads/Vendas do CRM, em 3 janelas (Hoje · Semana 7d ·
  Mês MTD); CPA = gasto/vendas; série diária pro gráfico. Helper
  `_crmLeadsVendasPorJanela_`.
- Aba "Meta Ads ✦" reescrita: matriz **4 KPIs × 3 janelas** + gráfico **spend×dia**.
  **Removidos**: narrativa de IA (lista de resumos), KPIs de snapshot, toggle de
  métrica. Botões de período agora controlam a janela do gráfico (default 30d).
- `getRelatorioAdsHistorico` e o trigger 07h (`gerarRelatorioDiarioAds`) seguem
  existindo (gravam a aba `Diagnostico Ads Diario`), mas **não são mais exibidos**.

**Validação**: `node --check` no backend + nos `<script>` extraídos de PainelAds.html
e Dashboard.html. Validação visual + cross-check com `snapshot.js`/`check_account.js`
pendente de deploy.

### ⚠️ Pendência aberta (fora do escopo desta sessão)

`getResumoTrafegoHoje()` (endpoint `?action=resumo_trafego` → **alerta 7 de tráfego
pago**, n8n `rZi4ZpL1Sj8tvcMz`) ainda lê **só** `act_971543562231015` (conta antiga).
Como a operação migrou pra Vero 02, esse alerta diário está reportando a conta errada.
Não foi alterado aqui por ser um **contrato** consumido por n8n — mudar exige
confirmação. Decidir se aponta pra agência ou agrega as duas.

---

## Fase 3 — Automações Vendas → Leads (20/05/2026)

Branch `feat/reforma-paineis-fase3-automacoes`. **Direção única: Vendas → Leads.**
Nunca cria venda a partir do lead.

### 3.1 — Trigger: venda META ADS em status 2/3 → lead "Converteu"

- `vincularVendaLeadMetaAds(telefone, idContrato, dataVenda)` (`MetaAdsAPI.js`)
  reescrito (antes era `(telefone)` e estava **órfão** — nunca chamado): além de
  marcar `Converteu` + `data_status`, grava **rastreabilidade** nas cols M
  (`data_venda`) e N (`id_contrato`) do lead (helper `_registrarRastreabilidadeVenda_`,
  cria cabeçalhos M1/N1 se faltarem). Match por telefone normalizado (últimos 11
  dígitos), janela 30 dias, idempotente. Retorno tri-estado: **>0** vinculou ·
  **0** existe lead mas já finalizado/fora da janela (não é miss) · **null** nenhum
  lead com o telefone (miss real).
- Hook `_reconciliarVendaMetaAdsAposSave_(linha)` (lê a venda, confere canal=META ADS,
  extrai telefone WHATS→TEL, contrato, data) chamado **fora do lock, não-bloqueante**
  nos 3 caminhos de transição de status em `Code.js`: `salvarVenda` (painel inline,
  só na transição p/ 2 ou 3), `moverLeadAguardando`, `moverVendaFunil` (drag).
- Sem match (`null`) → registra em **"Reconciliação Pendente"** (`venda_sem_lead`).

### 3.2 — Reconciliação noturna (cron 23h)

- `reconciliarMetaAdsNoturno()`: cruza vendas META ADS em status 2/3 (por telefone)
  com leads "Converteu". (1) Venda sem lead refletido → tenta vincular (catch-up);
  se ainda assim não achar lead, registra `venda_sem_lead`. (2) Lead "Converteu" sem
  venda META 2/3 → registra `lead_sem_venda`. Reescreve a aba "Reconciliação Pendente"
  com o retrato atual (limpa as linhas anteriores). Aba auto-criada por
  `_getAbaReconciliacaoMeta_` (cols: detectado_em, tipo, descricao, resolvido).
- Trigger instalado por `configurarTriggerReconciliacaoMetaAds()` (23h diário,
  idempotente; `removerTriggerReconciliacaoMetaAds()` desliga). **Rodar UMA VEZ no
  editor** (mesmo padrão de `configurarTriggerRelatorioDiarioAds`). `clasp run`
  indisponível.

### NÃO implementado (por decisão da spec)

Criação automática de venda a partir de "Converteu" no Leads Meta Ads — o vendedor
cadastra manualmente (precisa de CPF, contrato, plano).

**Validação**: `node --check` em `MetaAdsAPI.js` e `Code.js`. Teste funcional
(criar venda META ADS de teste em status 2 com telefone de lead conhecido →
conferir lead "Converteu" + cols M/N; forçar `reconciliarMetaAdsNoturno` no editor)
fica com o Ricardo após deploy + instalar o trigger.

---

## Fase 4 — Qualidade de dados (21/05/2026)

Branch `feat/reforma-paineis-fase4-qualidade`.

### 4.2 — Validação proativa (deployada)

- `MetaAdsAPI.js`: constante `CAMPANHAS_PAUSADAS_META` (`A - JF Principal`,
  `B - Órbita JF`, `C - BH Metro`, `D - Conversas JF + Órbita`) + helper
  `_campanhaPausadaMeta_`. **VENDAS fica de fora** (campanha ativa).
- `registrarLeadMetaAds` (webhook + manual): lead novo cujo `utm_campaign` é
  pausado → registra em "Reconciliação Pendente" (`lead_campanha_pausada`),
  não-bloqueante, sem alterar o lead. Pega leads de fluxos BotConversa antigos
  (Vero! 1/2/3). O **form manual já está protegido** pelo dropdown (Fase 1 só
  oferece AG/VENDAS/Orgânico).

### 4.1 — Migração de leads históricos (one-shot, rodar no editor)

- `_metaFase4Setup.js` (one-shot, remover após validar):
  - `verificarLeadsParaMigrarFase4()` — dry-run (lista, não altera).
  - `migrarLeadsHistoricosCampanhasPausadas()` — backup da aba
    (`Leads Meta Ads (bkp …)`) + re-tag `utm_campaign` de A/B/C/D criados
    **≥ 17/05/2026** → `AG - Vero Fibra Amplo`. Loga total + diff.
- Diff/resultado documentados em `meta-ads-vero/migracao_leads_historicos_diff.md`
  (preencher após a execução).

**Validação**: `node --check` em `MetaAdsAPI.js` e `_metaFase4Setup.js`. Execução
da migração + preenchimento do diff ficam com o Ricardo (dry-run antes).

---

## Fim da reforma

Fases 1–4 implementadas e deployadas.

## Pós-reforma (20/05/2026)

- **Fase 4.1 executada** pelo Ricardo no editor: dry-run confirmou 2 leads;
  `migrarLeadsHistoricosCampanhasPausadas` migrou **2 leads** ("B - Órbita JF" →
  "AG - Vero Fibra Amplo", linhas 86 e 88, registros manuais de 20/05), backup
  `Leads Meta Ads (bkp 20260520_2200)`. Diff em
  `meta-ads-vero/migracao_leads_historicos_diff.md`. One-shot `_metaFase4Setup.js`
  **removido** do projeto.
- **Alerta 7 corrigido (multi-conta)** — `getResumoTrafegoHoje()` agora **agrega as
  contas** (`_getContasMetaAds_()`): soma gasto/impressões/alcance/cliques/budget
  previsto, junta as campanhas ativas e recalcula CTR/CPC sobre os totais. Helpers
  `_somarBudgetAdSetsAtivos_(accountId)` e `_listarCampanhasAtivas_(accountId)`
  parametrizados. **Shape do JSON inalterado** (só `meta.contas` adicionado) — o
  n8n do alerta 7 (`rZi4ZpL1Sj8tvcMz`, `?action=resumo_trafego`) segue funcionando;
  os números passam a refletir a operação real (Vero 02). Resolve a pendência
  transversal. `node --check` OK.
