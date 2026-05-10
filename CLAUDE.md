<!-- dharmapro-crm | CLAUDE.md | 30/04/2026 -->

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
No card agrupado de combo, os substatus dos planos passaram a usar emoji antes
do texto em vez de colorizacao adicional, mantendo o status principal como foco
visual do card. `4 - Entregue` tambem usa `✅`.

Em 27/04/2026 o `Painel Ads` foi redesenhado com UX didatico (v461):
workflow bar simplificada em 3 passos (Diagnosticar → Decidir → Executar),
explicacoes em portugues simples em cada KPI, secao "O que acontece se voce
aprovar/rejeitar" em cada card de decisao, sentenca de interpretacao por campanha
e funil, remocao de secoes redundantes (Acoes Prioritarias, Autonomia Operacional).

Em 28/04/2026 o `doPost` recebeu correcao (v462): a rota de tracking Meta Ads
passou a aceitar payloads com `utm_campaign` vindos do Botconversa mesmo quando
o payload inclui o campo `secret`. Isso habilita o rastreamento automatico de
leads das campanhas A/B/C diretamente na aba "Leads Meta Ads" via webhook
Botconversa → DharmaPro, sem depender do n8n.

Em 28/04/2026 (tarde) `vincularVendaLeadMetaAds()` em `MetaAdsAPI.js` recebeu
janela de 30 dias: so vincula conversao automatica se o lead entrou nos ultimos
30 dias. Previne falsos positivos por match de telefone com vendas de outros
periodos ou canais. `CLAUDE_ADS_BRIDGE_JSON` removido das Script Properties —
Painel Ads passou a ler direto da Meta Ads API via `META_ACCESS_TOKEN`.
`META_ACCESS_TOKEN` deve ser configurado via funcao GAS (UI de propriedades
tem bug conhecido — nao salva).

Em 30/04/2026 foi adicionado o **relatório diário do diagnóstico Ads**:
trigger time-based às 07h chama `gerarRelatorioDiarioAds()` em `MetaAdsAPI.js`,
que reusa o pipeline do botão ✦ Diagnosticar (Meta API + aba "Leads Meta Ads"),
gera um resumo curto (≤500 chars) via Claude API e grava na nova aba
`Diagnostico Ads Diario` (idempotente por data). Trigger ativado via
`configurarTriggerRelatorioDiarioAds()` — ✅ já configurado e gravando dados.

Em 06/05/2026 o **Painel Ads** teve a Fila de Decisão restabelecida (v487):
`getPainelAdsData()` agora gera `fila_prioritaria` e retorna `modo: 'cockpit_bridge'`
diretamente, sem depender do pipeline Node.js externo (`run-daily-execution-cycle.js`).
Campanhas com CPL alto, CTR baixo ou frequência saturada geram cards interativos
de Aprovar/Rejeitar conectados ao `executarAcoesAprovadas()` já existente.
Na mesma data (v488), a janela de análise foi alinhada ao `workflow_relatorio_07h`:
período padrão agora é `3d` com `since=hoje-3, until=ontem`.

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
- `WhatsApp Pessoal` — módulo full-stack operacional (Fases 1-3 concluídas em 08-09/05/2026):
  disparo em massa via número comum conectado por QR Code à Evolution API self-hosted em
  `evolution.ofertasverointernet.com.br`. Cada usuário tem sua própria instância
  (nomeada com o login do CRM), 4 abas dedicadas no Sheets (`WA Instâncias`,
  `WA Campanhas`, `WA Disparos`, `WA Blacklist`). Menu visível para admin + supervisor.
  Pipeline n8n: 3 workflows ativos (`wa_pessoal_01_despacho`, `wa_pessoal_02_webhook_entrada`,
  `wa_pessoal_03_schedule_diario`), todos usando credencial Service Account `Google Sheets
  — DharmaPro` para acesso direto à planilha. Webhook global da Evolution captura respostas
  e propaga via `doPost` (`action: wa_pessoal_update`, secret próprio em
  `CFG_WA_PESSOAL.WA_PESSOAL_SECRET`). Anti-ban: delay 12-35s, janela 08:00-20:00 BRT seg-sáb,
  warm-up dinâmico (50/100/150/200 por semana), pausa em 3 erros consecutivos, blacklist
  automática em opt-out. Heurística LID→phone para responses (WhatsApp v2024+ usa LID).
  **Variações de mensagem via Claude API** (09/05/2026): botão "✨ Gerar variações" na Nova
  Campanha gera 10 reescritas via Claude (preservando `{nome}`/`{cidade}`); usuário aprova
  individualmente; n8n WF1 sorteia 1 variação por contato no momento do envio. Reduz risco
  de ban por hash duplicado. Coluna `variacoes_json` (col M) em `WA Campanhas`.
  Spec completa em [../wa-pessoal/CLAUDE.md](../wa-pessoal/CLAUDE.md).
- `Dashboard`
- `Lista de Vendas`
- `Funil de Instalacoes`
- `Cruzamento Vero` com normalizacao de `ID Contrato` e leitura de `CHURN`
- `Cruzamento Vero` com aba dedicada para `Movel`
- `Leads Meta Ads` — rastreamento automatico via Botconversa webhook (testado 28/04/2026)
- `Painel Ads` — UX redesenhado (v461, 27/04/2026): workflow bar 3 passos, fila de decisão,
  cards com "O que acontece se aprovar/rejeitar", interpretação de campanha e funil.
  v487 (06/05/2026): `fila_prioritaria` gerada nativamente em `getPainelAdsData()` (sem
  dependência do pipeline Node.js `CLAUDE_ADS_BRIDGE_JSON` — nunca foi conectado).
  v488 (06/05/2026): janela padrão alterada para `3d` (since=hoje-3, until=ontem),
  alinhada com `workflow_relatorio_07h`; botões de período: Hoje / 3 dias / 7 dias / 30 dias.
- `Relatório diário do diagnóstico Ads` — trigger time-based 07h grava snapshot diário
  na aba `Diagnostico Ads Diario` com KPIs + resumo curto (≤500 chars) via Claude API
- `Disparos em Massa`
- `WABA Monitor` dentro do dashboard
- `Gerenciar Usuarios` (admin only)
- `Sistema de Alertas` — sino 🔔 com SLA do funil e alertas de leads/campanha/WABA

### Dashboard

