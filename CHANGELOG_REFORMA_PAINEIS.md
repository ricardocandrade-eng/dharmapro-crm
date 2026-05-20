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
