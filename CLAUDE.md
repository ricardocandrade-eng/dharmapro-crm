<!-- dharmapro-crm | CLAUDE.md | 25/04/2026 19:30 -->

# dharmapro-crm

## Visao Geral

`dharmapro-crm` e o CRM operacional principal da Mobile Digital / Mobile Fibra.
Roda em **Google Apps Script + Google Sheets + HTML/JS** e esta em **producao**.

Em 24/04/2026 o projeto passou por uma recuperacao completa de producao, consolidacao
de modulos operacionais e implementacao do modulo de Gerenciar Usuarios.

Em 25/04/2026 o modulo `Cruzamento Vero` foi revisado para tratar IDs de contrato
com prefixo `NG`, consolidar `CANCELAMENTO` + `CHURN`, incluir uma aba propria
de `Movel` e limpar a interface.

Em 25/04/2026 o fluxo de vendas tambem passou por uma sincronizacao estrutural:
edicoes parciais agora preservam campos ja gravados na linha, o painel lateral
passou a editar `Data Ativacao` e `Data Instalacao`, e a persistencia passou
a manter tambem `VEROHUB`, `BC_TAGS`, `BC_STATUS` e `VIABILIDADE` durante updates.

Na mesma data, vendas `Fibra Combo` passaram a suportar criacao de `Móvel`
vinculado via botao no painel lateral, com registro estrutural em aba propria
de vinculos e alerta visual quando existir combo sem venda movel associada.
O ajuste mais recente posiciona esse alerta na area do card onde o `VeroHub`
nao aparece para o fluxo movel e faz a venda movel vinculada nascer em
`2 - Aguardando Entrega`.
Tambem adiciona navegacao cruzada no painel lateral entre venda fibra e venda
movel vinculada.

Na evolucao seguinte, a `Lista de Vendas` passou a agrupar visualmente combos
fibra + movel em um unico card quando ha vinculo estrutural entre as duas linhas.
O backend continua mantendo dois registros separados no Sheets, mas o frontend
agora esconde a linha movel duplicada quando a fibra correspondente esta na mesma
pagina e mostra o alerta `Combo sem movel` ao lado do nome do cliente.
O hotfix mais recente restaurou o carregamento da lista adicionando no frontend
o helper local de normalizacao de texto usado por esse agrupamento.
Depois disso, o backend passou a suportar inferencia conservadora de vinculos
legados de combo, mas essa retroacao saiu do caminho critico da `Lista de Vendas`
para nao travar o carregamento. A preparacao desses vinculos antigos agora pode
ser feita por rotina separada de cache.

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
- `Cruzamento Vero` com normalizacao de `ID Contrato` e leitura de `CHURN`
- `Cruzamento Vero` com aba dedicada para `Movel`
- `Leads Meta Ads`
- `Painel Ads`
- `Disparos em Massa`
- `WABA Monitor` dentro do dashboard
- `Gerenciar Usuarios` (admin only)
- `Sistema de Alertas` — sino 🔔 com SLA do funil e alertas de leads/campanha/WABA

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

## Modulo Gerenciar Usuarios

Implementado em 24/04/2026. Acessivel apenas para o perfil `admin`.

### Funcionalidades

- **Aba Usuarios**: listar, editar perfil/nome/foto, ativar/desativar, redefinir senha, excluir
- **Aba Permissoes por Perfil**: configurar quais paginas cada perfil (admin/supervisor/backoffice) pode acessar

### Arquitetura

**Fonte de dados**: aba `Usuarios` da planilha principal (colunas A-F: usuario, senhaHash, nome, perfil, foto, ativo).

**Migracao**: funcao `migrarUsuariosParaSheet()` em `Code.js` — rodar UMA VEZ no editor Apps Script para popular a aba a partir do array `USUARIOS` do `Config.js`. Idempotente.

**Fallback de auth**: se a aba `Usuarios` estiver vazia ou inacessivel, `validarLogin()` usa o array `USUARIOS` do `Config.js` automaticamente.

**Permissoes por perfil**: salvas em PropertiesService com chave `PERFIS_MENUS_JSON` (JSON). Se nao existir, usa `PERFIS_MENUS` do `Config.js`. Entram em vigor no proximo login do usuario.