O dashboard hoje possui 4 abas:
- `Mobile Digital`
- `Agente IA`
- `WABA Monitor`
- `Meta Ads ✦` — evolução diária do diagnóstico de Ads (KPIs do último snapshot,
  gráfico de barras com seletor de métrica e lista cronológica dos resumos curtos
  gerados pela Claude API). Lê a aba `Diagnostico Ads Diario` via
  `getRelatorioAdsHistorico(dias)` em `MetaAdsAPI.js`.
  v489 (06/05/2026): filtros de período 1d / 3d / 7d / 30d (padrão 7d); slicing
  feito no cliente, sem chamadas extras ao GAS.

O `WABA Monitor` foi trazido para dentro do CRM e usa o projeto Supabase compartilhado
(ver [../INFRA.md](../INFRA.md) — seção Supabase).

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

**Migracao**: funcao `migrarUsuariosParaSheet()` em `_arquivo.js` — rodar UMA VEZ no editor Apps Script para popular a aba a partir do array `USUARIOS` do `Config.js`. Idempotente.

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
| `migrarUsuariosParaSheet()` | Migracao unica de Config.js para a planilha — em `_arquivo.js` |
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

## Tabela de Planos / Ofertas (planos_vero.json no Drive)

Desde 04/05/2026 (v484), a fonte das ofertas/planos saiu da aba `TABELA` do
Sheets e virou um JSON no Drive. Backend lê via `_getTabela()` em Code.js,
que carrega `CONFIG.TABELA_JSON_FILE_ID` e cacheia 600s.

### Fonte e formato

- File ID: `1wB9jncB_eBhGnBE-OpiZZ5UfVnvmv-ro`
- Nome: `planos_vero.json` (My Drive root)
- Cópia local versionada: `dharmapro-crm/planos_vero.json`
- Estrutura: array-of-arrays, **9 colunas**:
  `[nome, TIPO, ESPECIAIS, OURO, PRATA, PADRÃO, NOME_LP, FEATURES, PUBLICAR]`
- Linha 0: metadata (`Última atualização: ...`)
- Linha 1: header (com `TIPO` na col 1 e segmentações nas cols 2-5)
- Linhas 2+: planos. Categorias em uso: `VERO MAIS`, `MUNDO FIBRA`,
  `ENTRETENIMENTO`, `COMPLETO`, `GAMER`, `MÓVEL`, `MÓVEL COMBO`.
- Preços de fibra são SEM PARCERIAS — `getOfertasCidade` desconta R$ 10
  para FIBRA (parceria Vero Mais via boleto).
- Aba `TABELA` do Sheets fica como fallback histórico (não deletar).

### Quem consome

Qualquer função que chama `_getTabela()`:
- `getOfertasCidade(cidade)` — Mapa de Ofertas (botão flutuante "+")
- `getPlanosPorCidadeProduto(cidade, produto)` — Nova Venda (dropdown plano)
- `buscarCEPBackend(cep, produto)` — fluxo CEP → planos

### Fluxo de atualização (quando a Vero muda preços)

1. Ricardo manda o XLS novo (`PORTFÓLIO_B2C ...xlsx`) para o Claude.
2. Claude lê a aba `PLANOS_PREÇOS_CLUSTERS_BL`, eixo REDE VERO SEM PARCERIAS,
   compara com o JSON atual (preço+nome), identifica deltas (planos novos,
   removidos, preços alterados).
3. Claude monta um helper one-off em Code.js
   `_atualizarPlanosVeroJsonRevN()` com o array completo do JSON atualizado
   inline (uso de `DriveApp.getFileById(...).setContent(...)` +
   `CacheService.remove(...)`).
4. Claude faz `clasp push --force` (sem `clasp deploy` — não consome versão).
5. Ricardo abre o editor Apps Script, seleciona a função no dropdown e
   clica Executar. Log mostra "OK revN — N linhas, NNNN bytes. Cache
   invalidado.".
6. Mudança aparece imediatamente no CRM (Nova Venda + Mapa de Ofertas).
7. Helper pode ser apagado no próximo push.

Variantes:
- Adições só de planos novos (sem mudar preços): mesmo fluxo, mais rápido.
- Mudanças só de preços (sem nomes novos): mesmo fluxo.
- O JSON pode ser editado direto no Drive UI também (texto puro), mas o
  fluxo via helper é mais auditável e bate cache automaticamente.

Móvel (10 planos `MÓVEL` + 3 `MÓVEL COMBO`) NÃO está em
`PLANOS_PREÇOS_CLUSTERS_BL` — vem da operação manual histórica e fica
preservado no JSON. Atualizar manualmente quando preços móvel mudarem.

---

## Arquivos-Chave

### Backend
- `Code.js`
- `Config.js`
- `MetaAdsAPI.js`
- `DisparosAPI.js`
- `ParceirosAPI.js`
- `_arquivo.js` (em `.claspignore`) — funções provisórias/one-shot que **nunca devem ir para Code.js**

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

Ver [../INFRA.md](../INFRA.md) para credenciais compartilhadas (Supabase, Meta Ads, Chatwoot).

Propriedades GAS específicas deste projeto:
- `CRM_SPREADSHEET_ID` — ID da planilha principal (`1H1qNgyNjmIYiZWT0wHwzANLf7yLggzYzBNVgAWCJ9lE`)
- `SUPABASE_SERVICE_ROLE` — chave do projeto Supabase compartilhado
- `META_ACCESS_TOKEN` — configurar via função GAS (bug conhecido na UI de propriedades — não salva)
- `EVOLUTION_API_URL` — `https://evolution.ofertasverointernet.com.br` (módulo WhatsApp Pessoal)
- `EVOLUTION_API_KEY` — chave hex 32 chars (mesma do `/opt/renata/.env` no VPS); configurada via `_setEvolutionProperties` em 08/05/2026
- `N8N_WA_DESPACHO_URL` — pendente (Fase 3): URL do webhook n8n para iniciar o despacho de uma campanha WA Pessoal
- `PERFIS_MENUS_JSON` — permissões por perfil editadas via CRM; se ausente, usa `Config.js`
- `pwd_<usuario>` — hash SHA-256 de senha alterada pelo usuário ou pelo admin

Para restaurar permissões padrão: deletar `PERFIS_MENUS_JSON` nas propriedades do script.

---

## Deploy

