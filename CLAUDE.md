<!-- dharmapro-crm | CLAUDE.md | 24/04/2026 -->

# dharmapro-crm

## Visao Geral

`dharmapro-crm` e o CRM operacional principal da Mobile Digital / Mobile Fibra.
Roda em **Google Apps Script + Google Sheets + HTML/JS** e esta em **producao**.

Em 24/04/2026 o projeto passou por uma recuperacao completa de producao e consolidacao
de modulos operacionais dentro do CRM.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Backend | Google Apps Script (V8) |
| Dados principais | Google Sheets |
| Frontend | HTML + CSS + JavaScript |
| Integracoes | Supabase REST, Meta Ads API, Chatwoot, portal PAP |
| Deploy | `clasp push --force` + Web App GAS |

---

## Estado Atual

### Modulos operacionais

Estao funcionando:
- `Dashboard`
- `Lista de Vendas`
- `Funil de Instalacoes`
- `Leads Meta Ads`
- `Painel Ads`
- `Disparos em Massa`
- `WABA Monitor` dentro do dashboard

### Dashboard

O dashboard hoje possui 3 abas:
- `Mobile Digital`
- `Agente IA`
- `WABA Monitor`

O `WABA Monitor` foi trazido para dentro do CRM e usa o projeto Supabase:
- `zfunugupwvktcggvicuk`

Fontes lidas pelo dashboard:
- `v_metricas_gerais`
- `v_conversas_por_dia`
- `v_leads_por_nivel`
- `v_top_cidades`
- `v_leads_por_motivo`
- `v_followup_resumo`
- `v_waba_health_current`
- `v_template_health`
- `v_campaign_stats`
- `v_suppression_summary`
- `waba_health_snapshots`

---

## Recuperacao de 24/04/2026

### Problemas encontrados

- menu lateral exibindo versao antiga em producao;
- CRM quebrado por dependencia de `SpreadsheetApp.getActiveSpreadsheet()`;
- `Painel Ads` em branco;
- `Disparos em Massa` sem acesso ao Supabase;
- dashboard sem o `WABA Monitor`.

### Correcoes permanentes

#### 1. Fallback de planilha

Foi implementado um helper central `_getSpreadsheet_()` em `Code.js`.

Ele:
- tenta `SpreadsheetApp.getActiveSpreadsheet()`;
- faz fallback para ID fixo/configurado quando necessario.

Planilha principal atual:
- `1H1qNgyNjmIYiZWT0wHwzANLf7yLggzYzBNVgAWCJ9lE`

#### 2. Painel Ads

Foi criada a funcao backend:
- `getPainelAdsHtml()`

Isso resolveu a tela branca causada por carregamento quebrado da view.

#### 3. Disparos em Massa

O modulo foi estabilizado no CRM com:
- menu ativo;
- view carregando;
- backend apontando para o Supabase correto;
- campanhas lendo `v_campaign_stats`.

Dependencias operacionais:
- `SUPABASE_SERVICE_ROLE`
- projeto Supabase `zfunugupwvktcggvicuk`

#### 4. WABA Monitor

O monitor foi incorporado ao dashboard do CRM como terceira aba.

Ele mostra:
- Quality Score
- Messaging Tier
- Status da conta
- Supressoes ativas
- Historico de qualidade
- Templates
- Campanhas

Observacao importante:
- se `Messaging Tier` aparecer `UNKNOWN`, o problema esta na coleta/persistencia do
  monitor WABA no n8n/Supabase, nao no CRM;
- o CRM ja tenta ler tanto a view `v_waba_health_current` quanto o snapshot mais recente.

---

## Arquivos-Chave

### Backend
- `Code.js`
- `Config.js`
- `MetaAdsAPI.js`
- `DisparosAPI.js`
- `ParceirosAPI.js`

### Frontend principal
- `Index.html`
- `JS.html`
- `Dashboard.html`

### Views importantes
- `PainelAds.html`
- `Disparos.html`
- `LeadsMetaAds.html`
- `FilaPAP.html`
- `Parceiros.html`

---

## Credenciais e Propriedades do Script

Nao versionar segredos.

Propriedades relevantes:
- `CRM_SPREADSHEET_ID`
- `SUPABASE_SERVICE_ROLE`
- `META_ACCESS_TOKEN`

Cuidados:
- `SUPABASE_SERVICE_ROLE` deve ser a chave correta do projeto Supabase em uso;
- chaves expostas em testes devem ser rotacionadas depois.

---

## Deploy

Fluxo usual:

```bash
clasp push --force
clasp version "descricao"
clasp deploy --deploymentId AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw --description "descricao"
```

Deploys importantes de 24/04/2026:
- restauracao do CRM;
- correcao do `Painel Ads`;
- limpeza dos diagnosticos temporarios;
- integracao do `WABA Monitor`;
- polimento visual e fallback de tier no dashboard.

---

## Regras Operacionais

- preservar contratos do frontend com `google.script.run`;
- evitar depender so de planilha ativa no GAS;
- nao remover integracoes com Supabase sem revisar `Dashboard`, `Painel Ads` e `Disparos`;
- quando a decisao for entre painel externo e CRM, preferir consolidar a operacao no DharmaPro.

---

## Proximos Passos Naturais

- consolidar o workflow WABA final no projeto `disparo-massa`;
- documentar de forma definitiva a captura correta de `messaging_limit_tier`;
- revisar encoding de arquivos HTML/JS antigos;
- rotacionar chaves expostas em testes operacionais.