### Funcoes backend (`Code.js`)

| Funcao | Descricao |
|--------|-----------|
| `_getUsuariosSheet_()` | Le aba Usuarios, retorna `[]` em erro |
| `_getPerfilMenus_()` | Retorna PERFIS_MENUS do PropertiesService ou Config.js |
| `_assertAdmin_(adminUsuario)` | Valida que o chamador e admin; lanca erro se nao for |
| `getUsuarios(adminUsuario)` | Lista usuarios sem senhaHash |
| `salvarUsuario(adminUsuario, dados)` | Cria ou atualiza usuario na planilha |
| `toggleAtivoUsuario(adminUsuario, usuarioAlvo, ativo)` | Ativa/desativa usuario |
| `resetarSenha(adminUsuario, usuarioAlvo, novaSenha)` | Redefine senha via PropertiesService + planilha |
| `excluirUsuario(adminUsuario, usuarioAlvo)` | Remove linha da planilha; bloqueia excluir o proprio admin |
| `getPerfilMenus(adminUsuario)` | Retorna PERFIS_MENUS vigente |
| `salvarPerfilMenus(adminUsuario, perfilMenus)` | Salva PERFIS_MENUS no PropertiesService |
| `migrarUsuariosParaSheet()` | Migracao unica de Config.js para a planilha |
| `getUsuariosHtml()` | Retorna conteudo de Usuarios.html para injecao no CRM |

### Nota sobre `novaVenda`

O ID `novaVenda` e um alvo interno de `navegar()`, vinculado funcionalmente ao ID `formulario` (menu Nova Venda). Nao e exibido na UI de permissoes por perfil para evitar confusao. Sempre incluir `novaVenda` quando incluir `formulario` no array de menus de um perfil.

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
- `Cruzamento.html`
- `PainelAds.html`
- `Disparos.html`
- `LeadsMetaAds.html`
- `FilaPAP.html`
- `Parceiros.html`
- `Usuarios.html` (admin only — Gerenciar Usuarios)

---

## Credenciais e Propriedades do Script

Nao versionar segredos.

Propriedades relevantes:
- `CRM_SPREADSHEET_ID`
- `SUPABASE_SERVICE_ROLE`
- `META_ACCESS_TOKEN`
- `PERFIS_MENUS_JSON` — permissoes por perfil editadas via CRM (JSON); se ausente, usa Config.js
- `pwd_<usuario>` — hash SHA-256 de senha alterada pelo usuario ou pelo admin

Cuidados:
- `SUPABASE_SERVICE_ROLE` deve ser a chave correta do projeto Supabase em uso;
- chaves expostas em testes devem ser rotacionadas depois;
- para restaurar permissoes padrao do Config.js, deletar `PERFIS_MENUS_JSON` nas propriedades do script.

---

## Deploy

Fluxo usual:

```bash
clasp push --force
clasp version "descricao"
clasp deploy --deploymentId AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw --description "descricao"
```

Deploys importantes de 24/04/2026:
- restauracao do CRM (v325);
- correcao do `Painel Ads`;
- limpeza dos diagnosticos temporarios;
- integracao do `WABA Monitor`;
- polimento visual e fallback de tier no dashboard;
- implementacao do modulo `Gerenciar Usuarios` com CRUD, permissoes por perfil e reset de senha (v372-v378).

---

## Regras Operacionais

- preservar contratos do frontend com `google.script.run`;
- evitar depender so de planilha ativa no GAS;
- nao remover integracoes com Supabase sem revisar `Dashboard`, `Painel Ads` e `Disparos`;
- quando a decisao for entre painel externo e CRM, preferir consolidar a operacao no DharmaPro;
- todas as funcoes da API de usuarios exigem `adminUsuario` como primeiro argumento e validam via `_assertAdmin_()`.

---

## Proximos Passos Naturais

- rodar `migrarUsuariosParaSheet()` no editor Apps Script para ativar a gestao de usuarios via CRM;
- consolidar o workflow WABA final no projeto `disparo-massa`;
- documentar de forma definitiva a captura correta de `messaging_limit_tier`;
- revisar encoding de arquivos HTML/JS antigos;
- rotacionar chaves expostas em testes operacionais.