### Regras obrigatórias (seguir sempre)

1. **Perguntar antes de subir** — nunca executar `clasp push` ou `clasp deploy` sem aprovação explícita do Ricardo.

2. **Sequência correta após aprovação:**

```bash
# 1. Atualizar DEPLOY_DATE em Config.js (ver regra 3 abaixo)

# 2. Enviar código para o GAS
clasp push --force

# 3. Criar versão e atualizar o deployment principal (mantém o mesmo ID de URL)
clasp deploy --deploymentId AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw --description "descricao da mudanca"

# 4. Commitar e subir para o GitHub (OBRIGATÓRIO — ver regra 4 abaixo)
git add -A
git commit -m "tipo(escopo): descrição curta do que mudou"
git push origin main
```

3. **Registrar data/hora do deploy no CRM** — antes de executar o deploy, atualizar a constante `DEPLOY_DATE` em `Config.js` com a data e hora exatas. Essa constante é exibida na tela de login (como "build DD/MM HH:MM") e no topo do sidebar (como "v DD/MM HH:MM").

```javascript
// Config.js linha 12 — atualizar antes de cada deploy
var DEPLOY_DATE = '29/04/2026 19:18';
```

4. **Commit + push no GitHub a cada deploy** — o GitHub é a segunda cópia de segurança do projeto (GAS é a fonte em execução, git local + GitHub são o histórico versionado). Todo `clasp push` deve ser acompanhado de um `git commit` + `git push`. Sem isso, o trabalho existe apenas no GAS e no disco local — sem histórico, sem rollback, sem redundância real.

   Padrão de mensagem de commit:
   - `feat(modulo): descrição` — nova funcionalidade
   - `fix(modulo): descrição` — correção de bug
   - `chore(deploy): atualiza DEPLOY_DATE para DD/MM HH:MM` — só atualização de data
   - `refactor(modulo): descrição` — refatoração sem mudança de comportamento

   O `.claspignore` já exclui `_arquivo.js`, arquivos `.bak`, `extensao-dharmapro/` e `planos_vero.json` do clasp push. O `.gitignore` exclui `deploy.log` e `.claude/`. **Ambos devem ser respeitados** — não commitar `_arquivo.js` (contém funções one-shot com credenciais temporárias).

5. **Atualizar o CLAUDE.md** — após um deploy relevante (nova funcionalidade, correção de bug importante, mudança de comportamento), registrar na seção "Histórico de deploys" abaixo com data, versão e o que mudou.

6. **Manter sempre o mesmo deploymentId** — nunca criar um novo deployment para o web app principal. O ID abaixo é o URL fixo usado pelo Ricardo e pelo Botconversa (webhook doPost):

```
AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw
```

---

### Histórico de deploys

| Data/hora | Versão GAS | O que mudou |
|---|---|---|
| 24/04/2026 | v325–v378 | Recuperação completa do CRM; Painel Ads; WABA Monitor; Gerenciar Usuários |
| 28/04/2026 | v462–v470 | Painel Ads v461 (workflow 3 passos); webhook Botconversa + DharmaPro; fix criativo A2; campanhas ativas |
| 29/04/2026 19:18 | v471 | Botão "✦ Diagnosticar agora" no Painel Ads — consulta Meta + CRM + Claude API em tempo real |
| 30/04/2026 19:35 | v474 | Relatório diário do diagnóstico Ads (trigger 07h grava aba `Diagnostico Ads Diario`) + nova 4ª aba `Meta Ads ✦` no Dashboard com KPIs, gráfico de evolução e lista de resumos curtos (≤500 chars) gerados pela Claude API |
| 30/04/2026 20:10 | v475 | Renomeia `gerarRelatorioDiarioAds_` → `gerarRelatorioDiarioAds` (sem underscore final) para aparecer no dropdown de funções do editor Apps Script |
| 30/04/2026 21:21 | v476 | Pagamentos PAP — Forma de Pagamento (`Valor do Plano` / `Valor Fixo`) e Periodicidade (`Diário` / `Mensal (20)`) lidas das colunas AA/AB da aba `3 - PAP`. Página agora separa em duas seções; vendedor sem Forma configurada não aparece. Novo botão **💰 Pagar** (sem disparar BotConversa) ao lado de **💸 Pagar e Notificar** |
| 30/04/2026 22:05 | v477 | Pagamentos PAP — reverte para lista única (sem duas seções); adiciona badge **Periodicidade** (Diário/Mensal) por linha na tabela ao lado do badge Forma |
| 30/04/2026 22:30 | v478 | PAP — filtros para Forma e Periodicidade; fix: filtro de vendedor preservado após dar baixa (não resetava mais); padding-bottom na tabela |
| 01/05/2026 12:40 | v479 | Leads Meta Ads — coluna **Ação** redesenhada (layout vertical estável: select + ✓ + 🗑 na linha 1, motivo em linha cheia na 2 quando Desqualificado) e novo botão 🗑 **Excluir lead** com confirmação (`excluirLeadMetaAds` em `MetaAdsAPI.js`) |
| 01/05/2026 19:24 | v480 | Leads Meta Ads — campo **Motivo desq.** vira `<select>` (Preço alto, Sem cobertura, Já tem internet, **Base Vero**, Sem interesse, Não atendeu, Outro). Valores legados existentes na planilha aparecem com sufixo `(legado)` para não se perderem |
| 01/05/2026 19:28 | v481 | Leads Meta Ads — frontend vira fonte única de verdade para opções de status/motivo. `atualizarStatusLeadMetaAds` agora limpa qualquer validação herdada das colunas I/J/K antes de gravar (autorresolve no próximo save). Função utilitária `removerValidacoesLeadsMetaAds()` disponível para limpar a aba inteira de uma vez |
| 01/05/2026 19:35 | v482 | Leads Meta Ads — coluna **Ação** agora é **sticky à direita** (sempre visível, mesmo em scroll horizontal). Tabela ganhou `min-width: 1280px` + scroll horizontal habilitado no body. Botão 🗑 deixa de ficar escondido fora do viewport |
| 04/05/2026 19:48 | v483 | PAP: Minhas Vendas + Pontos & Prêmios — card 📊 mostra pré-vendas e vendas ativas do parceiro; card ⭐ exibe saldo de pontos, catálogo de prêmios (5 itens seed), resgate transacional (LockService) e extrato. Novas abas `PAP Premios` e `PAP Resgates` criadas automaticamente. |
| 05/05/2026 22:22 | v485 | PAP Minhas Vendas — 4 melhorias: (1) vendasAtivas filtra só Fibra Alone/Fibra Combo; (2) label "PAP" renomeado para "Pagamento" no status; (3) chips de filtro por mês (client-side, baseado em `ts` das pré-vendas e `dataInstal` das vendas ativas); (4) aba "💰 A Receber" com hero de total a receber + lista de instalações aguardando pagamento, calculado via `getMeusPagamentosPAP` (mesma lógica de `getPagamentosPAP` do CRM, filtrado pelo CPF do parceiro logado). |
| 04/05/2026 22:55 | v484 | Migra `_getTabela()` de Sheets/TABELA para JSON no Drive — `planos_vero.json` (file ID `1wB9jncB_eBhGnBE-OpiZZ5UfVnvmv-ro`) é a nova fonte. CONFIG ganha `TABELA_JSON_FILE_ID`. Cache 600s preservado. Aba TABELA do Sheets fica como fallback histórico (não deletar — só renomear depois). Atualização futura de preços vira edição direta do JSON. |
| 06/05/2026 12:08 | v487 | Painel Ads: `getPainelAdsData()` agora retorna `modo: 'cockpit_bridge'` e gera `fila_prioritaria` diretamente a partir das campanhas com CPL alto, CTR baixo ou frequência saturada — sem depender do pipeline Node.js externo. A seção ② Fila de Decisão (cards Aprovar/Rejeitar) passa a aparecer sempre que houver alerta de pausa, conectada ao `executarAcoesAprovadas()` já existente. |
| 06/05/2026 12:13 | v488 | Painel Ads: janela `3d` adicionada ao `getPainelAdsData()` com `since=hoje-3, until=ontem` — alinhada ao `workflow_relatorio_07h`. Botão "3 dias" inserido na UI como padrão (substitui "7d"). `_paAtivarPeriodo` atualizada para reconhecer o novo botão. |
| 06/05/2026 12:44 | v489 | Dashboard Meta Ads ✦: filtros de período 1d / 3d / 7d / 30d adicionados no header da aba. Backend continua buscando 30 dias; slice no cliente é instantâneo. Padrão: 7d. |
| 08/05/2026 19:30 | v511 | Fix PIF: (1) `_mapearLinha` parou de usar `_valorListaSemDuplicar` para VALOR — campo não é mais apagado em edições; (2) `pif-sistema` virou `<input type="text">` — evita apagamento quando valor não cabia no select; (3) `pifOnProdutoChange` não limpa mais `pif-valor` ao recarregar planos; (4) auto-fill de `pif-valor` a partir do plano quando col O estava vazia. |
| 08/05/2026 17:43 | v510 | Aba "Vínculos Vendas": colunas `VendaMaeCliente` / `VendaFilhaCliente` adicionadas — gravadas automaticamente em novos vínculos. Função `preencherClientesVinculosVendas` disponível no editor para retroativamente preencher linhas existentes. |
| 08/05/2026 20:30 | v513 | Quarentena de 15 funções one-shot (`configurar*`, `reparar*`, `migrar*`, `limpar*`): movidas de `Code.js` para `_arquivo.js` (em `.claspignore`). `Code.js` mais limpo; funções ainda acessíveis no editor Apps Script. Convenção registrada no CLAUDE.md. |
| 08/05/2026 22:40 | v514 | **WA Pessoal Fase 2** — novo módulo "📲 WhatsApp Pessoal" (disparo via número comum, integração Evolution API self-hosted em `evolution.ofertasverointernet.com.br`). Adiciona: `DispPessoalAPI.js` (backend, 9 funções + handler `wa_pessoal_update` no `doPost`), `DispPessoal.html` (UI com 3 abas: Meu WhatsApp / Nova Campanha / Histórico), 4 abas no Sheets (`WA Instâncias`, `WA Campanhas`, `WA Disparos`, `WA Blacklist`), entrada no menu lateral (admin + supervisor) e atualização de `Config.js`/`Code.js`/`JS.html`/`Index.html`/`Usuarios.html`. Setup pelas one-shots `_setEvolutionProperties` + `_criarAbasWAPessoal` (executadas no editor). Backend não envia mensagens — só registra/lê do Sheets e gerencia instâncias na Evolution API; envio em si fica para a Fase 3 (n8n). |
| 08/05/2026 22:55 | v515 | WA Pessoal — re-deploy incluindo `_waPessoalSetup.js` no Web App (one-shots de setup ficaram disponíveis no dropdown do editor). |
| 08/05/2026 23:00 | v516 | WA Pessoal — cleanup: `_waPessoalSetup.js` removido do projeto após Ricardo executar `_setEvolutionProperties`, `_criarAbasWAPessoal` e `_adicionarMenuWaPessoal` no editor. Chave da Evolution API fica somente no `PropertiesService` daqui em diante. |
| 09/05/2026 02:00 | v517 | **WA Pessoal Fase 3 — handler `_handleWaPessoalUpdate_` aceita `add_to_blacklist`** (em paralelo a `novo_status='respondeu'`) — usado pelo workflow n8n de webhook entrada quando detecta opt-out na resposta do contato. |
| 09/05/2026 02:30 | v518 | WA Pessoal — `criarCampanha` ganha fallback hardcoded `N8N_WA_DESPACHO_URL_DEFAULT = https://n8n.ofertasverointernet.com.br/webhook/wa-pessoal-despacho`. Sem precisar de Script Property pra n8n trigger funcionar; Property continua sendo override opcional. |
| 09/05/2026 02:50 | v519 | WA Pessoal — handler `wa_pessoal_update` movido para **antes** da validação `webhook_secret` global no `doPost` e ganha secret próprio `CFG_WA_PESSOAL.WA_PESSOAL_SECRET` (independente do secret global do CRM). Frontend `DispPessoal.html` com error handling mais detalhado no Histórico (mostra `JSON.stringify(r)` quando `mensagem` está vazia). |
| 09/05/2026 03:00 | v521 | **Fix crítico WA Pessoal: `google.script.run` não serializa Date objects** (silenciosamente vira `null` no client). Adicionado `_waNormalizarParaCliente_` em `DispPessoalAPI.js` que converte recursivamente Dates → strings ISO antes de retornar. Aplicado em `getCampanhasUsuario` e `getMinhaInstancia`. Sem isso, o frontend recebia `null` em respostas com colunas de timestamp do Sheets. |
| 09/05/2026 03:10 | v522 | **WA Pessoal Fase 3 — pipeline completo E2E validado.** 3 workflows n8n importados via API (despacho, webhook entrada, schedule diário), credencial Google Service Account `n8n-wa-pessoal@dharmapro.iam` (ID `74KvBhfHA1mMeGau`) compartilhada com a planilha. Webhook global da Evolution API ativado (`WEBHOOK_GLOBAL_ENABLED=true`, URL `https://n8n.ofertasverointernet.com.br/webhook/wa-pessoal-evolution`). Teste real disparou mensagem "Olá Ricardo!" com sucesso, resposta capturada com heurística LID→phone (Evolution v1.8.7 em DM com privacy mode envia `remoteJid: "<id>@lid"` em vez de phone — WF2 pega o último disparo `enviado` da instância). Pendências documentadas: campanhas multi-contato dependem do Loop Próximo (corrigido pra URL interna `http://n8n:5678` mas não testado em escala); typing presence retorna "Invalid JSON" mas tornado `continueOnError`. |
| 09/05/2026 01:10 | v523 | **WA Pessoal — 3 features adicionais.** (1) **Visão admin**: `_resolveUsuarioAlvo_` permite admin consultar dados de qualquer usuário via parâmetro `usuarioAlvo`; nova função `listarUsuariosWaPessoal` lista usuários ativos. Frontend ganhou dropdown "Visualizando como" que aparece só para admin (detectado pela própria resposta de `listarUsuariosWaPessoal`); criação de campanha e conexão WhatsApp seguem restritas ao próprio usuário. (2) **Import de planilha**: removidos os 2 selects de "Leads Meta Ads" do dropdown de fonte; adicionada opção "Importar planilha (.xlsx, .csv)" com auto-detecção heurística de coluna telefone (mais hits de `\d{10,13}` no sample) e coluna nome (mais hits de strings com letras). Override manual via 2 dropdowns de coluna. Reusa SheetJS já carregado em Index.html. (3) **Aba Dashboard**: 4ª tab com 5 KPIs (enviadas no mês, taxa resposta, campanhas ativas, blacklist, total campanhas), gráfico de linha 30d (Chart.js, séries enviado/respondeu/erro) e tabela de instâncias. Admin tem botão "Ver todos os usuários" que invoca `getDashboardWaPessoal(_, '__all__')` agregando dados globais. |
| 09/05/2026 01:25 | v524 | WA Pessoal Dashboard — fix Chart.js. Carregamento lazy via `_wpLoadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', cb)` (mesmo padrão de `Extrato.html`). Antes mostrava "Chart.js não carregado" pois o script não está no Index.html. |
| 09/05/2026 01:35 | v525 | UX polish. (1) `<option>` dos dropdowns do `DispPessoal.html` agora forçam fundo `#1a1d24` + texto `#e8ecf3` — antes herdavam o tema do SO (fundo cinza claro com fonte branca = ilegível). (2) Sidebar: emojis coloridos `📨` (Disparos), `📲` (WA Pessoal), `👥` (Usuários) substituídos por símbolos Unicode monocromáticos `✉`, `☏`, `◐` para alinhar ao padrão visual do resto do menu (◉ ≡ ◈ ⊛ etc). |
| 09/05/2026 01:45 | v526 | Rename: "Disparos em Massa" → "Disparos Waba" em 4 lugares user-facing — `Index.html` (item sidebar), `JS.html` (breadcrumb), `Usuarios.html` (UI permissões), `Disparos.html` (tag interna). IDs internos (`disparos`/`menuDisparos`/`pageDisparos`) preservados; backend e docs intactos. |
| 09/05/2026 12:40 | v531 | **WA Pessoal — fix Retomar dispara webhook.** Bug detectado: `retomarCampanha` só mudava status pra `ativa` no Sheets, mas o loop do WF1 morre quando a Decisão retorna `skip_pausada` (não há trigger externo agendado). Fix: agora dispara `POST /webhook/wa-pessoal-despacho` após mudar status. Mesmo padrão que o WF3 schedule diário usa pra retomar `pausada_limite_diario` e que o `criarCampanha` usa pra inicializar. |
| 09/05/2026 11:32 | v530 | **WA Pessoal — placeholders opcionais + excluir campanha.** (1) `{nome}`/`{cidade}` deixam de ser obrigatórios — variações via Claude já reduzem hash duplicado, então personalização vira opcional (chips ainda disponíveis pra mailings que tiverem os campos). Removido check em `wpAtualizarPreview`, `wpGerarVariacoes`, `wpCriarCampanha` (frontend) + `criarCampanha`, `gerarVariacoesMensagem` (backend); prompt da Claude condicionalmente inclui linha "preserve placeholders" só se original tiver. Filtro de variações continua exigindo placeholders se original tinha. (2) Nova função backend `excluirCampanha(usuario, campanhaId, usuarioAlvo)` — admin only — apaga linha em `WA Campanhas` + todas as linhas relacionadas em `WA Disparos`. Botão `🗑` no Histórico só aparece se `_wpIsAdmin=true`; usa `wpConfirm({tipo:'perigo'})` + `wpLoading`. |
| 09/05/2026 11:22 | v529 | **WA Pessoal — UX modais.** (1) Modais (`📋 disparos`, confirm, loading) movidos pra `<body>` no `dispPessoalInit` — escapa containing block do sidebar/header do CRM (estavam ficando atrás do menu). z-index `999999`. (2) `confirm()` nativo do navegador removido em todos os fluxos: `wpConfirm({titulo, mensagem|html, okLabel, cancelLabel, tipo:'perigo', onOk})` + `wpLoading(msg)`/`wpLoadingClose()` reutilizáveis. Aplicado em "Iniciar Campanha", "Cancelar campanha" e "Desconectar WhatsApp". (3) Modal de disparos agora exibe **uma linha por contato** (Contato · Status · Última atividade); clicar expande detalhe (mensagem completa + erro + todos os timestamps + message_id). Seta ▶/▼ indica estado. (4) Ao clicar "Iniciar Campanha", aparece imediato `Processando — enfileirando disparos…` com spinner; só fecha após resposta. |
| 09/05/2026 11:09 | v528 | **WA Pessoal — log de disparos + delivery/read receipts.** Backend: `_handleWaPessoalUpdate_` aceita 2 shapes (envio normal vs `delivery_update:true`); novo `_handleWaPessoalDeliveryUpdate_` faz lookup por `message_id` e atualiza `entregue_em`/`lido_em` (READ implica entregue); novo `getDisparosCampanha(usuario, campanhaId, usuarioAlvo)` retorna disparos da campanha. Frontend: botão `📋` por campanha no Histórico abre modal com tabela contato/status/mensagem/timestamps + KPIs (% entregue, % lido, % respondeu) e ícones `✓`/`✓✓` (cinza=entregue, verde=lido) no estilo WhatsApp. n8n WF1 "Marca Enviado" envia `mensagem_enviada` (texto pós-sorteio + replace) e `message_id` (`$json.key.id` da resposta `sendText`). n8n WF2 ganhou branch paralelo `Parse Delivery → doPost GAS (delivery)` que escuta `messages.update` da Evolution API com `status` ∈ {`DELIVERY_ACK`, `READ`} e `fromMe=true`. 4 colunas novas em `WA Disparos` (K=`mensagem_enviada`, L=`message_id`, M=`entregue_em`, N=`lido_em`) via one-shot `_addColunasRastreamentoWaDisparos`. |
| 09/05/2026 10:32 | v527 | **WA Pessoal — variações via Claude API.** Backend: `gerarVariacoesMensagem(usuario, template_msg)` em `DispPessoalAPI.js` (reusa `_callClaudeApiDiag_`, prompt preserva `{nome}`/`{cidade}` e proíbe inventar preço/plano/prazo); `criarCampanha` aceita `dados.variacoes` e grava JSON na nova col M `variacoes_json` em `WA Campanhas`. Frontend: botão "✨ Gerar variações" + painel de checkboxes (Marcar todas/Desmarcar/Regenerar) na "Nova Campanha". n8n WF1 "Prepara Envio" sorteia 1 variação por contato no momento do envio (fallback silencioso a `template_msg`). One-shot `_addColunaVariacoesWaCampanhas` em `_waVariacoesSetup.js` para criar col M (executar UMA VEZ no editor). Custo: ~$0.005/campanha. Reduz risco de ban por hash duplicado. |
| 07/05/2026 20:15 | v508 | Header do painel refatorado via `_dhpPopularHeaderPainel`: nome (texto simples, cor do status), CPF·ID·L.XXXX em linha, pStatusWrap vazio (hidden via :empty), canal como chip estilizado + responsável + lançamento no pMeta. Remove emoji de produto e badges de status do header em todos os caminhos (PAP, main, combo). |
| 07/05/2026 19:45 | v507 | Header do painel: "Linha X" movida para a linha de CPF/ID (info de identificação, não status); `pStatusWrap` limpo — só badge(s) de status; combo mostra labels "FIBRA" e "MÓVEL" antes de cada badge. Badge "⚠ sem móvel" integrado ao pStatusWrap. |
| 07/05/2026 19:20 | v506 | Painel lateral: Canal, Responsável e Data/Hora do Lançamento movidos para o topo fixo (novo elemento `#pMeta`, estilo mono muted com separadores `·`); removidos do scroll. CSS mais compacto: padding/gap das seções, campos e linhas reduzidos ~25%. |
| 07/05/2026 18:45 | v505 | Painel lateral combo redesenhado: Fibra e Móvel exibidos como seções independentes no mesmo painel (border-left azul=Fibra, verde=Móvel), cada uma com status, plano, valor, vencimento, pagamento, agenda interativa e turno próprios. VALOR extraído do plano quando coluna vazia. Botão "✏️ Editar Móvel ↗" abre painel individual do Móvel. `_resumirVendaVinculada_` agora inclui `venc`, `fat`, `preStatus`, `reagendamentos`. |
| 07/05/2026 18:00 | v504 | Nova função `repararVinculosCombosOrfaos()` (rodar no editor): (1) arquiva entradas ATIVO duplicadas em "Vinculos Vendas" mantendo só a mais recente por mãe; (2) para cada Fibra Combo sem Móvel vinculado, infere o par por CPF/WhatsApp e vincula se há exatamente 1 candidato livre — ambíguos e sem par ficam no log para revisão manual. |
| 07/05/2026 17:35 | v503 | Prevenção estrutural: `_registrarVinculoVenda_` arquiva todas as entradas ATIVO da mesma mãe antes de criar o novo vínculo — elimina acúmulo de entradas obsoletas em "Vinculos Vendas" que causava seleção errada da filha no agrupamento combo. |
| 07/05/2026 17:10 | v502 | Fix agrupamento combo: `_decorarVendaComVinculos_` agora itera `filhos` de trás para frente e escolhe a filha mais recente cujo produto contém 'MOVEL' — entradas obsoletas/duplicadas em "Vinculos Vendas" não quebram mais o agrupamento visual. |
| 07/05/2026 16:20 | v501 | Fix agrupamento combo na lista: `getSincronizacaoInicial` agora decora vendas com vínculos (`_decorarVendaComVinculos_`) antes de cachear — combos criados anteriormente passavam a aparecer não-agrupados quando o cache rápido do startup era usado como fonte da lista. |
| 07/05/2026 14:05 | v500 | Painel lateral combo: seção 🔗 Vínculos agora exibe dados do Móvel inline (produto, plano, valor, status, linha, portabilidade, ativação, contrato) em vez de apenas link. Fix SEGMENTAÇÃO: campo nunca era gravado pelo formulário principal — faltava `f_segmentacao` em `CAMPOS_FORM` e no HTML; adicionado hidden input + auto-preenchimento via `getSegmentacaoPorCidade` em `_preencherEndereco`. Fix menor: `repararSistemaSegmentacao` gravava SEGMENTACAO na col 27 (antiga) em vez de `c.SEGMENTACAO+1`. |
| 07/05/2026 11:30 | v495 | Cruzamento Vero: emoji 🟢/🟡 reposicionado entre PRODUTO e PLANO (embutido dentro de `vi-plano-val` para escapar do auto-placement do CSS Grid); tooltip atualizado para mostrar "Encontrado: aba Vendas" usando nome da aba armazenado junto ao emoji (`'🟢 Vendas'`) |
| 07/05/2026 10:33 | v494 | Cruzamento Vero persiste resultado: após importar XLS, grava automaticamente 🟢 (match CRM+Vero) ou 🟡 (só CRM) na nova coluna `VERO_STATUS` (índice 43, AR) via `salvarResultadoCruzamento()`. Emoji exibido no card da Lista de Vendas logo após o badge de produto (cards normal, PAP e combo) |
| 07/05/2026 10:09 | v493 | Nova coluna `CRIADO_EM` (índice 42, AQ): grava data/hora do lançamento no primeiro `salvarVenda`; preservada em edições via merge. Exibida como `Lanç. DD/MM HH:MM` (opacidade 55%) na linha de datas do card (todos os renderizadores) e como "Lançamento DD/MM/YYYY HH:MM" na seção 📅 Datas do painel lateral |
| 07/05/2026 09:59 | v492 | Nova Venda: remove "Móvel Alone" e "Móvel Combo" do dropdown de produto — Móvel só pode ser criado via modal automático após Fibra Combo. Guard no agrupamento visual: combo só renderiza como card único se `vendaMovelResumo.produto` contém "MOVEL" (evita dois Fibras agrupados por vínculo errado) |
| 06/05/2026 14:44 | v491 | Painel Ads: corrige botão "↻ Atualizar" (paAtualPeriodo inacessível no escopo global do onclick → `paRefresh()`); datas reais no sync label (`3 dias · 02/05 – 05/05`); aviso âmbar se dados >12h (`⚠️ Dados de … — clique em Atualizar`); subtítulo diferenciador em ambas as interfaces; `adsDateRangeLabel` no Dashboard Meta Ads ✦; filtro `gasto > 0` nos relatórios diários para excluir campanhas pausadas do diagnóstico Claude. |
| 05/05/2026 23:01 | v486 | Bug fix `doPost`: (1) linha via varredura da coluna STATUS em vez de `getLastRow()` — elimina salto para linhas em branco formatadas; (2) canal via `payload.canal \|\| 'META ADS'` — elimina gravação com canal inválido `'LEAD'`; futuramente Google Ads envia `canal: 'GOOGLE ADS'` no payload. Bug fix `movelHoje`: (3) `criarVendaMovelVinculada` agora define `dataAtiv: new Date()` em vez de `''` — chips criados via botão passam a ser contados no Parcial do Dia; (4) `toDate()` no `getDashboard` passou a parsear strings `DD/MM/YYYY` e `YYYY-MM-DD` além de Date/número serial. |

---

## Roteamento do doPost (Code.js)

O `doPost` roteia requisicoes externas por campo do payload — ordem de prioridade:

| Condicao | Destino | Origem |
|---|---|---|
| `payload.action` sem `secret` | `_routePAP()` | Portal PAP (Parceiros.html) |
| `payload.utm_source` ou `utm_campaign` | `registrarLeadMetaAds()` → aba "Leads Meta Ads" | Botconversa ou n8n/Renata |
| `payload.secret` valido + `action === 'claude_ads_bridge_upsert'` | Claude Ads Bridge | meta-ads-vero MCP |
| `payload.secret` valido (default) | Insercao no CRM principal | Botconversa (leads sem UTM) |

Nota: desde v462 (28/04/2026), a rota de `utm_campaign` aceita payloads com `secret` tambem
(antes exigia `secret === undefined`). Isso permite que o Botconversa envie campanha + segredo.

**Canal de vendas na rota default:** o campo `Canal` é lido de `payload.canal`; se ausente, cai em
`'META ADS'` (todo tráfego atual é Meta Ads). Quando Google Ads for ativado, configurar o
Botconversa para enviar `canal: 'GOOGLE ADS'` no payload dos leads orgânicos desse canal,
ou garantir que os leads venham com `utm_source`/`utm_campaign` (rota Meta Ads).

**Lógica de inserção na rota default:** usa varredura da coluna STATUS (mesma lógica de
`salvarVenda`) — não usa `getLastRow()` puro, pois o Sheets considera linhas com formatação
condicional ou validação de dados como "usadas", causando saltos de centenas de linhas.

---

## Regras Operacionais

- preservar contratos do frontend com `google.script.run`;
- evitar depender so de planilha ativa no GAS;
- nao remover integracoes com Supabase sem revisar `Dashboard`, `Painel Ads` e `Disparos`;
- quando a decisao for entre painel externo e CRM, preferir consolidar a operacao no DharmaPro;
- todas as funcoes da API de usuarios exigem `adminUsuario` como primeiro argumento e validam via `_assertAdmin_()`;
- **funções de uso único** (configurar*, reparar*, migrar*, limpar*, diagnosticar*) vão para `_arquivo.js` — **nunca para `Code.js`**. `_arquivo.js` está em `.claspignore` e não é enviado no deploy; as funções ficam acessíveis no dropdown do editor Apps Script para rodar manualmente.

---

## Proximos Passos Naturais

### WA Pessoal — pendências priorizadas (próxima sessão)

1. **Inbox dentro do CRM** (`~3-5 dias`): permitir que cada usuário responda clientes
   diretamente pela tela do DharmaPro em vez de pelo WhatsApp Web. Componentes:
   - Lista de conversas com last-message + contador de não-lidas
   - Histórico paginado via Evolution `/chat/findMessages/{instance}`
   - Envio de mensagens novas (texto e mídia)
   - Polling ou WebSocket pra mensagens novas em tempo real
   - Vínculo com lead/cliente do CRM (perfil ao lado da conversa)
   - **Antes de implementar, sessão de planejamento dedicada** com decisões de design
     (polling vs WebSocket, mídia sim/não, layout, scope por instância vs global).

2. ~~**Reescrita de mensagem via Claude API**~~ ✅ 09/05/2026 — `gerarVariacoesMensagem`
   em `DispPessoalAPI.js` (chama `_callClaudeApiDiag_` com prompt que preserva placeholders
   e nunca inventa preço/plano/prazo). Frontend tem botão "✨ Gerar variações" + lista de
   checkboxes para aprovar/rejeitar individualmente. WF1 "Prepara Envio" sorteia variação
   antes do replace de `{nome}`/`{cidade}`. Coluna `variacoes_json` (col M).

3. **Envio de imagens nas campanhas** (`~2-3h`): usar `POST /message/sendMedia/{instance}`

> ✅ 09/05/2026 — **Log de disparos visível no Histórico** (parte adicional fora das 3 pendências
> originais). 4 colunas novas em `WA Disparos`: `mensagem_enviada` (K), `message_id` (L),
> `entregue_em` (M), `lido_em` (N). WF1 captura `key.id` da resposta do Evolution `sendText` e
> envia junto com o texto efetivo (variação sorteada + replace) pro `_handleWaPessoalUpdate_`.
> WF2 ganhou branch paralelo `Parse Delivery → doPost GAS (delivery)` que escuta eventos
> `messages.update` da Evolution (status `DELIVERY_ACK` e `READ`) e atualiza por `message_id`.
> Frontend: botão `📋` por campanha no Histórico abre modal com tabela contato/status/mensagem/
> timestamps + ícones `✓`/`✓✓` (cinza=entregue, verde=lido) no estilo WhatsApp.

   da Evolution.
   - Frontend: input file na "Nova Campanha", upload pra Drive via `DriveApp.createFile`,
     pega URL pública.
   - Backend: salva `imagem_url` na campanha.
   - n8n WF1: se campanha tem `imagem_url`, troca `sendText` por `sendMedia`
     (texto vira `caption`).
   - Limites: ≤5MB; mesma imagem pra todos contatos (variação por contato fica pra depois).

### WA Pessoal — bugs/débitos conhecidos

- ~~**Loop Próximo do WF1**~~ ✅ 09/05/2026 — bug encontrado: o node "Loop Próximo"
  estava sem `method: 'POST'` no JSON, e o default do HTTP node n8n é GET. Resultado:
  cada execução enviava 1 mensagem e morria com HTTP 404 ("This webhook is not
  registered for GET requests"). Detectado em campanha de 293 leads que disparou só 1.
  Fix: adicionado `"method": "POST"` no node `wp01-loop`.
- ~~**Próximo Pendente do WF1 — bug do Sheets node v4**~~ ✅ 09/05/2026 — node
  `n8n-nodes-base.googleSheets@4` com 2+ filtros em `filtersUI` + `returnFirstMatch=true`
  retorna **um item por filtro** (cada filtro devolve seu próprio first-match), em vez
  de fazer AND. Resultado: `Próximo Pendente` retornava 2 itens (item 0 = primeiro com
  campanha_id, item 1 = primeiro com status=pendente). Como `Prepara Envio` usava
  `.first()`, sempre pegava o item 0 — uma row já marcada `enviado` na primeira execução.
  Loop infinito enviando pra mesma linha. Sintoma: 1 contato recebeu 16 msgs idênticas
  na campanha de 293 leads. Fix: WF1 abandonou Sheets node — agora chama HTTP endpoint
  GAS `wa_pessoal_next_pending` que retorna o primeiro pendente atomicamente.
- ~~**LockService timeout em chain GAS**~~ ✅ 09/05/2026 (v533) — segundo bug encontrado
  após fix do Sheets node: handlers GAS `_handleWaPessoalNextPending_`,
  `_handleWaPessoalUpdate_` e `_handleWaPessoalDeliveryUpdate_` usavam
  `LockService.getScriptLock()` (lock global por script). WF1 chama esses handlers em
  sequência rápida na mesma chain — Apps Script web app tem latência entre release e
  nova aquisição, causando **`Lock timeout: another process was holding the lock for
  too long`** no Marca Enviado. Sintoma idêntico ao Sheets bug: row ficava `pendente`
  porque o status não era atualizado, próximo loop pegava de novo, spam para mesmo
  contato. Fix: removido LockService dos 3 handlers + claim atômico em
  `_handleWaPessoalNextPending_` via `setValue('enviando') + SpreadsheetApp.flush()`
  antes de retornar — garante que próximo loop não pegue a mesma row mesmo se Marca
  Enviado falhar.
- **Typing presence** retorna "Invalid JSON in response body" intermitentemente;
  workflow tem `continueOnError` então não bloqueia, mas vale investigar com Evolution
  upstream em algum momento.
- **Heurística LID→phone** (WF2 webhook entrada): pega o último disparo `enviado` da
  instância. Funciona pra 1 disparo de cada vez (delay 12-35s garante isso). Em volume
  alto com respostas em paralelo, pode dar falso positivo. Se virar problema, evoluir
  pra cache LID↔phone montado no primeiro envio.
- **Janela de horário do WF1** está com check ativo (08:00–20:00 BRT seg-sáb) — reativado
  em 09/05/2026 após detectarmos que o stub `HORÁRIO DESABILITADO P/ TESTE` tinha ficado em
  produção. O node `Checa Horário` lê `new Date().getHours()` direto (TZ container =
  America/Sao_Paulo) e bloqueia domingo (dow=0). Se esquecer de reativar em alguma sessão
  de teste, o despacho passa em qualquer hora silenciosamente.
- **Secrets dos workflows WA Pessoal** (Evolution apikey, GAS callback secret) agora vêm de
  env vars expostas ao container n8n: `EVOLUTION_API_KEY` e `WA_PESSOAL_SECRET` em
  `/opt/renata/.env` + `docker-compose.yml`. Nos JSONs versionados em `wa-pessoal/n8n/`
  ficam como `={{$env.EVOLUTION_API_KEY}}` e `{{$env.WA_PESSOAL_SECRET}}`. Se mexer no
  workflow pelo editor n8n, manter as expressões — não recolar valor literal.

### Outras pendências do DharmaPro

- rodar `migrarUsuariosParaSheet()` no editor Apps Script para ativar a gestao de usuarios via CRM;
- ~~rodar `configurarTriggerRelatorioDiarioAds()` UMA VEZ no editor Apps Script para ativar o relatório diário automático às 07h~~ ✅ configurado e gravando dados desde 06/05/2026;
- ~~resolver pagamentos pendentes na conta Meta Ads antes de ativar campanhas A/B/C~~ ✅ 28/04/2026;
- ~~resolver erro #1487194 do A2 (Instagram vinculado) antes de editar o anuncio no Ads Manager~~ ✅ 28/04/2026 — creative recriado via API;
- consolidar o workflow WABA final no projeto `disparo-massa`;
- documentar de forma definitiva a captura correta de `messaging_limit_tier`;
- revisar encoding de arquivos HTML/JS antigos;
- rotacionar chaves expostas em testes operacionais.
