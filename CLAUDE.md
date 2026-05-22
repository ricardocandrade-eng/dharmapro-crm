<!-- dharmapro-crm | CLAUDE.md | 13/05/2026 -->

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

Em 11/05/2026 o **fluxo de cadastro/edição de venda** passou por uma refatoração
estrutural completa (v550–v556) após audit das 44 colunas (A–AR) da aba `1 - Vendas`
contra todos os caminhos de gravação (Nova Venda, painel inline, MS2/MS3, Móvel
Combo, funil drag-and-drop, webhook BotConversa, integrações NG/Adapter).

Resultado consolidado:
- **`_construirLinhaDados` é o ponto único de normalização**: datas vão a `DD/MM/YYYY`,
  Sistema/Segmentação fazem lookup automático via `getSistemaPorCidade`/`getSegmentacaoPorCidade`
  quando cidade está preenchida, valor passa por `_normalizarValorParaNumero_`.
- **`_validarTransicaoStatusServer_` em `Code.js`** valida pré-requisitos das transições
  1→2 (`dataAtiv+contrato+agenda+turno`) e 2→3 (`instal` + obrigatoriamente vir de 2)
  em **todos os caminhos backend** (`salvarVenda`, `moverVendaFunil`, `moverLeadAguardando`).
- **Modais `#modalStatus2`/`#modalStatus3` eliminados**: a transição de status acontece
  inline no painel lateral via `pifOnStatusChange` (revela a seção 📅 Datas, pré-preenche
  com hoje, foca o próximo campo obrigatório).
- **Frontend usa `_buildVendaPayload_(contexto, venda)` como builder único** — `pifSalvar`,
  `nvSalvar` e helpers de transição são one-liners.
- **`_filtrarStatusPorProduto`** preserva status legado como opção `⚠ legado` quando o
  produto (Móvel/Fibra) não inclui o status atual no enum — resolve o bug crônico de
  "não consigo editar status do Móvel em combo".
- **`_propagarFibraParaMovelSeCombo_`** replica campos compartilhados (cliente/CPF/endereço/
  contato/canal/responsável) da Fibra para o Móvel vinculado ATIVO em cada `salvarVenda`.
- **`_decorarVendaComVinculos_`** não agrupa mais 2 Fibras como combo (fallback genérico
  removido); `repararVinculosCombosOrfaos` ganhou janela temporal bidirecional de 7 dias.
- **`doPost` (webhook BotConversa)** agora chama `buscarCEPBackend` e usa
  `_construirLinhaDados` — vendas via webhook nascem com endereço + sistema/segmentação
  completos.
- **Mojibake zerado** em `JS.html`: 14 strings com encoding quebrado nos cards combo
  agrupados (`MÃ³vel`, `AtivaÃ§Ã£o`, `ðŸ‘¤`, `Â·` etc) foram corrigidas — algumas eram
  bugs funcionais (CSS class quebrada, branches que nunca disparavam).
- **Nova seção `🔧 Sistema`** read-only no painel expõe campos antes invisíveis na UI:
  `STATUS_PAP`, `VEROHUB`, `VEROHUB_PEDIDO/DT`, `VIABILIDADE`, `BC_*`, `CRIADO_EM`,
  `VERO_STATUS`.
- **Backfill executado**: `repararSistemaSegmentacao` corrigiu 7 linhas históricas;
  `repararVinculosCombosOrfaos` vinculou TAINARA + deixou 20 ambíguos + 10 sem par
  para revisão humana.

Em 12/05/2026 o feature **Forma de Pagamento (Boleto vs Recorrente)** foi modelado
no schema (v562) após a Vero formalizar dois clusters de preço lado a lado na NP 2.0
(boleto cheio vs débito automático/cartão/pix com −R$10 para Fibra).

- **Nova coluna AT (`FORMA_PAGAMENTO`)** em `1 - Vendas`. Valores: `'BOLETO'`,
  `'RECORRENTE'` ou `''` (vazio em legado pré-feature). `TOTAL_COLUNAS: 45 → 46`
  (AS reservada para `CRIADO_POR` do v559).
- **`planos_vero.json` expandido 9 → 13 cols** (append no final: `ESPECIAIS_REC`,
  `OURO_REC`, `PRATA_REC`, `PADRÃO_REC`). Fibra: REC = Boleto − R$10. Móvel:
  REC = Boleto (sem desconto formal). Backward-compatible — callers antigos que
  leem só cols 0-8 continuam funcionando.
- **`getValorPlano(plano, cidade, forma)`** novo: lookup direto no JSON considerando
  a forma de pagamento. Frontend chama ao trocar Plano ou Forma → recalcula valor.
- **`getOfertasCidade`** retorna `{valorBoleto, valorRecorrente}` — Mapa de Ofertas
  exibe os 2 valores lado a lado ("Boleto R$ X · Recorrente R$ Y"). Hardcode
  `valor - 10` eliminado em `Code.js:2510`.
- **Validação obrigatória em cadastro novo**: `salvarVenda` rejeita sem
  `formaPagamento` ou sem `venc` quando `linhaReferencia` está vazia. Legado
  (vendas pré-feature reabertas) passa sem reclamar.
- **Coluna Q (`FAT`) liberada**: deixou de ser fonte da verdade. `_construirLinhaDados`
  parou de gravar nela; `pif-fat` removido do painel. A coluna pode ser limpa
  manualmente e reutilizada para outro dado.
- **Vencimento agora é dropdown** (`05` / `10` / `13` / `19`) na Nova Venda
  e no painel lateral. Valores legados fora do enum entram como `⚠ X (legado)`
  via `_pifSetSelectComLegado`.
- **Combo herda Forma**: `_COMBO_PROPAGAVEIS_` inclui `formaPagamento`;
  `criarVendaMovelVinculada` herda da Fibra mãe. Se cliente troca Forma na Fibra,
  o Móvel vinculado segue.
- **Cards visuais atualizados**: 3 renderizadores substituem `v.fat` por
  `_labelFormaPagamento(v.formaPagamento)` (💰 Boleto / 🔁 Recorrente).
- **`nv-valor` virou readonly** — o valor vem do backend via `getValorPlano`,
  evitando edição manual divergente.
- **Rev4 do JSON executado** no editor (42 linhas, 9373 bytes no Drive).

Em 13/05/2026 o `Cruzamento Vero` passou a ter **import automático via Gmail** (v599–v601).
Pipeline end-to-end sem interação humana:

- **Origem**: e-mail `Relatório de Vendas - SNIPER MOBILE` da Vero
  (`coordenacao_sis@verointernet.com.br`), redirecionado do Outlook para o Gmail
  do Ricardo via regra do Outlook; filtro Gmail `subject:(SNIPER MOBILE) has:attachment`
  aplica label `vero-sniper`.
- **Backend `CruzamentoAutoAPI.js`**:
  - `_buscarThreadVeroMaisRecente_` faz 5 queries em cascata (label → from+subject →
    subject → filename exato → filename:SNIPER) — tolera diferentes pipelines de
    entrega e configuração do filtro Gmail.
  - `_xlsxParaSheetsTemp_` converte o XLSX em Google Sheets temporário via Drive REST
    API (`UrlFetchApp` + `ScriptApp.getOAuthToken()` em multipart). **Sem dependência
    do Advanced Drive Service** — usa o escopo `drive` já existente.
  - `_extrairAbasVero_` lê abas VENDAS, INSTALACOES, CANCELAMENTO/CHURN, MOVEL com
    `SpreadsheetApp.openById`, normalizando datas para `DD/MM/YYYY`.
  - `_cruzConsolidarServer_` aplica prioridade `INSTALAÇÕES > VENDAS > 🟡`, com
    **filtro mensal no 🟡**: usa `_cruzMesVigenteServer_` sobre `DATA_CADASTRO` da aba
    VENDAS — só marca 🟡 contratos do CRM cujo `dataAtiv` cai no mesmo mês/ano
    (evita marcar todo histórico como "falta no Vero" em relatórios diários).
  - Sheets temporário apagado no `finally`. Idempotência via Script Property
    `CRUZ_VERO_LAST_THREAD` (último threadId processado).
- **Gravação wipe-and-replace**: nova função `aplicarVeroStatusCompleto` em `Code.js`
  escreve a coluna `VERO_STATUS` inteira em uma operação `setValues`, limpando
  resíduos de imports anteriores. `salvarResultadoCruzamento` (modo aditivo legado)
  mantida para compat.
- **Entradas públicas**:
  - `buscarEImportarVero(usuario)` — alvo do botão `📧 Buscar último da Vero`
    no toolbar da página Cruzamento.
  - `importarRelatorioVeroAutomatico()` — alvo do trigger diário 09h BRT.
- **Escopo OAuth** `gmail.readonly` adicionado em `appsscript.json`.
- **One-shots em `_cruzAutoSetup.js`** (executar via editor):
  - `configurarTriggerCruzamentoVeroDiario` — agenda trigger 09h (idempotente).
  - `removerTriggerCruzamentoVeroDiario` — desliga.
  - `forcarAutorizacaoGmail` — chama `GmailApp.search` direto para forçar o
    diálogo OAuth quando o GAS não detecta o novo escopo automaticamente
    (quirk conhecido: manifest atualizado via clasp não invalida a sessão
    autorizada — chamada transitiva não dispara diálogo, só chamada direta).
  - `testarBuscarVeroAgora` — roda o pipeline manualmente.
  - `limparUltimoThreadProcessadoVero` — descarta marca de idempotência para
    forçar reprocessamento do último thread.
- **Validação E2E** (13/05/2026 12:55): 1 thread encontrado via query #1,
  parseou 16 vendas + 12 instalações + 11 cancelamentos + 10 móvel da aba
  Vero contra 3927 contratos CRM, gravou 13 🟢 Instalações + 5 🟢 Vendas +
  1 🟡 em ~25s.

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
- `WA Campanha` (renomeado de "WhatsApp Pessoal" em 10/05/2026) — módulo full-stack
  operacional, Fases 1-3 concluídas em 08-09/05/2026; pendências #1 (variações via Claude)
  e #2 (envio de imagens) finalizadas em 09-10/05/2026.

  **Stack**: disparo em massa via número comum conectado por QR Code à Evolution API
  self-hosted em `evolution.ofertasverointernet.com.br`. Cada usuário tem sua própria
  instância (nomeada com o login do CRM). 4 abas dedicadas no Sheets:
  - `WA Instâncias` (A-H)
  - `WA Campanhas` (A-N: id, usuario, nome, criado_em, status, total_contatos,
    total_enviado, total_respondeu, total_erro, template_msg, delay_min, delay_max,
    `variacoes_json`, `imagem_url`)
  - `WA Disparos` (A-N: campanha_id, contato_nome, contato_phone, status, criado_em,
    enviado_em, respondeu_em, erro_msg, tentativas, instance_id, `mensagem_enviada`,
    `message_id`, `entregue_em`, `lido_em`)
  - `WA Blacklist` (A-C)

  **Pipeline n8n**: 3 workflows ativos (`wa_pessoal_01_despacho`, `wa_pessoal_02_webhook_entrada`,
  `wa_pessoal_03_schedule_diario`). WF1 chama endpoints GAS (`wa_pessoal_check_dispatch` pra
  janela horário/bypass, `wa_pessoal_next_pending` pra próximo pendente atomicamente claimado,
  `wa_pessoal_update` pra Marca Enviado/Erro). WF2 (webhook entrada da Evolution) chama
  `wa_pessoal_mark_respondeu` pra respostas e `wa_pessoal_update` (delivery_update) pra
  delivery/read receipts. Secret próprio em `CFG_WA_PESSOAL.WA_PESSOAL_SECRET`.

  **Anti-ban**: delay 12-35s aleatório, janela 08:00-20:00 BRT seg-sáb (com **toggle de
  bypass admin** no Dashboard), warm-up dinâmico (50/100/150/200 por semana), pausa em 3
  erros consecutivos, blacklist automática em opt-out, claim atômico (`status='enviando'`)
  pra evitar duplicar disparos quando Marca Enviado falha.

  **Features**:
  - **Variações via Claude API** (09/05/2026): botão "✨ Gerar variações" na Nova Campanha
    gera 10 reescritas via Claude (preservando `{nome}`/`{cidade}` se o original tinha);
    placeholder é OPCIONAL. WF1 sorteia 1 variação por contato no envio. Coluna
    `variacoes_json` (col M).
  - **Envio de imagens** (10/05/2026): upload pra Drive (folder "WA Pessoal Imagens",
    pública via `drive.google.com/uc?export=download`), URL salva em col N `imagem_url`.
    WF1 tem IF "Tem imagem?" → branch `sendMedia` da Evolution (caption=texto/variação)
    OU branch `sendText` existente. Limite ≤5MB. Mesma imagem pra todos contatos.
  - **Log completo de disparos** (09/05/2026): mensagem efetivamente enviada (variação
    sorteada + replace), `message_id`, `entregue_em` (DELIVERY_ACK), `lido_em` (READ).
    Modal `📋 Ver disparos` no Histórico mostra cada disparo expansível com ✓/✓✓ estilo
    WhatsApp + KPIs por campanha.
  - **Tracking de respostas com privacidade LID** (10/05/2026): Evolution v1.x emite
    `messages.upsert` com `key.remoteJid` em formato `phone@s.whatsapp.net` (sem privacy)
    OU `LID@lid` (privacy ON). Match exato por phone normalizado quando há phone real;
    fallback heurístico "disparo enviado mais recente da instância" quando vem LID.
    Endpoint `wa_pessoal_mark_respondeu` faz match+mark+blacklist+recalc atomicamente.
    **Atenção:** `body.sender` da Evolution é o phone do **dono da instância**, NÃO do
    remetente da mensagem incoming — não usar pra matching.
  - **Helper `_normalizePhoneBR_`**: reduz phones BR a 10 dígitos canônicos (DDD + 8),
    strippando prefixo `55` e o "9" extra de mobile quando 13 dígitos. Resolve cross-formato
    no match.
  - **Auto-conclusão da campanha** (10/05/2026): quando o loop do WF1 chama
    `wa_pessoal_next_pending` e GAS não acha mais disparos `pendente`,
    `_concluirCampanhaSeAtiva_` muda status `ativa→concluida`. Bolinha amarela do menu some
    automaticamente (filtra só `ativa`).
  - **Saúde da conta** (Dashboard tab): KPIs hoje vs baseline 7d (entrega %, engajamento
    [lido OU respondeu]/entregue %, resposta %, erros). Alertas amarelo/vermelho com
    sugestões anti-ban heurísticas (entrega <85/70%, engajamento <25/10% sustentado por
    resposta <3%, queda relativa vs baseline). Read receipts amplamente desabilitados são
    compensados pelo "engajamento efetivo" (resposta implica leitura).
  - **Bolinha amarela pulsante no menu** ("WA Campanha"): indica campanha `status='ativa'`
    do usuário logado. Polling 60s + refresh imediato após criar/pausar/cancelar/excluir.
  - **Excluir campanha** (admin only): botão `🗑` no Histórico apaga campanha + todos os
    disparos relacionados; confirmação modal `tipo:'perigo'`.
  - **Toggle bypass janela horário** (admin only, Dashboard): switch amarelo pra liberar
    disparos fora da janela 08-20 BRT seg-sáb. Estado em `Script Properties`
    (`WA_PESSOAL_BYPASS_HORARIO`) lido pelo WF1 via endpoint GAS — bypass reflete em
    tempo real.

  Spec completa em [../wa-pessoal/CLAUDE.md](../wa-pessoal/CLAUDE.md).
- `Dashboard`
- `Lista de Vendas`
- `Funil de Instalacoes`
- `Cruzamento Vero` com normalizacao de `ID Contrato` e leitura de `CHURN`
- `Cruzamento Vero` com aba dedicada para `Movel`
- `Cruzamento Vero` import automático via Gmail (botão `📧 Buscar último da Vero` +
  trigger diário 09h `importarRelatorioVeroAutomatico`)
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

### ⚠️ OBRIGATÓRIO: toda página/menu novo entra na tela "Gerenciar Usuários"

**Regra:** sempre que criar uma página/menu novo no CRM, ela **TEM que ser
registrada na tela "◐ Gerenciar Usuários" → aba "Permissões por Perfil"**. Em
concreto, adicionar o id do menu nas DUAS listas em `Usuarios.html`:

- `US_MENU_LABELS` — `{ 'idDoMenu': 'Rótulo amigável' }`
- `US_TODOS_MENUS` — incluir `'idDoMenu'` no array

**Por quê:** a tela "Permissões por Perfil" salva em `PERFIS_MENUS_JSON` **apenas
os menus que estão em `US_TODOS_MENUS`**. Se a página nova não estiver lá, no
primeiro "Salvar" que o admin der naquela tela, o meno é **removido** de
`PERFIS_MENUS_JSON` para todos os perfis e some do CRM (foi o que derrubou
`viabilidade` e `vinculosPendentes` em 20/05/2026 — ambos tinham sido criados
sem entrar nessas listas).

**Checklist completo de "adicionar página nova ao CRM"** (não pular nenhum):

1. `Index.html` — item de menu (`<div class="nav-item" id="menuXxx" onclick="navegar('xxx')">`) + page div (`<div id="pageXxx" class="page page-full">…`).
2. `JS.html` — `'xxx'` em `_menusPermitidos` (default), em `_menuMap` (`'xxx':'menuXxx'`) e um branch em `navegar()`.
3. `Config.js` — incluir `'xxx'` em `PERFIS_MENUS` nos perfis que devem ver.
4. **`Usuarios.html` — `US_MENU_LABELS` + `US_TODOS_MENUS`** (este passo é o desta regra; o mais esquecido).
5. **Se `PERFIS_MENUS_JSON` já existe em produção** (permissões já editadas pela UI), ele **sombreia o `Config.js`** — então adicionar no `Config.js` não basta: sincronizar a property (one-shot que faz união de `perfis.<perfil>` com `PERFIS_MENUS.<perfil>`) e o usuário precisa **logout/login** (permissões só recarregam no login).

> Exceção: **botões da topbar global** (ex.: 🔍 Consultar instalações) NÃO são
> páginas/menus de perfil — vivem fixos na topbar e não entram em `PERFIS_MENUS`
> nem em `Gerenciar Usuários`. Liberação/restrição deles é por guard no próprio
> handler (ex.: `_varreduraAbrir`), não por permissão de menu.

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
- Estrutura: array-of-arrays, **14 colunas** (a partir da Rev5, 12/05/2026):
  `[nome, TIPO, ESPECIAIS, OURO, PRATA, PADRÃO, NOME_LP, FEATURES, PUBLICAR, ESPECIAIS_REC, OURO_REC, PRATA_REC, PADRÃO_REC, PRODUTO_TIPO]`
- Linha 0: metadata (`Última atualização: ...`)
- Linha 1: header (segmentações de Boleto nas cols 2-5; Recorrente nas cols 9-12; tipo determinístico em 13)
- Linhas 2+: planos. Coluna `TIPO` (categoria operacional): `VERO MAIS`, `MUNDO FIBRA`,
  `ENTRETENIMENTO`, `COMPLETO`, `GAMER`, `MÓVEL`, `MÓVEL COMBO`.
- **Cols 2-5 (Boleto)**: preço cheio (espelho da tabela Vero "SEM PAGAMENTO RECORRENTE").
- **Cols 9-12 (Recorrente)**: preço com débito automático/cartão/pix (`Boleto − R$10`
  para Fibra; igual a Boleto para Móvel — sem desconto recorrente formal).
- **Col 13 `PRODUTO_TIPO`** (fonte da verdade para filtro de planos por produto):
  domínio fechado `FIBRA_ALONE` / `FIBRA_COMBO` / `MOVEL_ALONE` / `MOVEL_COMBO`.
  Substitui filtro heurístico por nome — robusto a renomeações futuras da Vero.
- Frontend escolhe qual col de preço ler via `getValorPlano(plano, cidade, forma)`.
- `getPlanosPorCidadeProduto` filtra por PRODUTO_TIPO se a coluna existir; senão
  cai em heurístico (compat com Rev4).
- Backward-compatible: callers antigos que leem apenas cols 0-8 continuam funcionando.
- Aba `TABELA` do Sheets fica como fallback histórico (não deletar).

### Quem consome

Qualquer função que chama `_getTabela()`:
- `getOfertasCidade(cidade)` — Mapa de Ofertas (botão flutuante "+")
- `getPlanosPorCidadeProduto(cidade, produto)` — Nova Venda (dropdown plano)
- `buscarCEPBackend(cep, produto)` — fluxo CEP → planos
- **API pública** `doGet ?action=planos` / `?action=cidades` — consumidores externos (`ofertasverointernet`, `agente-ia-vero/Renata`).

### Endpoint público (`?action=planos`, `?action=cidades`)

Desde 12/05/2026, o `doGet` expõe duas rotas GET públicas (sem secret — dados são públicos) que servem o conteúdo do `planos_vero.json` em shape "amigável" para consumidores externos. Ambas reusam `_getTabela()` e `_getCidades()` (cache 600s) — não há leitura adicional do Drive/Sheets.

URL base: o deployment principal do Web App (mesmo `AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw/exec`).

**`?action=planos&cidade={cidade}&produto={produto}&forma={forma}`**

| Param | Valores | Default |
|---|---|---|
| `cidade` | nome da cidade (ex.: `Juiz de Fora`). Vazio = `PADRÃO`. | `''` |
| `produto` | `FIBRA_ALONE`, `FIBRA_COMBO`, `MOVEL_ALONE`, `MOVEL_COMBO`, vazio (todos). `FIBRA` é aceito como alias de `FIBRA_ALONE` (compat com PlanosSection.tsx legado). | `''` |
| `forma` | `BOLETO` ou `RECORRENTE`. Controla o alias do campo `preco`. | `BOLETO` |

Response (shape unificado — superset retrocompatível com a interface `Plano` de `PlanosSection.tsx`):

```json
{ "ok": true,
  "gerado_em": "2026-05-12T12:30:00Z",
  "cidade": "Juiz de Fora",
  "segmentacao": "PADRÃO",
  "total": 22,
  "planos": [
    { "nome":             "VERO MAIS 550MB + MÓVEL 20GB",
      "tipo":             "VERO MAIS",
      "produto_tipo":     "FIBRA_ALONE",
      "nome_lp":          "Vero Mais",
      "features":         ["20GB Celular", "Wi-Fi 6", "Kiddle", "Estuda Mais", "Instalação Grátis"],
      "speed":            { "valor": "550", "unidade": "MB" },
      "destaque":         true,
      "preco":            "112,90",
      "preco_boleto":     "112,90",
      "preco_recorrente": "102,90" }
  ]
}
```

Regras de geração:
- **Filtro `PUBLICAR`**: aceita boolean `true` (Rev2+) E string `'SIM'` (revisões antigas) — planos Móvel (`MÓVEL`/`MÓVEL COMBO`) têm `PUBLICAR=false` e ficam de fora desta rota.
- **Filtro `PRODUTO_TIPO`** (col 13, Rev5+): match exato após normalização. Em revisões anteriores (Rev4-) a col não existe e o filtro de produto é ignorado.
- **`preco`** é alias dinâmico: `preco = forma === 'RECORRENTE' ? preco_recorrente : preco_boleto`. Garante compat com clientes que leem apenas `preco`.
- **Fallback Rev3** (sem colunas `_REC`): `preco_recorrente = preco_boleto − 10` para Fibra; Móvel preserva (mesma regra de `getValorPlano`).
- **`speed`** derivado por regex `/(\d+)\s*(MB|GIGA|GB|MEGA)/i` no `nome`. `undefined` quando não casa.
- **`features`** splita por `|` ou `;` (col 7 hoje é string).
- **`destaque`** heurístico: primeiro plano com `tipo === 'VERO MAIS'` na lista filtrada.
- Preços-strings exóticos do JSON (ex.: `"209,9 (Bauru)"`) são preservados como string.

**`?action=cidades`**

Response:
```json
{ "ok": true, "total": 412, "cidades": ["Aimorés", "Alfenas", "..."] }
```

Array de strings (compat com `setCidades` em `PlanosSection.tsx:31`).

**Cache**: o `_getTabela()` cacheia o JSON por 600s. Atualizar preços via helper one-off (vide fluxo abaixo) invalida o cache automaticamente — endpoint reflete imediatamente.

**Consumidores conhecidos**:
- `ofertasverointernet/components/PlanosSection.tsx` (LP por cidade — desde 12/05/2026).
- `ofertasverointernet/components/HeroForm.tsx`.
- `agente-ia-vero` n8n node `no4c_consultar_planos_vero` (Renata IA — Fase 2 pendente).

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
- `CruzamentoAutoAPI.js` — import automático do relatório Vero via Gmail (botão + trigger 09h)
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
- `CRUZ_VERO_LAST_THREAD` — threadId do último e-mail Vero processado pelo import auto (idempotência); apagar via `limparUltimoThreadProcessadoVero` para forçar reprocessamento

Para restaurar permissões padrão: deletar `PERFIS_MENUS_JSON` nas propriedades do script.

---

## Deploy

### Deploy automático (GitHub Action) — `git push` já deploya

Existe uma GitHub Action (`.github/workflows/deploy.yml`) que dispara a **cada
`git push` na `main`** e faz o ciclo completo, sem intervenção:

1. `clasp push --force` (código do commit; credenciais via secret `CLASPRC_JSON`);
2. **reescreve a `DEPLOY_DATE` no `Config.js`** com a hora real BRT do deploy — por
   isso a `DEPLOY_DATE` servida fica ~1-2 min à frente da do commit; editar
   `DEPLOY_DATE` à mão é inútil (a Action sobrescreve);
3. **limpa versões antigas** (mantém as 10 últimas quando passa de 190) — resolve
   sozinha o limite de 200 versões do GAS;
4. `clasp deploy` no deploymentId principal (mesmo URL), descrição `Deploy <sha>`.

**Consequência prática:** para qualquer mudança que vai pro git, **basta
`git commit` + `git push origin main`** — a Action faz push+deploy. **Não rodar
`clasp deploy` manual** (cria versão dobrada com a da Action). O fluxo manual
abaixo é fallback (ex.: deploy imediato sem esperar a Action, ou ambiente sem a
Action). O `clasp` manual continua necessário só para **o que NÃO vai pro git**:
one-shots de setup no editor (arquivos `_xxxSetup.js`, não commitados —
push→executar→deletar→push) e diff de prod.

⚠️ Permissões de menu por perfil vivem na Script Property `PERFIS_MENUS_JSON`
quando ela existe — e ela **sombreia o `Config.js`**. Ao adicionar uma página/menu
nova, mexer no `Config.js` não basta: é preciso sincronizar a property (one-shot)
e o usuário precisa **logout/login** (permissões só recarregam no login). A tela
"Permissões por Perfil" (`Usuarios.html` → `US_TODOS_MENUS`/`US_MENU_LABELS`)
também precisa listar o menu novo, senão um "salvar" por ali o remove do JSON.

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
| 22/05/2026 ~12:50 | (via Action) | **feat(relatorios): nova aba Relatórios com filtros dinâmicos (estilo BI) + visão Vendas × Instalações.** Segunda tela de análise ao lado do Dashboard, para sair da granularidade fixa mês/dia do Dashboard e cruzar dimensões livremente. **Backend `RelatoriosAPI.js`**: `getRelatoriosHtml()`; `getRelatoriosDados(janelaMeses)` (default 12m; `0`=histórico completo) lê a aba `1 - Vendas` uma vez, projeta 14 de 64 colunas em array-de-arrays, filtra a janela pela UNIÃO das datas (venda/instalação/agenda/criação — não perde venda antiga instalada recentemente), cache chunked por janela (`relatorios_v1_<n>`, 600s); `prewarmRelatorios()` chamada fire-and-forget no pós-login (cache quente na 1ª abertura). **Frontend `Relatorios.html`** (self-contained, tema do Dashboard, Chart.js lazy + sessionStorage 120s): filtros 100% client-side instantâneos (período c/ presets + datas custom + base Data venda↔instalação, 7 multi-selects via `<details>`, comparar período anterior), KPIs com delta, tendência (combo: barras Vendas/Receita + linha de Instalações sempre, eixo Y2), ranking de vendedores, mix produto/plano e cidade/canal (barras agrupadas Vendas × Instalações), tabela dinâmica (dimensão × métrica); granularidade automática pelo span (≤62d Dia / ≤184d Semana / senão Mês) + `maxBarThickness` (sem barra única gigante). **Fiação** (checklist página nova): `Index.html` (menu após Dashboard + page div), `JS.html` (`_menuMap` + branch `navegar('relatorios')` + prewarm no login), `Config.js` (PERFIS_MENUS admin+supervisor), `Usuarios.html` (`US_MENU_LABELS`+`US_TODOS_MENUS`). One-shot `relatoriosMenuSetup()` (união de `relatorios` em `PERFIS_MENUS_JSON`) executado por Ricardo + logout/login; `_relatoriosMenuSetup.js` removido neste deploy. Validação: `node --check` no backend + `<script>` do HTML; clasp diff prod==HEAD antes de cada push. Consolida os deploys de 11:25/11:36/12:09 do dia. **Nota**: card "Receita Σ" soma mensalidades (Σ valor) — definição diferente da receita Vero do Dashboard (fator×ticket), proposital. |
| 22/05/2026 12:36 | (via Action) | **feat(pap): modal de confirmação antes de notificar o vendedor (BotConversa) na transição p/ status 2/3.** Origem: toda transição de uma venda **PAP** para `2- Aguardando Instalação` ou `3 - Finalizada/Instalada` disparava, server-side, uma mensagem WhatsApp ao vendedor via `_papNotificarVendedorPAP` (BotConversa) sem confirmação. Agora o frontend pede confirmação com prévia da mensagem antes do disparo. **Backend**: nova `getPreviewNotificacaoVendedor(linha, novoStatus, extras)` em `ParceirosAPI.js` (monta a prévia reusando `_papMontarMensagemNotificacao`, leitura leve de 1 linha, **sem** chamar a BotConversa; `extras={agenda,turno}` permite a prévia bater com a msg real quando agenda/turno foram digitados mas ainda não gravados — caso do mover lead; retorna `isPap` p/ o front decidir se mostra o modal). Os 3 disparos em `Code.js` (`salvarVenda`, `moverVendaFunil`, `moverLeadAguardando`) passaram a só notificar se `notificarVendedor !== false` (default = notifica → sem regressão p/ chamadores sem a flag). **Frontend**: modal `#modalConfirmVendedor` (`Index.html`) com prévia (vendedor + cliente + texto exato) e 3 botões **📤 Enviar / Salvar sem enviar / Cancelar**; helper `_gateNotificacaoVendedor(...)` (`JS.html`) plugado em `pifSalvar` (painel), `_confirmarMoveFunil` (funil) e `_confirmarMoveLeads` (leads) — Cancelar aborta tudo (não salva), move otimista só ocorre após decidir. Falha na prévia não bloqueia o save. **Fora de escopo** (mantêm comportamento atual — sempre notificam): Nova Venda criada já em 2/3 (`nvSalvar`) e auto-confirmação NG/Adapter (`atualizarVendaComNG`/`atualizarVendaComAdapter`). Validação: `node --check` em `Code.js`/`ParceirosAPI.js` + parse dos `<script>` de `JS.html`/`Index.html`; clasp diff prod==HEAD (sem drift) antes do push. **Não testado na UI** (GAS em produção). |
| 21/05/2026 23:45 | (via Action) | **feat(financeiro): resolver de código por SWEEP do VeroHub (todas as cidades) + pontuação merge + backfill escopado à janela de 6 meses.** Origem: o `getCodigoVeroPorPlanoCidade` só resolvia 4 cidades coletadas (~57 vendas). Via Claude-in-Chrome, varri `GET /api/plans_svas/{city_id}` em **432 cidades / 163 códigos** (a Vero usa código por plano×cidade/rede — provado: VERO MAIS 800+HBO+20GB tem 3 códigos por rede). Gerado **`verohub_codigos_cidades.json`** (Drive): `codigos`(163) + `porCidade`(359 cidades→códigos) + `cidadeIndex`(nome→city_id). **(1) Resolver reescrito** (`getCodigoVeroPorPlanoCidade`): tenta o SWEEP primeiro (cidade→city_id→códigos da cidade, match **conservador** — núcleo exato ou Jaccard≥0,92, prefere não-PACOTE, **pula ambíguos** pra não gravar código errado em dado financeiro), e cai no **dicionário legado** (`_getCodigoVeroLegado_`, 4 cidades) como fallback → cobertura estritamente maior, zero risco de falso positivo. Novos helpers `_getVerohubCodigos` (cache chunked, fallback por nome) + `_vhNucleo_`. Validado em node: JF→4279, BH/Goiânia→4590, Uberlândia/Vespasiano→4624 (cidades fora das 4 resolvem!); truncados/ambíguos → fallback sem chute. **(2) `pontuacao_planos.json` merge aditivo** (167 planos): rev2 (117) **intacta** + 50 códigos novos do sweep (43 com pontos). ZERO alteração nos pontos existentes (verificado). **(3) Backfill escopado** (`_fase3NaJanela_` em `fase3Backfill`/`DryRun`, decisão Ricardo): só processa vendas que ainda impactam estorno/inadimplência/projeção — status 2/Pendência Vero + status 3 instaladas nos **últimos 6 meses**. Base antiga liquidada **não é tocada**. `node --check` OK; JSONs válidos. **Forward**: vendas novas já nascem com código/pontos certos em qualquer cidade. **Ação Ricardo**: após sync do Drive, rodar `fase3BackfillDryRun` (confere salto de cobertura na janela) → `fase3Backfill` → refresh do painel. **Pendência**: nomes truncados no `planos_vero.json` (MUNDO/avulsos) não casam com o nome Vero do sweep — limpá-los (usando nomes do sweep) destravaria a cobertura total (long tail). |
| 21/05/2026 21:59 | (via Action) | **feat(financeiro): pontuacao_planos.json rev2 (cobertura ampliada) + fix dupla-contagem do combo + cleanup.** Destrava o Painel Q1 (que mostrava R$ 0 por cobertura baixa). **(1) `pontuacao_planos.json` rev2** (Drive): de 22 → **117 códigos**, cruzando `planos_vero_codigos.json` (código→nome→produto_tipo) × Tabela 04.05. FIBRA_ALONE = pontos diretos da tabela; FIBRA_COMBO = BL = total − pontos do móvel (franquia 10/20/30/60=25/40/55/85); MOVEL_ALONE = franquia direta. Contaminação decimal (MUNDO FIBRA 550/750) corrigida via tabela 24.03. Proveniência por entrada (`_prov.fonte`: extrato=alta / tabela_04.05=média / tabela_24.03_corrigida / franquia / sem_fonte). Cobertura: 6 extrato + 82 tabela + 17 corrigida + 4 móvel = **109 resolvidos / 117** (8 planos nicho sem fonte). Validado: 4590 (tabela) BL=70/mv=40 bate com 4279 (extrato). **(2) Fix dupla-contagem** (`_construirLinhaDados` + `_fase3CalcLinha`): com os códigos de Móvel agora no JSON, um combo gravaria os pontos do móvel em 2 linhas (Fibra mãe via movel_vinculado + Móvel filha via código próprio). Agora a linha **Móvel COMBO não grava pontos** (contam na Fibra mãe, §2.2) — Fibra e Móvel ALONE mantêm. **(3) Cache**: `fase3BackfillDryRun`/`fase3Backfill` limpam o cache do pontuacao antes de rodar (`_fase3LimparCachePontuacao`) — garante leitura da rev2. **(4) Cleanup**: removido `_financeiroMenuSetup.js` (menu já sincronizado). `node --check` OK; JSON válido (117). **Ação Ricardo**: após sync do Drive, re-rodar `fase3BackfillDryRun` (conferir cobertura nova) → `fase3Backfill`; refresh do painel. **Limitação conhecida**: Móvel ALONE (standalone) fica fora da projeção (status próprio ≠ "Aguardando Instalação"/"Finalizada") e, se contado, seria flat sem fator (carta) — refinamento futuro. |
| 21/05/2026 21:43 | (via Action) | **feat(financeiro): Fase 9 — Painel Financeiro Q1 (Projeção de Caixa), admin only.** Primeira tela do Módulo Financeiro (§8.1). Novo menu **◐ Financeiro** (sob Operacional, perfil admin). **Backend `FinanceiroAPI.js`**: `getFinanceiroHtml()` (injeta `Financeiro.html`); `getProjecaoCaixa()` lê todas as vendas (`getRange` até col 64), agrupa por mês de competência (instaladas via `MES_COMPETENCIA` §11.1; status 2 via mês da AGENDA = instalação projetada), resolve o fator por mês via `resolverEstrelaPorInstalacoes(instalações BL, mes)` e soma `(PONTOS_VENDA + PONTOS_MOVEL) × fator` — fórmula §11.9. Retorna janela de 4 meses (atual + 3) com previsto, tier/fator, pontos, adimplência diferida (0,4×BL×fator, M+3), confiança e cobertura. **Frontend `Financeiro.html`** (injetado, self-contained): card Q1 com total, 4 cards mensais, gráfico de barras e aviso de cobertura. **"Realizado" fica vazio** até o import do extrato (Fase 7). **Wiring completo** (checklist de página nova): `Index.html` (menu `menuFinanceiro` + `pageFinanceiro`/`financeiroContainer`), `JS.html` (`_menusPermitidos` + `_menuMap` + branch `navegar('financeiro')`), `Config.js` (PERFIS_MENUS admin), `Usuarios.html` (`US_MENU_LABELS` + `US_TODOS_MENUS`). **One-shot `_financeiroMenuSetup.js`**: `financeiroMenuSetup()` faz a UNIÃO do admin em `PERFIS_MENUS_JSON` (que sombreia Config.js) + 'financeiro' — **Ricardo roda no editor + LOGOUT/LOGIN**, senão o menu não aparece (mesma pegadinha de viabilidade/vinculosPendentes em 20/05). `node --check` OK (backend + `<script>` de ambos HTML). **Caveat rev1**: cobertura de pontuação ainda baixa (PONTOS resolvido em ~6 vendas) → projeção mostra números pequenos; cresce conforme dicionário/pontuacao_planos expandem. `getProjecaoCaixa` lê a planilha inteira sem cache (admin, uso esporádico). **Pendente**: rodar `financeiroMenuSetup()` + logout/login; depois removo o one-shot. |
| 21/05/2026 21:29 | (via Action) | **feat(financeiro): Fase 3 (Deploy 2/2) — schema econômico ativo no save (`TOTAL_COLUNAS` 46→64 + AU-BL).** Segunda metade da extensão de schema (§5), após Ricardo rodar os one-shots do Deploy 1 (sheet já tem 64 colunas físicas; backfill: COD 56 / PONTOS 6 / MES_COMPETENCIA 3056 de 4871 vendas — cobertura parcial esperada). **`CONFIG`**: `TOTAL_COLUNAS 46→64` + 18 chaves novas em `COLUNAS` (COD_PLANO=46 … CLASSIFICACAO_CLUSTER=63). **`_mapearLinha`**: lê as 18 colunas novas (necessário p/ preservá-las no full-row rewrite de edição). **`_construirLinhaDados`**: grava as 18 — SNAPSHOTS (COD_PLANO/PONTOS_VENDA/PONTOS_MOVEL/MES_COMPETENCIA) computados **idempotentemente** (só quando vazios — não recomputam em edição, preservando o snapshot original §5; em cadastro novo calculam via `getCodigoVeroPorPlanoCidade` + `getPontuacaoVenda`; MES por instalação §11.1); LIVE (FATOR_APLICADO, RECEITA_*, STATUS_*, FAIXA_RISCO etc.) apenas **preservadas** do estado atual (nunca gravadas pelo form — serão populadas pelo import do extrato/inadimplência nas Fases 7-8). **Segurança**: todos os call sites de escrita usam `array.length` (auto-adaptam a 64); zero hardcode de 46 no Code.js; preservação testada em node (9/9 — venda com backfill+import sobrevive a edição sem zerar nada; cadastro novo sem lixo). `node --check` OK; diff de prod sem drift antes do merge. **Pré-condição cumprida**: `fase3AddColunas` rodou (64 colunas existem) ANTES deste deploy — sem isso, `getRange(...,64)` quebraria. FAT/Q (código capturado desde 20/05) fica redundante com COD_PLANO/AU (canônico) mas inofensivo. **Pendente**: remover `_fase3Setup.js` do GAS (próximo push); ampliar cobertura de COD/PONTOS conforme dicionário/extratos crescem. |
| 21/05/2026 20:45 | (via Action) | **feat(financeiro): Fase 3 (Deploy 1/2) — one-shots de schema (colunas AU-BL) + backfill, SEM tocar Code.js.** Primeira metade da extensão de schema do `1 - Vendas` (§5). Deploy **aditivo e inerte**: adiciona só `_fase3Setup.js` (vai pro GAS), `Code.js`/`CONFIG` **intocados** (TOTAL_COLUNAS segue 46). 3 one-shots (rodar no editor na ordem): **`fase3AddColunas()`** — garante 64 colunas físicas + grava 18 headers na linha 2 (AU `COD_PLANO` … BL `CLASSIFICACAO_CLUSTER`), idempotente; **`fase3BackfillDryRun()`** — preview (conta quantas vendas resolveriam COD_PLANO/PONTOS_VENDA/PONTOS_MOVEL/MES_COMPETENCIA, sem gravar); **`fase3Backfill()`** — grava esses 4 campos nas vendas existentes (conservador: só escreve célula com valor calculado; preserva o que já houver). Lógica: COD via `getCodigoVeroPorPlanoCidade(plano,cidade)` (dicionário, cobertura parcial JF/Betim/Barbacena/Bauru); PONTOS via `getPontuacaoVenda(cod,seg)` (22 códigos do extrato); MES_COMPETENCIA = vintage por instalação (§11.1 — só status 3 + INSTAL → `yyyy-MM`). Escreve por índice explícito (47-50), não depende do CONFIG. `node --check` OK. **Deploy 2 (próximo)**: bump `TOTAL_COLUNAS=46→64` + CONFIG.COLUNAS AU-BL + `_construirLinhaDados` passa a gravar COD_PLANO/PONTOS/MES em vendas novas (hoje o código Vero é capturado em FAT/Q desde 20/05 — migra pra AU). **Ação Ricardo**: rodar fase3AddColunas → fase3BackfillDryRun (conferir números) → fase3Backfill; depois aviso e removo o `_fase3Setup.js`. |
| 21/05/2026 20:33 | (via Action) | **chore(financeiro): fixa file IDs dos JSONs no CONFIG + remove one-shot de setup.** Após `financeiroSetupFase2()` rodado no editor com sucesso (self-test 100%: 4279→bl70/mv40, 4470→bl90, 75 instalações→3★/2,6, receita R$286). Os file IDs resolvidos foram fixados em `CONFIG.PONTUACAO_JSON_FILE_ID = '1txC2mYqj0kh_L9O7s1_7gCR9hVv9t5gy'` e `CONFIG.CARTAS_META_JSON_FILE_ID = '1zkTm2bA6ClHITnY_VvCDlGUOzGXb-mRp'` (padrão de `TABELA_JSON_FILE_ID`/`CIDADES_JSON_FILE_ID` — não depende mais só da Script Property). `_financeiroJsonSetup.js` removido do projeto (convenção one-shot push→executar→deletar→push). Sem mudança funcional nos readers. |
| 21/05/2026 20:18 | (via Action) | **feat(financeiro): Fase 2 — fundação dos JSONs (pontuacao_planos + cartas_meta_pap) + readers cacheados.** Fundação do Módulo Financeiro (`ARCHITECTURE_FINANCEIRO.md` §4/§11.9). **(1) `pontuacao_planos.json` rev1**: 22 códigos do extrato (realizado fev/mar), 4 segs por código (observada + inferidas marcadas em `_prov`), móvel combo em **pontos** (10GB=25/20GB=40/30GB=55/60GB=85), vigência 04.05 com correção das linhas contaminadas (MUNDO FIBRA 750 = 95/93, não o 127,9 da tabela). Decisões Ricardo: vigência 04.05 c/ correção + escopo só extrato. **(2) `cartas_meta_pap.json` rev1 (maio)**: extraído do PDF `Carta_Meta_PAP MOBILE_maio_2026.pdf`. Tiers de estrela **por nº de instalações** (2★ até 49 / 3★ 50-249 / 4★ 250-569 / 5★ 570-899 / 6★ 900-1699 / Prime 1700+; fatores base 2,0/2,6/2,9/3,2/3,5/3,8 +0,4 adimplência). Móvel combo×fator, avulso flat. Regras reais (churn vol 0-90=100%/91-120=50%/121-150=40%/151-181=30%, HUB tol 5%, CNCL ±7,5%, etc). **(3) Readers em `Code.js`** (espelham `_getCodigosVero`, cache 600s, fallback por nome no Drive): `_getPontuacaoPlanos`/`getPontuacaoVenda(cod,seg)`→{pontos_bl,pontos_movel,produto_tipo}; `_getCartasMetaPap`/`getCartaDoMes(mes)`/`resolverEstrelaPorInstalacoes(inst,mes)`. `CONFIG.PONTUACAO_JSON_FILE_ID` + `CONFIG.CARTAS_META_JSON_FILE_ID`. **`.claspignore`** ganha os 2 JSONs + `planos_vero_codigos.json` (vivem no Drive, não no GAS). **São dead code** até serem fiados na gravação de venda (Fase 3) e no painel (Fase 9) — deploy sem efeito colateral. **One-shot `_financeiroJsonSetup.js`** (vai pro GAS): `financeiroSetupFase2()` pina os file IDs no Script Properties + roda self-test dos readers — **Ricardo roda UMA VEZ no editor, depois deletar o arquivo + novo push**. Validação: `node --check` OK; readers reproduzem o realizado do extrato em teste node (4279→R$286, 75 instalações→3★/2,6). **Pendências**: rodar `financeiroSetupFase2()` no editor; conferir `_prov.seg_inferidas` contra tabela limpa; ampliar pontuação além dos 22 códigos conforme novos extratos. |
| 21/05/2026 18:47 | (via Action) | **feat(vendas): Sprint Integridade — INV-12 (webhook nunca cria combo) + alerta de combo órfão no sino (§6.4).** Continuação da Fase 1. **(1) INV-12** (`doPost`, rota default do webhook BotConversa): antes de montar `dadosWebhook`, se `payload.produto` normaliza para combo (`_comboEhCombo_`), rebaixa para `"Fibra Alone"` e loga — o webhook não fornece Móvel, então combo viraria órfão; operador converte em combo depois pelo CRM (que cria o Móvel atômico). **(2) Alerta sino** (`detectarAlertasAtivos`, nova seção 4): varre `getVendasFunil()` (cache) × `_getVinculosVendasMap_()` e emite alerta `combo_orfao` (ícone ⛓️, atenção, `destino:'vinculosPendentes'`) para cada Fibra Combo em status operacional (`_statusExigeComboCompleto_`) SEM filha vinculada ativa; teto de 8 + linha "+N". Vigia os legados (o guard do deploy anterior já barra novos). Frontend intacto (sino renderiza genérico; `navegar('vinculosPendentes')` já existe — admin). `node --check` OK. **Pendências restantes Fase 1**: backfill final do `repararVinculosCombosOrfaos` (Ricardo roda no editor — `clasp run` indisponível) + triagem em Vínculos Pendentes; teste real na UI; métrica de saída (Vínculos Pendentes zerado por 30 dias). |
| 21/05/2026 18:40 | (via Action) | **feat(vendas): Sprint Integridade — guard server-side contra combo órfão em estado operacional (Fase 1 do Módulo Financeiro).** Primeira entrega da Fase 1 descrita em `ARCHITECTURE_FINANCEIRO.md` §6 (combo bem nascido). Novo guard central em `Code.js`: `_validarComboIntegridade_(produto, oldProduto, oldStatus, novoStatus, linha)` + helpers `_statusExigeComboCompleto_` e `_comboEhCombo_` (inseridos antes de `_validarTransicaoStatusServer_`). Rejeita com toast (decisão Ricardo: REJEITAR, não criar auto) quando uma **Fibra Combo** entra em estado operacional SEM Móvel vinculado ativo (INV-01) ou quando um produto vira **Combo** Alone→Combo já operacional (INV-03); cobre também **Móvel Combo** sem Fibra mãe (INV-02, dormant até existir caminho próprio). "Estado operacional" = `2- Aguardando Instalação`/`3 - Finalizada/Instalada`/`Pendencia Vero` (Fibra) e `2- Aguardando Entrega`/`3- Aguardando Retirada`/`4- Entregue`/`5 - Finalizado` (Móvel). Dispara só na **entrada nova** (não-op→op OU Alone→Combo) — combos legados já operacionais **não são re-bloqueados** em edições de outros campos (ficam pra Vínculos Pendentes + sino §6.4). Reutiliza `_getVinculosVendasMap_` (filhasPorMae/maePorFilha, já filtrados ATIVO) — mesma semântica do `comboMovelPendente`. Plugado em 3 portões: `moverLeadAguardando` (→2), `moverVendaFunil` (drag) e branch de edição do `salvarVenda` (com exceção quando o payload já traz `dados.movel.linha` = combo sendo completado). Cadastro novo de Fibra Combo já era atômico (rejeita/reverte) — intocado. Frontend não mudou (os 3 portões já exibem `r.mensagem` como toast, mesmo caminho do validador de status). Validação: `node --check` OK; teste node da matriz de decisão 9/9 (entrada órfã bloqueia, com móvel/mãe passa, legado op não re-bloqueia, Alone→Combo órfão bloqueia, destino não-operacional/Cancelado livre); diff de prod (`clasp pull` temp) sem drift em Code.js antes do push. **Pendências da Fase 1**: INV-12 (guard no `doPost`/webhook BotConversa), backfill final do `repararVinculosCombosOrfaos`, alerta no sino de combo órfão em status ≥2, e teste real na UI (não testável fora de produção). Resolveu também a decisão bloqueante §11.9 (fórmula `Σpontos×fator` confirmada por reverse-engineering do extrato de março; rev 4 do ARCHITECTURE_FINANCEIRO.md). |
| 21/05/2026 ~10:57 | (via Action) | **refactor(consultas): busca por contrato substitui busca por CPF (NG + Adapter).** Resolve o bug crônico de falso positivo em multi-contrato (caso ANA MARIA: parser pegava `1137470` HABILITADO de 2020 quando a venda real era `3052541` AGUARDANDO INSTALACAO de 2026). **Adapter** (`content-adapter.js`): substitui o pipeline `/clientes/datatables?cpf=` + `/contratos/cliente/{clienteId}` (3 chamadas, loop) por `GET /comercial/contratos/{contratoId}` (1 chamada, sem loop); agendamento usa `c.cliente.id` do próprio payload; HTTP 404/500 → `contrato_nao_encontrado`. **NG** (`content-ng.js` + mirror `cdn/content-ng.txt`): troca o termo de busca (CPF → contrato) — Wing reconhece como contrato e abre direto na aba "Contrato {id}" com painel "Contratos (1)" filtrado; parser DOM lê os mesmos seletores; busca vazia → token `contrato_nao_encontrado`; validação de formato `^\d{6,12}$` → `contrato_formato_invalido`. **JS.html**: `_consultarNGVenda`/`_consultarAdapterVenda` validam `v.contrato` (rejeitam venda sem contrato — status 1 — com toast humano cedo) em vez de CPF; hash do popup vira `contrato=`; título do modal mostra Contrato; `_categorizarErroConsulta` + `_mensagemErroHumana` ganham `contrato_nao_encontrado` e `contrato_formato_invalido` (mantido `cpf_nao_encontrado` por compat de log); auto-fallback NG↔Adapter passou a disparar também em `contrato_nao_encontrado`. **Code.js** (desvio necessário do prompt, que dizia "Code.js não muda"): `getVendasParaVarredura` passou a retornar `contrato` no objeto da venda — sem isso o Modo Varredura (que troca `_paginaAtual` por essa lista) quebraria com a nova validação; o filtro de elegibilidade segue por CPF (status 2/3 têm ambos). **manifest.json**: 2.4.0 → 2.5.0 (BKOs precisam recarregar a extensão — Task #30 pendente). **Caveat**: em multi-contrato AGUARDANDO INSTALACAO com agendamentos em datas diferentes, a heurística "primeiro item" do endpoint de atendimentos pode pegar o agendamento do outro contrato (limitação server-side: `idContrato` vem null no payload datatables). Edge case secundário. Validação: `node --check` nos 2 arquivos da extensão + no `<script>` do JS.html; `cdn/content-ng.txt` === `content-ng.js` (byte-idêntico); diff de prod sem drift antes do push. |
| 21/05/2026 ~02:53 | (via Action) | **feat(lista): move o indicador de funil para o topo da `Lista de Vendas`** (frontend; backend intacto). Ajuste pós-deploy anterior: a localização correta era a Lista de Vendas, não a Tratamento Leads. **Removido** o bloco `#leadsFunnel` de `#pageLeads` (e a chamada em `_renderizarLeads`); **adicionado** em `#pageLista` logo após a `.list-meta` ("N registros"), antes da `.lista-scroll` — fora da `.list-meta` de propósito (a regra `.list-meta span` tem especificidade maior e sobrescreveria a cor das bolinhas da legenda). CSS `.leads-funnel` virou `padding:8px 20px 10px; border-bottom:1px solid var(--border)` (alinhado à `.list-meta`). **Dados**: mesmo funil Quente/Morno/Frio via `getVendasLeads` (cache 300s, compartilhado com a Tratamento Leads) — novo `_carregarFunilLista()` conta Q/M/F (exclui `aguardando`) e popula via `_renderFunilLeads`; disparado em `navegar('lista')` (junto do `carregarVendas`) e no `recarregarLista` (handler de sucesso, refresca junto da sincronização ↻). Layout C inalterado (barra 2px dessaturada + legenda inline + tooltip CSS `etapa · N leads · P%`). ⚠️ O total da barra (soma Q+M+F do funil) é independente do "N registros" (total de vendas) — são métricas diferentes; a legenda deixa explícito. `node --check` OK; `#leadsFunnel` confirmado só em `#pageLista` e ausente em `#pageLeads`; diff de prod contra HEAD sem drift; markers confirmados em prod pós-Action. |
| 21/05/2026 ~02:27 | (via Action) | **feat(leads): indicador de funil discreto na página `Tratamento Leads`** (depois movido p/ Lista de Vendas em ~02:53 — ver linha acima). (frontend; backend intacto). Barra horizontal fina de **2px** segmentada (Quente/Morno/Frio, nessa ordem) logo abaixo do título, antes do kanban, com **cores dessaturadas hardcoded** (barra `#7a3830`/`#7a6128`/`#2e5670`; bolinhas da legenda `#a8453a`/`#a8843a`/`#3a6e8a`), legenda inline `● Quente N · Morno N · Frio N` (`justify-content:space-between`, 11px) e **tooltip CSS puro** no hover (acima do segmento, fundo `#0a0d12`, `etapa · N leads · P%`) + leve aumento de saturação. Cobre **só as 3 etapas de funil** — "Ag. Instalação" (4ª coluna) fica de fora; total e percentuais sobre Q+M+F. **`Index.html`**: bloco `#leadsFunnel` (markup) + regras CSS `.leads-funnel-*`/`.lf-*` (após `.leads-count`); container `flex-shrink:0` encaixa entre `.leads-toolbar` e `.leads-cols` sem espremer o kanban. **`JS.html`**: novo helper `_renderFunilLeads(q,m,f)` chamado em `_renderizarLeads()`, reusando as contagens já calculadas no `forEach` das colunas (sem 2ª passada nos dados, sem chamada extra ao backend). Caveat herdado: contagens saturam em 200/etapa (`getVendasLeads` `LIMITE=200`) — mesmo dado das colunas. `node --check` OK no `<script>`; IDs `lfSeg*`/`lfLeg*` batem entre HTML e JS; diff de prod conferido contra HEAD antes do push (sem drift); markers confirmados em prod pós-Action. |
| 21/05/2026 ~01:20 | (via Action) | **feat(leads-meta-ads): reformulação completa da página `LeadsMetaAds.html`** (frontend; backend intacto). Log em `CHANGELOG_REFORMA_PAINEIS.md`. **KPIs 4→5 em 2 faixas** (Novos hoje/Pendentes/Em negociação | Convertidos/Desqualificados c/ breakdown por motivo; TOTAL vira pill; tooltip receita projetada nego×0,4×R$313); todos client-side respeitando filtros (Novos hoje ignora período). **Filtros 3→6** em 2 linhas: Período (pills, default Mês), Estado (via DDD: Cobertura Vero/Fora/UF), Status, Campanha, Anúncio, Motivo + Limpar. **Ordenação por coluna** (asc/desc/default, ▲▼). **Exportação CSV** client-side (filtrado+ordenado, UTF-8 BOM, sep `;`). **Kanban** (toggle Lista|Kanban em localStorage, 4 colunas, drag-drop HTML5 nativo → `atualizarStatusLeadMetaAds`, bordas risco/conversão). **Lista repaginada** (wa.me, chip campanha colorido, chips anúncio/motivo, 📋 copiar telefone, bordas risco/conversão). **Auto-refresh 60s** (toggle, default on, persistido, só com página visível). **DDD_INFO** (cidade+uf+cobertura) substitui DDD_CIDADE; `inferirEstadoPorDDD`/`inferirCoberturaPorDDD` novos. Performance: tudo client-side; backend só no load + mutações. `node --check` OK no `<script>`, sem refs órfãs; markers confirmados em prod. **TODO:** CSV não traz data_venda/id_contrato (getLeadsMetaAds lê só A-L). |
| 21/05/2026 ~00:50 | (via Action) | **feat(meta-ads): pós-reforma — alerta 7 multi-conta + envio on-demand + dropdown dinâmico de Campanha.** Log em `CHANGELOG_REFORMA_PAINEIS.md`. **(1) Alerta 7 multi-conta** (`getResumoTrafegoHoje`): passou a **agregar as 2 contas** (`_getContasMetaAds_()`) — soma gasto/impr/alcance/cliques/budget, junta campanhas ativas, recalcula CTR/CPC sobre totais; `_somarBudgetAdSetsAtivos_(id)`/`_listarCampanhasAtivas_(id)` parametrizados; +`meta.contas` (shape do JSON intacto → n8n `rZi4ZpL1Sj8tvcMz` segue igual). Antes lia só a Vero 01 (pausada) → alerta vinha zerado. Validado: endpoint `?action=resumo_trafego` retorna ~R$123 (Vero 02). **(2) `enviarResumoTrafegoAgora()`** — dispara o alerta 7 sob demanda no DM do Ricardo via `enviarParaGrupoWhatsApp(msg,'ricardo')`. **(3) Dropdown dinâmico de Campanha** (`LeadsMetaAds.html` + `MetaAdsAPI.js`): `getCampanhasAtivasParaDropdown()` lê campanhas ACTIVE de todas as contas (`_listarCampanhasAtivas_`), mapeia pro rótulo CRM via aba **"Mapeamento Campanhas Meta"** (auto-criada+seed; `_getMapaCampanhasMeta_`/`_mapearCampanhaMetaParaCRM_`, match "contém"), agrupa + sentinela "Orgânico / Indicação", **cache 15min**, falha→`ok:false`+lista mínima. Frontend carrega no `abrirModalManual` (loading→popula `#mlCampanha`+`CRIATIVOS_POR_CAMPANHA`; erro→"(sem conexão Meta — recarregue)"+retry, sem fallback silencioso); removidos os `<option>` hardcoded. **Nota:** `_somarBudgetAdSetsAtivos_` só soma adset budget → "previsto/dia" fica R$0 em campanhas **CBO** (budget na campanha) — pendência cosmética. `node --check` OK; markers confirmados em prod. |
| 21/05/2026 00:12 | (via Action) | **feat(meta-ads): Fase 4 da reforma — qualidade de dados (validação proativa + migração).** Spec: `meta-ads-vero/auditoria_paineis_meta_ads.md` §5/§6; log em `CHANGELOG_REFORMA_PAINEIS.md`. Encerra a reforma (Fases 1–4). **4.2 Validação proativa** (`MetaAdsAPI.js`, deployada): constante `CAMPANHAS_PAUSADAS_META` (`A - JF Principal`, `B - Órbita JF`, `C - BH Metro`, `D - Conversas JF + Órbita`; **VENDAS de fora** — campanha ativa) + helper `_campanhaPausadaMeta_`. `registrarLeadMetaAds` (webhook + manual): lead novo cujo `utm_campaign` é pausado → registra em "Reconciliação Pendente" (`lead_campanha_pausada`), **não-bloqueante**, sem alterar o lead — pega leads de fluxos BotConversa antigos (Vero! 1/2/3). Form manual já protegido pelo dropdown (Fase 1). **4.1 Migração** (one-shot `_metaFase4Setup.js`, **rodar no editor, remover após validar**): `verificarLeadsParaMigrarFase4()` (dry-run, só lista) + `migrarLeadsHistoricosCampanhasPausadas()` (backup da aba `Leads Meta Ads (bkp …)` via `copyTo` + re-tag `utm_campaign` de A/B/C/D criados **≥ 17/05/2026** → `AG - Vero Fibra Amplo`; loga total + diff). Diff em `meta-ads-vero/migracao_leads_historicos_diff.md` (preencher pós-execução). Validação: `node --check` em `MetaAdsAPI.js` e `_metaFase4Setup.js`; markers confirmados em prod pós-Action. **Pendência transversal**: alerta 7 (`getResumoTrafegoHoje`) ainda lê só a conta antiga. |
| 21/05/2026 00:00 | (via Action) | **feat(meta-ads): Fase 3 da reforma — automações Vendas→Leads (trigger + reconciliação).** Spec: `meta-ads-vero/auditoria_paineis_meta_ads.md` §4/§5; log em `CHANGELOG_REFORMA_PAINEIS.md`. **Direção única Vendas→Leads** (nunca cria venda a partir do lead). **3.1 Trigger** (`MetaAdsAPI.js` + `Code.js`): `vincularVendaLeadMetaAds(telefone, idContrato, dataVenda)` reescrito (antes `(telefone)` e **órfão** — nunca chamado): marca lead `Converteu` + grava rastreabilidade em cols **M (`data_venda`) / N (`id_contrato`)** do lead (`_registrarRastreabilidadeVenda_`, cria headers se faltarem); match por telefone (últimos 11 díg.), janela 30d, idempotente; **retorno tri-estado** (>0 vinculou · 0 lead existe mas já finalizado/fora da janela · null nenhum lead → miss). Hook `_reconciliarVendaMetaAdsAposSave_(linha)` (lê venda, confere canal=META ADS, telefone WHATS→TEL, contrato, data) chamado **fora do lock, não-bloqueante** nos 3 caminhos de transição: `salvarVenda` (painel inline, só na transição p/ status 2 ou 3), `moverLeadAguardando`, `moverVendaFunil` (drag). Sem lead (`null`) → aba **"Reconciliação Pendente"** (`venda_sem_lead`). **3.2 Reconciliação noturna**: `reconciliarMetaAdsNoturno()` (cron 23h) cruza vendas META ADS status 2/3 × leads "Converteu" por telefone, faz catch-up de vínculo e lista inconsistências (`venda_sem_lead` / `lead_sem_venda`), reescrevendo a aba "Reconciliação Pendente" (auto-criada por `_getAbaReconciliacaoMeta_`). **Setup pós-deploy (Ricardo no editor)**: rodar UMA VEZ `configurarTriggerReconciliacaoMetaAds()` (instala o trigger 23h; idempotente; `removerTriggerReconciliacaoMetaAds()` desliga). Validação: `node --check` em `MetaAdsAPI.js` e `Code.js`; markers confirmados em prod pós-Action. **NÃO** implementado (decisão da spec): criação automática de venda a partir do lead. |
| 20/05/2026 23:45 | (via Action) | **feat(meta-ads): Fase 2 multi-conta — Dashboard executivo + Painel Ads reescrito.** Spec: `meta-ads-vero/auditoria_paineis_meta_ads.md` §3.2; log em `CHANGELOG_REFORMA_PAINEIS.md`. Painéis passam a **agregar as 2 contas Meta** (`act_2839032026433564` Vero 02 agência + `act_971543562231015` Vero 01 antiga) — token Admin_API_Renata lê ambas (confirmado via `check_account.js`). **2.0 (`MetaAdsAPI.js`)**: `CFG_META` ganha `AD_ACCOUNT_IDS` (agência primeiro) + `AD_ACCOUNT_NOMES`; `AD_ACCOUNT_ID` (primária) intocada — segue no layer de ações e em `getResumoTrafegoHoje`. Helpers `_getContasMetaAds_`/`_nomeContaMeta_`; `_mapaStatusCampanhas_(accountId)` parametrizado. `getPainelAdsData` itera contas, agrega Gasto/Leads/Impr/Cliques, tagueia cada campanha com `conta`, ordena ativas→pausadas; conta que falha é pulada (`contasComErro`). **2.2 (`PainelAds.html` + backend)**: removidos os 4 cards quebrados de Inteligência Comercial (front + `_buildInteligenciaComercialFromLeads_` + `_paIntelligenceCard` + card de ajuda — deletados); campanhas **ativas por padrão** + pausadas em `<details>` "Ver pausadas (N)"; tag de conta no card (`◈ Vero 02`); nova seção 🔔 Alertas operacionais (`_alertasOperacionaisLeads_` — leads sem triagem +24h). **2.1 (`Dashboard.html` + backend)**: aba "Meta Ads ✦" reescrita pra matriz **4 KPIs (Gasto/Leads/Vendas/CPA) × 3 janelas (Hoje/Semana 7d/Mês MTD)** + gráfico spend×dia, via novo `getDashboardMetaAdsExecutivo()` (Gasto agrega contas por insights `time_increment=1`; Leads/Vendas do CRM via `_crmLeadsVendasPorJanela_`; CPA=gasto/vendas). Removidos: narrativa de IA, ranking, cards melhor/pior. `getRelatorioAdsHistorico` + trigger 07h seguem gravando a aba `Diagnostico Ads Diario`, mas não são mais exibidos. Validação: `node --check` no backend + `<script>` de ambos os HTML; markers confirmados em prod pós-Action. **⚠️ Pendência aberta**: `getResumoTrafegoHoje` (`?action=resumo_trafego` → alerta 7 tráfego pago, n8n `rZi4ZpL1Sj8tvcMz`) ainda lê **só** a conta antiga — operação migrou pra Vero 02; é contrato n8n, mudar exige confirmação. |
| 20/05/2026 23:28 | (via Action) | **feat(meta-ads): Fase 2.3 da reforma — coluna Cidade auto via DDD no `Leads Meta Ads`.** Spec: `meta-ads-vero/auditoria_paineis_meta_ads.md` §3.2; log em `CHANGELOG_REFORMA_PAINEIS.md`. A coluna **Cidade** (antes sempre `—`, pois o webhook BotConversa manda `cidade: ""`) passa a sugerir a cidade pelo DDD do telefone, editável inline pelo time. **Frontend** (`LeadsMetaAds.html`): novo `inferirCidadePorDDD(telefone)` + mapa `DDD_CIDADE` (DDDs do SE — MG 31-38, RJ 21/22/24, ES 27/28, SP 11-19 → cidade principal do DDD; normaliza telefone tirando DDI 55, exige 10-11 dígitos; DDD fora da cobertura não sugere). Célula renderiza: cidade real (clicável) · sugestão **faded itálico** `≈ Cidade` quando vazia com DDD conhecido · `—` clicável quando sem DDD. Edição inline (`_lmaEditarCidade`/`_lmaSalvarCidade`/`_lmaRenderCidadeCell`; Enter salva, Esc cancela, blur salva; não grava se não mudou). **Backend** (`MetaAdsAPI.js`): novo `atualizarCidadeLeadMetaAds(linha, cidade)` grava col D da aba "Leads Meta Ads" (espelha `atualizarStatusLeadMetaAds`). **Escopo**: sugestão é display/edição manual — **não** auto-persiste no webhook (continua chegando `cidade: ""`). Validação: `node --check` (backend + `<script>` do HTML) + teste node do inferidor em 9 formatos de telefone; markers confirmados em prod via `clasp pull` pós-Action. **Pendente da Fase 2**: telas multi-conta (Dashboard executivo + Painel Ads reescrito) — vão **agregar `act_971543562231015` + `act_2839032026433564`** (token Admin_API_Renata lê as duas, confirmado via `check_account.js`). |
| 20/05/2026 23:16 | (via Action) | **feat(meta-ads): Fase 1 da reforma dos painéis Meta Ads (quick wins).** Spec: `meta-ads-vero/auditoria_paineis_meta_ads.md`; log detalhado em `CHANGELOG_REFORMA_PAINEIS.md`. (1) **Dropdown manual de `Leads Meta Ads`** (`LeadsMetaAds.html`): removidas as campanhas pausadas desde 30/04 (`A - JF Principal`, `B - Órbita JF`, `C - BH Metro`) do `select#mlCampanha` e do mapa `CRIATIVOS_POR_CAMPANHA`; adicionada `AG - Vero Fibra Amplo` (única ativa via agência) com criativos `P2 (cópia)/P2 (Andromeda)/Indefinido`. (2) **Narrativas de IA** (`MetaAdsAPI.js`): removida a linha de contexto que nomeava A/B/C hardcoded nos 2 builders de prompt (`_buildDiagnosisPrompt_` do botão ✦ Diagnosticar e `_buildDiagnosisPromptResumo_` do relatório diário 07h → Dashboard "Meta Ads ✦"); adicionado filtro `spend>0` na seção de dados do diagnóstico longo (o resumo já filtrava). Causa raiz: o contexto afirmava que as campanhas eram A/B/C (pausadas), então a IA as citava como ativas mesmo sem dados. Só corrige geração daqui pra frente — narrativas já gravadas (18/19 maio) ficam como histórico. (3) **Badge "PAUSADA" no Painel Ads**: novo helper `_mapaStatusCampanhas_()` (busca `campaign_id→effective_status` via `/campaigns`, defensivo retorna `{}` em falha); `getPainelAdsData` marca `status:'pausada'` quando `effective_status!=='ACTIVE'` — pausada não gera alerta nem entra na fila de decisão; `_paCampCard` (`PainelAds.html`) renderiza badge "PAUSADA" (classe `dim`) + tom de card `c-dim` (cinza, opacity .62) em vez de "Normal"/verde. (4) **Janela do Painel Ads** = últimos 7 dias incluindo hoje: default `3d`→`7d` no backend (`getPainelAdsData`) e no frontend (`paAtualPeriodo`, `paInit`, classe `ativo` no botão "7 dias"; botão "3 dias" mantido). Validação: `node --check` OK; markers confirmados em prod via `clasp pull` pós-Action. **⚠️ Caveat:** painel lê `act_971543562231015` (conta antiga, campanhas pausadas); a operação ativa da agência está em `act_2839032026433564`, que o painel ainda não lê — Fase 2 depende dessa decisão. |
| 20/05/2026 19:52 | (via Action) | **feat(venda): captura forward-only do código Vero do plano na coluna FAT (Q).** Ao cadastrar **venda nova** (só cadastro, sem backfill), `salvarVenda` resolve o código numérico do plano via reverse-lookup `getCodigoVeroPorPlanoCidade(plano, cidade)` (em `Code.js`) e grava na coluna **FAT (Q)** — liberada desde v562. Reverse-lookup: acha a coleta de `planos_vero_codigos.json` cuja `contexto.cidade` bate com a cidade da venda, casa `nome_crm_match` (núcleo, sem sufixo `\| R$`), e em empate prefere o código **base** (sem addon MESH/ROKU) de maior confiança. A direção nome→código é ambígua (mesmo plano tem código diferente por região/addon), por isso depende da cidade. **Cobertura PARCIAL**: só cidades já coletadas no dicionário (Betim, Juiz de Fora, Barbacena, Bauru) — JF (mercado principal) resolve; demais ficam em branco e crescem conforme o Cowork coleta mais. Sem match → `''`. Hook só no branch de cadastro novo do `salvarVenda` (~linha 4737); **não** toca o caminho de edição nem faz regresso. FAT é exposta como `fat` ao frontend mas não é exibida desde v562, então guardar o código ali não tem efeito colateral visual. Validado por simulação node contra o JSON real (JF `VERO MAIS 550MB + MÓVEL 20GB` → `4624`, batendo com o relatório SNIPER). |
| 20/05/2026 19:46 | (via Action) | **feat(cruzamento): plano entra na sobrescrita via dicionário de códigos Vero.** Fecha o item que ficou fora do v723 (plano). Reusa a infra de códigos do Cowork (`planos_vero_codigos.json` + `_getCodigosVero`, commit `75b3d8a`). Para cada contrato casado, o cruzamento extrai o código numérico do `NOME_PLANO_ATUAL` da Vero (`4624 - ...`; Móvel vem `VERO 4390 - ...`), resolve via dicionário pro `nome_crm` canônico (col 0 do `planos_vero.json`) e propõe corrigir a coluna PLANO — **só confiança alta/media**, comparando o **núcleo** do nome (ignora sufixo `\| R$ ...`), pelo mesmo painel **preview+confirm** (nada grava sem clique). Direção código→nome é determinística (1 código → 1 nome), sem a ambiguidade por cidade do sentido inverso; `nome_crm_match` null ou código fora do dicionário = pula. **Code.js**: `getContratosParaCruzamento` devolve `plano` atual + mapa flat `{código:{nome,conf}}` (`_getCodigosVeroMapaFlat_`); branch PLANO em `aplicarCorrecaoVero`. **CruzamentoAutoAPI.js**: `_cruzExtrairCodigoPlano_` + `_cruzPlanoCore_`; captura `planoCodigo` por contrato nas 3 abas (vendas/instalações `NOME_PLANO_ATUAL`, móvel `PLANO`); correção de plano no caminho Gmail. **Cruzamento.html**: `_cruzCodigosMap` (vem do `getContratosParaCruzamento`), mesma lógica no caminho manual, confiança visível no diff. Validação: `node --check` nos 3 arquivos. |
| 20/05/2026 17:27 | v723 (+Action) | **feat(cruzamento): sobrescrita de dados Vero (planilha = fonte da verdade) com preview+confirm + resultado persistido no navegador.** Página Cruzamento Vero ganhou duas capacidades. **(1) Sobrescrita de dados**: o cruzamento (antes read-only — só marcava 🟢/🟡 em `VERO_STATUS`) agora também propõe corrigir os dados do CRM a partir do relatório Vero. Decisões (Ricardo): match **só por contrato**, **status preservado**, **não cria linha**. Campos: `COD_CLI` ← COD_CLIENTE/IDCLIENTE · `INSTAL` ← DATA_HABILITAÇÃO/DATAHABILITACAO · `VALOR` ← VALOR_CONTRATO/VALOR_CONTRATO_MOVEL · `CIDADE` ← CIDADE_HIERARQUIA (+ relookup SISTEMA/SEGMENTAÇÃO) · `DATA_ATIV` ← DATA_CADASTRO · `OBSERVAÇÃO` ← cancelamento (DATA+TIPO+MOTIVO, append idempotente). Só sobrescreve campo com valor na planilha **e** que difere do CRM (nunca apaga com célula vazia). **Preview+confirm obrigatório**: painel de diff (`contrato·campo·atual→novo`) + botão "Aplicar correções (N)" — nada grava sem clique. **Plano fora de escopo** (formato Vero `4624 - ...` incompatível com o do CRM `nome \| R$ XX,XX`; quebra lookup de valor/combos — vai virar dicionário determinístico `código Vero → plano` em sessão própria). **Backend** (`Code.js`): `getContratosParaCruzamento` estendido (retorna codCli/cidade/observacao/valor atuais — aditivo); nova `aplicarCorrecaoVero(correcoes)` (grava só células mapeadas, normaliza datas DD/MM/YYYY, VALOR via `_normalizarValorParaNumero_`, LockService, `_limparCache`). **(2) Resultado persistido no navegador**: localStorage `dharmapro_cruzamento_v1` — kanban + diff sobrevivem a F5/reabertura (selo "resultado de DD/MM HH:MM (origem)"); cada import substitui; "Limpar" zera. O **caminho automático (Gmail)** passou a desenhar o kanban + diff também: `buscarEImportarVero` (`CruzamentoAutoAPI.js`) agora retorna os dados detalhados + correções propostas (sem aplicar — só o 🟢/🟡 segue automático). `JS.html`: hidratação no `navegar('cruzamento')`. Validação: `node --check` nos 3 arquivos + clasp diff de prod (só DEPLOY_DATE divergia). Teste funcional fino fica com o Ricardo (importar relatório no CRM e conferir o painel antes de Aplicar). |
| 20/05/2026 ~16:35 | (via Action) | **fix(perms+varredura): libera "Consultar instalações" pra todos + completa UI de permissões + documenta a Action de deploy.** (1) **Botão 🔍 Consultar instalações (Modo Varredura)** na topbar global passou a ficar disponível para **todos os perfis** — removido o guard `AppState.get('perfil') !== 'admin'` em `_varreduraAbrir` (`JS.html`). O botão já era global e o backend `getVendasParaVarredura` nunca teve gating; só o `_varreduraAbrir` barrava não-admin com toast. (2) **`Usuarios.html`** — `US_MENU_LABELS` e `US_TODOS_MENUS` ganharam `viabilidade` e `vinculosPendentes` (estavam faltando): a tela "Permissões por Perfil" não lista(va) esses dois, então um "salvar" por ali **removia** ambos do `PERFIS_MENUS_JSON` (foi o que derrubou a Viabilidade do admin em 20/05). Agora aparecem como checkbox e não são mais estripados. (3) **`CLAUDE.md`** — nova subseção "Deploy automático (GitHub Action)" documenta `.github/workflows/deploy.yml` (push na main → clasp push + reescreve DEPLOY_DATE + limpa versões >190 → clasp deploy); `clasp deploy` manual é redundante. Primeiro deploy desta sessão feito 100% via Action (sem clasp manual). |
| 20/05/2026 15:32 | v719 | **feat(combos): aba "Vínculos Pendentes" — triagem manual de combos órfãos (admin).** Complementa `repararVinculosCombosOrfaos` (que só religa o caso de 1 candidato): nova página admin lista as Fibra Combos sem Móvel vinculado que o reparo automático deixa de fora (os "ambíguos" com 2+ candidatos e os "sem par"). **Backend** (`Code.js`): `getVinculosPendentesHtml()` (injeta `VinculosPendentes.html`), `getVinculosPendentes(adminUsuario)` (mesma heurística de pareamento da passagem 2 do reparo — CPF/WhatsApp, janela ±7d — mas só lê, agrupando em `comCandidatos` e `semPar`; exclui já-OK e ignorados), `aprovarVinculoCombo(adminUsuario, maeLinha, filhaLinha)` (valida produtos Fibra/Móvel, impede reusar Móvel já vinculado a outra Fibra, chama `_registrarVinculoVenda_` + `_limparCache`), `ignorarVinculoPendente(adminUsuario, maeLinha)` (marca revisado-sem-combo, persiste em Script Property `VINCULOS_PENDENTES_IGNORADOS` via `_getVinculosIgnorados_`/`_setVinculoIgnorado_`). Todas gateadas por `_assertAdmin_`. **Frontend**: `VinculosPendentes.html` (página injetada self-contained, padrão Usuarios/Viabilidade — 2 seções de cards, radio pra escolher o Móvel candidato, botões Aprovar/Ignorar, toast, `↻ Atualizar`; `_vpAdmin` via `sessionStorage.crm_usuario`). **Fiação**: `Index.html` (item de menu `menuVinculosPendentes` sob Operacional, ícone `⧉` monocromático; page div `pageVinculosPendentes`), `JS.html` (`vinculosPendentes` em `_menusPermitidos` + `_menuMap` + branch em `navegar` que injeta e chama `vinculosPendentesInit`), `Config.js` (`vinculosPendentes` no perfil admin de PERFIS_MENUS). **Setup pós-deploy (já executado em 20/05)**: a `PERFIS_MENUS_JSON` existia e sombreava o Config.js, então o item não aparecia; rodado one-shot `configurarMenuVinculosPendentes` (sincroniza `admin` do JSON com o Config.js — restaurou viabilidade + adicionou vinculosPendentes) + logout/login. O one-shot ficou num `_vinculosPendentesSetup.js` temporário (push→executar→deletar). A correção definitiva pra não reincidir veio no deploy seguinte (UI de permissões completa — ver abaixo). |
| 20/05/2026 15:15 | v717 | **fix(combos): `repararVinculosCombosOrfaos()` movida de `_arquivo.js` para `Code.js` — agora permanente no GAS.** Sintoma: vendas perdiam o vínculo de combo na aba `Vinculos Vendas` e a função de reparo "sumiu" do editor. Causa raiz: no v513 (08/05) a função foi movida para `_arquivo.js` junto com as demais one-shots `reparar*`, mas `_arquivo.js` está no `.claspignore` — nunca foi enviada ao GAS via `clasp push`. Como o problema reincide e o Ricardo precisa do reparo disponível sempre, a função foi promovida para `Code.js` (sem `_` no nome → aparece no dropdown do editor) como **exceção permanente** à convenção `reparar* → _arquivo.js` (documentada na seção "Regras Operacionais" e em comentário na própria função — não mover de volta). Sem mudança de comportamento da função: 2 passagens (1ª arquiva duplicatas ATIVO em `Vinculos Vendas`, no máx. 1 ativa por mãe; 2ª religa Fibra Combos órfãos ao Móvel por CPF/WhatsApp em janela ±7d, só quando há exatamente 1 candidato — ambíguos e sem-par ficam só no log). Removida do `_arquivo.js` (deixado ponteiro). Reparo dos vínculos atuais: rodar `repararVinculosCombosOrfaos` no editor (`clasp run` indisponível — projeto não está deployado como API executable). |
| 20/05/2026 11:29 | v710 | **feat(funil): hot working set — update fino do board (fórmula Fase 5b) + ajustes do painel lateral (Dir.C).** O Funil (board de instalações) tinha o mesmo padrão da Lista pré-5b: `getVendasFunil` cacheia em `funil_v2`, mas `moverVendaFunil` e os saves chamavam `_limparCache()` invalidando tudo → toda movimentação/save reconstruía o board (~7s). Aplicada a mesma fórmula. **Code.js**: `_mapearLinhaFunil_` (extraído de `getVendasFunil`, reusado — comportamento idêntico); `_qualificaParaFunil_` (replica o filtro: status ∈ {2- Aguardando Instalação, 3 - Finalizada/Instalada, Pendencia Vero}; se status 3, instal no mês/ano atual); `_atualizarVendaNoFunilCache_` (update fino — remove a entrada antiga do array flat `funil_v2` e readiciona se ainda qualifica; cobre mudança de coluna e saída do board; fallback invalida `funil_v2`); `_limparCacheFunil_`. `_atualizarVendaNoCache_` agora **também** chama `_atualizarVendaNoFunilCache_` → todos os call sites da Fase 5b mantêm o board quente sem mudança. `_limparCacheSemLista` parou de invalidar `funil_v2`. `moverVendaFunil` + `moverLeadAguardando` trocaram `_limparCache()` por `_limparCacheSemLista()` + `_atualizarVendaNoCache_(linha)`. TTL `funil_v2` 300→1800. **JS.html**: sessionStorage do board (`_funilCacheSalvarSS/CarregarSS/LimparSS`, chave `dharmapro_funil_v1`, TTL 120s) com stale-while-revalidate em `carregarFunil` (F5/troca de aba instantâneos); drag persiste no SS; sino de alertas pré-aquece o SS. **Validado** por `_testFunilSaveQuente`: MISS 7301ms → update fino 373ms → **reload pós-mudança 49ms** (era ~7s; ≈150×), board consistente (36 mantidos), venda alvo preservada. Telemetria `counter_funil_fine_update[_fallback]`. **Junto neste deploy** (Cowork/Dir.C, frontend painel lateral): ajustes pós-redesenho v7 — `painel-acoes` compacto, botão WhatsApp removido da row principal, "Duplicar para Móvel" em row dedicada (`pBtnDuplicarMovelRow`, controlada por wrapper de `mostrarPainel`), faixa de status com overflow/ellipsis, collapsibles com min-width/peso. (O JS do painel já estava na main commitado; o `Index.html` correspondente estava pendente de subir e foi reconciliado aqui.) `_perfListaSmokeTests.js` ganhou `_testFunilSaveQuente` + `_testTelemetriaFunil`. |
| 20/05/2026 ~07:00 | v705–v709 | **feat(lista): redesenho do painel lateral v7 + faixa de status + fix de valor (Cowork/Dir. A/C).** Faixa de status no topo do card, status por plano, botões NG/AD nas ações, hero com plano em destaque, seções collapsibles no painel; `_formatarValorBR` passou a tratar Number nativo do JS (`112.9` → `R$ 112,90`). Commits `fbce436`, `4ed0fd4`, `a8c1429`. |
| 19/05/2026 22:40 | v702 | **feat(lista): botão ↻ Sincronizar com stale-while-revalidate.** O ↻ (`recarregarLista` em `JS.html`) zerava o cache local e travava a tela num spinner branco por ~7s (Lite sem cache faz pre-scan completo de ~3958 linhas) antes de qualquer dado aparecer. Agora, quando já há dados na tela: re-renderiza o cache atual imediatamente (stale) com badge `⟳ Sincronizando…`, limpa o cache do servidor e busca os 500 frescos em background via novo `_revalidarListaFresh()` — quando chegam, troca pelo fresh + badge volta pra `Agora`. A tela **nunca fica em branco** se já havia dados; o cache velho continua respondendo a paginação/filtro durante a revalidação. Sem cache (1ª carga) cai no spinner normal. 3 caminhos de fallback (falha no `limparCacheCompleto`, falha na revalidação, sem cache) degradam pro `carregarVendas` pipeline antigo. Novos helpers: `_revalidarListaFresh()` (busca 500 sem spinner), `_setBadgeSincronizando()` (badge transitório). Trade-off: o fresh vem via Full direto (~41s) em vez de Lite-primeiro (~7s) — evita downgrade visual 500→50→500; o ganho é a tela não travar. Mudança só de frontend; validação é visual no CRM. |
| 19/05/2026 22:25 | v701 | **chore(deploy): promove main (Fase 5b + alertas 5/8) — DEPLOY_DATE 22:25.** Redeploy administrativo do HEAD da main (commit `d871c35`) consolidando a Fase 5b (update fino do cache da Lista) com os alertas 5/8 da agência, ambos já no head. Sem mudança de código vs. estado pushado. |
| 19/05/2026 ~19:15 | v696–v700 | **feat(alerta5 + alerta8): digest de leads Meta pra agência.** Alerta 5 ganhou contador inline de leads do dia (#N) e passou a replicar pro grupo da agência (default + agência); depois revertido pra só default. Alerta 8 novo: endpoint público `?action=leads_meta_hoje` + `getResumoLeadsMetaHoje` para digest 12h/19h da agência (`AlertasGrupo.js`, roteamento no `doGet`). Deployado junto com a Fase 5b (que estava no head). |
| 19/05/2026 ~19:00 | (head) | **perf(lista) Fase 5b — hot working set (update fino do cache).** Substitui invalidação total do cache da Lista por UPDATE/INSERT cirúrgico por linha (`_atualizarVendaNoCache_`), via `_limparCacheSemLista()` em `salvarVenda`/`criarVendaMovelVinculada` e nos call sites de campos/PAP/Adapter/NG. TTL do cache `lista_v4` 5min→30min. Frontend: badge "Há X min" no header da Lista + helper de update fino local. Telemetria HIT/MISS via Script Properties. Validado por `_testSaveQuente` (save→reload 609ms vs ~7s antes). Doc: `PERFORMANCE_LISTA_VENDAS_FASE5B_V2.md`. Deployado de carona com v696-700. |
| 19/05/2026 13:27 | v694 | **perf(lista-vendas): pipeline Lite→Full + cache vínculos + sessionStorage + stub BotConversa sync.** Origem: Lista de Vendas levava ~45s para carregar. Diagnóstico identificou `sincronizarTagsBotConversa` (loop de 100 chamadas HTTP em série + setValues por linha + LockService a cada 30min invalidando o cache local) como maior culpado; gargalos secundários no formatador de datas e em `_getVinculosVendasMap_` sem cache. 5 fases aplicadas (Fase 6/Supabase descartada). **F1**: `sincronizarTagsBotConversa(forcar)` reduzido a stub retornando `{sucesso:true, atualizados:0, skip:true}` (~140 linhas de corpo removidas); campos `bcTags`/`bcStatus` saem do payload em `_mapearLinhaLista`, `_mapearLinha`, `_construirLinhaDados` e default da venda vazia; chamada `google.script.run.sincronizarTagsBotConversa(false)` removida do `pageLista`; badge `vi-bc-tags`/`vi-bc-status` removido do card e CSS limpo. **Pendência manual**: Ricardo deve limpar valores das colunas AN (BC_TAGS) e AO (BC_STATUS) na aba `1 - Vendas` (clique direito → Limpar valores) — não excluir as colunas, `CONFIG.COLUNAS` ainda referencia. Helpers `_bcEnviarFluxo`, `_bcSubscriberByPhone`, `enviarMensagemBotConversa` ficam ativos (botão no card pra disparar fluxo pro cliente). **F2**: `_getVinculosVendasMap_` agora consulta cache chunked (`CONFIG.CACHE_PREFIX + 'vinculos_map_v1'`, TTL 300s) antes do Sheets; novo helper `_limparCacheVinculosVendas_()` chamado por `_limparCacheListaV3` e `_registrarVinculoVenda_`. **F3**: sessionStorage `dharmapro_lista_v1` TTL 120s no frontend (`_listaCacheSalvarSS/CarregarSS/LimparSS`); `pageLista` tenta SS antes do GAS; F5 / re-abertura na mesma sessão renderiza em <200ms. **F4**: helpers `_fmtDataBR(d)` e `_fmtDataHoraBR(d)` puros JS substituem `Utilities.formatDate(..., tz, 'dd/MM/yyyy')` em `_mapearLinhaLista` (5 chamadas por linha × 500 linhas). **F5**: novo `getVendasPaginadasLite(limite, offset)` (sem cache, sem decorações pesadas) reutiliza `_preScanColuna`, `_getVinculosVendasMap_`, `_lerBlocos`, `_mapearLinhaLista`, `_decorarVendaComVinculos_`; `carregarVendas` no path MISS agora faz pipeline `Lite(50, 0)` → render imediato → `getVendasPaginadas(1, '', {limite:500})` em background popular cache backend+local; fallback automático pra Full se Lite falhar. **Smoke tests validados** (Logger.log no editor após push): `_testLite` 7173ms (50 itens, totalGeral=3952), `_testFull` MISS 40896ms (esperado 10-15s — handoff foi otimista, ganho real vs ~45s ficou ~10% absoluto), `_testFullCacheHit` 520ms ✓, `_testStub` `{skip:true}` ✓, `_testVinculos` MISS 1756ms / HIT 164ms (relação 10×). **Conclusão**: ganho percebido pelo usuário vem do primeiro paint Lite (~7s vs ~45s, 6×) e do retorno cache HIT (~500ms, 87×); F5 sessionStorage <200ms estimado (não testável no editor). Sem regressões em datas, combos agrupados ou stub BotConversa. Helper `_perfListaSmokeTests.js` removido no push seguinte. |
| 18/05/2026 16:10 | v677 | **fix(health): widget de conexões fica verde em qualquer máquina (bridge cross-frame + multi extension ID).** Sintoma: a BKO Joysse via 3 dots vermelhos apesar de SSO/VPN/NG/Adapter funcionando; os logs mostravam o bridge recebendo a resposta correta do background (`{ok:true, vpn:'ok', ng:'logado', adapter:'Logado'}`) mas o widget ignorava. Duas causas em camada: (1) a Via A (`chrome.runtime.sendMessage` direto) usa `_healthExtensionId` que o backend devolvia singular — mas extensões "unpacked" geram ID por path local, então o ID do Ricardo (`mikdfeacogcdcamoekipafammdfhlmcb`) ≠ ID da Joysse (`bocahgafjihhbojfeeikafglbonpmdff`); cada máquina só falava com a extensão da outra via fallback. (2) O bridge atendia a request num frame irmão/parent do iframe onde o CRM realmente rodava; a resposta era despachada no `document` errado e o `postMessage` de retorno era dropado pelo wrapper do HtmlService (logs "dropping postMessage.. was from unexpected window"). **Backend** (`ViabilidadeAPI.js`): `getViabilidadeConfig` agora retorna `extensionId` (string, back-compat) E `extensionIds` (array) — Property `VIABILIDADE_EXTENSION_ID` passou a aceitar lista CSV. `_viabilidadeSetup.js`: `_VIABILIDADE_EXTENSION_ID_HARDCODED` contém 2 IDs separados por vírgula; `_setViabilidadeExtensionId()` valida cada um e grava CSV. **Frontend** (`JS.html`): `_healthSendMsg` itera sobre `_healthExtensionIds` na Via A (tenta cada ID em paralelo); timeout 7s → 12s pra acomodar broadcast cross-frame. **Extensão** (`content-viabilidade-bridge.js`): nova função `blastEntreFrames(envelope)` envia a resposta via `postMessage` pra `window.top` e desce recursivamente em `w.frames`; cada bridge instalado em outro frame que vê `kind:'response'` re-dispara `CustomEvent dhp-via-res` no document local — garante que o frame do CRM (onde o `_healthSendMsg` escuta) sempre receba, independente de qual instância do bridge atendeu a request. Dedup por ID (req/res) previne loops entre frames. Validado em produção: dots verdes nas máquinas Joysse e Vanessa. |
| 18/05/2026 14:42 | v676 | **fix(planos): `getOfertasCidade` e `getPlanosPorCidadeProduto` honram `PUBLICAR=false` para Fibra.** Bug pré-existente: o campo `PUBLICAR` do `planos_vero.json` só era respeitado pelo endpoint público `?action=planos` (LP/Renata). As funções internas do CRM (Mapa de Ofertas e dropdown da Nova Venda) ignoravam — por isso a Oferta Verão (Rev7 `PUBLICAR=false`) continuava aparecendo. Fix: ambas as funções agora filtram planos com `PUBLICAR=false`. Guard de compatibilidade: aplicar **somente** quando `TIPO` da linha não-Móvel (`getOfertasCidade`) ou quando `tipoAlvo` começa com `FIBRA` (`getPlanosPorCidadeProduto`) — planos Móvel (`VERO CONTROLE *`, `ASSINATURA + CHIPS *`) têm `PUBLICAR=false` historicamente (semântica "não publicar na LP", redundante com filtro de PRODUTO_TIPO no endpoint público), mas devem aparecer no CRM. `getValorPlano` continua sem filtro (edição de venda histórica com plano descontinuado funciona normal). |
| 18/05/2026 14:28 | v675 | **feat(planos): JSON Rev7 — Oferta Verão descontinuada + VERO DUO / VERO FULL.** Base: RESUMO NP 2.0 (PORTFÓLIO_B2C 260515). Mudanças no JSON (4): (1) `OFERTA VERÃO 800MB + GLP PREMIUM + HBO MAX + MÓVEL 60GB` → `PUBLICAR=false` (descontinuada; linha preservada p/ histórico); (2) `VERO MAIS 800MB + DISNEY+ ADS + HBO MAX ADS + MÓVEL 30GB` → renomeado `VERO DUO ...` (nome + `TIPO`); (3) `VERO MAIS 800MB + PRIME VIDEO + APPLE TV + MÓVEL 30GB` → `VERO DUO ...`; (4) `VERO MAIS 800MB + PRIME VIDEO + APPLE TV + HBO MAX + GLP PREMIUM + MÓVEL 60GB` → `VERO FULL ...`. `PRODUTO_TIPO=FIBRA_COMBO` preservado nos 3 (continuam combos com móvel). Helpers em `Code.js`: `_atualizarPlanosVeroJsonRev7` (atualiza JSON no Drive, invalida cache); `_migrarNomesVeroDuoFull` (find/replace na col PLANO da aba `1 - Vendas`, `startsWith` preserva sufixo `\| R$ XX,XX`, idempotente). Execução: 43 linhas, 10548 bytes, ZERO vendas históricas migradas (esses 3 SKUs nunca foram vendidos com o nome literal antigo). Validado via curl: `total=26` (era 27 com Oferta Verão), VERO DUO=2, VERO FULL=1. Aliviou divergência entre o resumo NP 2.0 e o JSON. |
| 17/05/2026 16:37 | v660 | **feat(viabilidade): Sprint 3 — UI no CRM (`Viabilidade.html` + `ViabilidadeAPI.js`).** Fecha o ciclo Viabilidade (Sprint 1 parser + Sprint 2 extensão + Sprint 3 UI). Novo item de menu **⌖ Viabilidade** sob "Operacional" (perfis admin + backoffice via `PERFIS_MENUS`). **Backend** `ViabilidadeAPI.js` (5 funções públicas): `getViabilidadeHtml()` respeita feature flag `VIABILIDADE_ATIVO` em Script Properties (default `'0'` = página mostra "Módulo desativado"); `getViabilidadeConfig(usuario)` retorna `{ ativo, extensionId, usuario }` consumido no boot do frontend; `getViabilidadeAddressCleanupBackend(textoCru, usuario)` cleanup via Claude Haiku (`claude-haiku-4-5-20251001`, system prompt estrito da spec §6, throttle 30/h por usuário); `salvarConsultaViabilidade(usuario, consulta)` faz append na aba `Consultas Viabilidade` com **hash SHA-256 truncado 16 chars** do endereço (LGPD — endereço cru nunca gravado); `getHistoricoViabilidadeUsuario(usuario, limite)`. **Frontend** `Viabilidade.html`: banner de status com health check 30s (4 estados — verde OK / laranja `PING_TAB_AUSENTE` / amarelo `PING_NAO_AUTENTICADO` / vermelho extensão off ou `EXTENSION_ID` ausente), inputs disabled até banner verde; autocomplete com debounce 350ms via extensão; botão **🧹 Limpar com IA** substitui texto cru pelo logradouro normalizado; card de resultado colorido por `resultado` (verde DISPONIVEL / amarelo PROVAVEL / cinza SEM_COBERTURA / vermelho AREA_PROIBIDA / azul INDETERMINADO) com badge, motivo, lista de até 8 CTOs (status, portas livres, distância, provedor, validada); histórico de 10 consultas em memória + persiste no Sheets fire-and-forget; mini-parser inline espelhando `ViabilidadeParser.js` (mantém o GAS parser intocado — Sprint 3.1 pode unificar via passthrough se virar dor). Tratamento de edge cases §11.5 #8 (filtra `lat:0,lng:0`) e #10 (`marker_type==='place'` → pula etapa do número). **Wiring**: `Code.js` ganha comentário ponteiro; `Config.js` adiciona `'viabilidade'` a PERFIS_MENUS de admin+backoffice; `Index.html` ganha item de menu + page div + container; `JS.html` ganha `'viabilidade'` em `_menusPermitidos` + entry no `_menuMap` + handler `navegar('viabilidade')` que injeta o HTML retornado por `getViabilidadeHtml()` (recarrega a cada visita pra refazer health). **One-shots em `_viabilidadeSetup.js`** pra rodar UMA VEZ no editor após push: `_criarAbaViabilidade()` (cria aba `Consultas Viabilidade` com 7 cols A-G: `TIMESTAMP`, `USUARIO`, `ENDERECO_HASH`, `RESULTADO`, `CTOS_QTD`, `MOTIVO`, `META_JSON`); `_setViabilidadeExtensionId("<ID>")` (grava EXTENSION_ID em Script Properties — pegar em `chrome://extensions` após carregar `extensao-dharmapro` v2.2.0); `_setViabilidadeAtivo(true)` (liga a flag); `_checarConfigViabilidade()` (diagnóstico). Remover este arquivo no próximo push após setup. **Pré-requisitos operacionais**: (1) extensão MV3 v2.2.0 instalada/recarregada em `chrome://extensions`, (2) aba do PinG aberta e logada em `https://ping.veronet.com.br/`, (3) `CLAUDE_API_KEY` presente em Script Properties (deve estar — Painel Ads usa). |
| 17/05/2026 16:30 | v657 | **feat(consultas): auto-fallback NG ↔ Adapter por cidade ambígua (rede neutra) via `cidades_vero.json`.** Origem: Vero opera redes diferentes por cidade — em MG/GO há cidades em "rede neutra" onde NG e Adapter coexistem. O `SISTEMA` gravado na venda nem sempre bate com onde o cliente realmente está cadastrado; consulta no sistema errado retorna `cpf_nao_encontrado` e o BKO desistia. **Backend** (`Code.js`): nova fonte de verdade `cidades_vero.json` no Drive (file ID em `CONFIG.CIDADES_JSON_FILE_ID`, vazio até upload — caller cai no fallback da aba `CIDADES` do Sheets). Schema: `{ geradoEm, totalCidades, cidades: [{nome, sistema, sistemaFallback, segmentacao, regional, cluster, territorio, redes, rawSistema}] }`. Helpers `_getCidadesJson()` (cache 600s) + `_acharCidadeJson(cidade)` (indexa por nome normalizado NFD+lowercase). Nova função pública `getSistemaFallbackPorCidade(cidade)` retorna `'NG' | 'Adapter' | null` — só não-null quando JSON marca cidade como ambígua. `getSistemaPorCidade()` e `getSegmentacaoPorCidade()` agora consultam JSON primeiro, fallback pra Sheets. `_mapearLinhaLista()` e `_mapearLinha()` expõem `sistemaFallback` ao frontend. `getVendasParaVarredura()` reconhece fallback: filtro `NG` agora inclui também vendas `Adapter` cujo `sistemaFallback==='NG'` (e vice-versa). **Frontend** (`JS.html`): `_consultarNGVenda` e `_consultarAdapterVenda` ganham auto-fallback — quando recebe `cpf_nao_encontrado` na 1ª tentativa E `v.sistemaFallback` é o outro sistema, fecha o modal/popup e chama o outro sistema automaticamente após 1.5s, com toast informativo ("Não encontrado no NG. Tentando no Adapter (cidade aceita ambos)..."). Loop prevenido limitando ao `_tentativa === 1`. Telemetria: novo evento `fallback_para_adapter` / `fallback_para_ng` logado em `Log Consultas Instalacao`. **CDN content-ng** (`cdn/content-ng.txt`, servido via jsDelivr): (1) detecta `Nenhum resultado para mostrar` no DOM como sinal explícito de "não encontrado" (Wing novo) — antes timeoutava 15s nessa tela; (2) novo branch de resumo "Aguardando instalação (taxa aplicada em DD/MM/YYYY)" pra contratos pré-instalação onde `r.debug.taxaHabilitacao` existe + sem cancelamento + sem `dataInstalacao` — estado real e legítimo que antes caía em "Status não identificado". Mirror em `extensao-dharmapro/content-ng.js` em sincronia. **Pré-requisito operacional**: rodar one-shot manual no editor pra gerar `cidades_vero.json` a partir das abas `B2C_REDE_VERO/EPON/NEUTRA` da planilha mestra "TABELA_DE_PREÇOS_PORTFÓLIO_B2C.xlsx" e configurar `CONFIG.CIDADES_JSON_FILE_ID`. Sem isso, comportamento atual preservado via fallback pra aba CIDADES. **Nota Sprint 2 Viabilidade**: extensão Chrome MV3 v2.2.0 também mergeou na main neste deploy (commit `4e2aac4`), mas é código que roda no browser — não afeta GAS. Detalhes em `prompt-viabilidade-ping.v2.md` §8/§9/§11. Instalação manual em `chrome://extensions → Carregar sem compactação → extensao-dharmapro/`. |
| 17/05/2026 12:03 | v654 | **feat(viabilidade): Sprint 1 — parser puro `ViabilidadeParser.js` para respostas do gateway PinG (`gateway.pi.ngtools.com.br`).** Módulo JS V8 puro, sem deps de GAS, expõe via `globalThis.ViabilidadeParser` no Apps Script e via `module.exports` no Node (testes). 5 funções públicas: `normalizar(rawDetalhesNumero)` → `ConsultaViabilidade`, `derivarResultado(rawDisponibilidade, ctosNormalizadas)`, `derivarStatusCto(ctoRaw)`, `pointInForbidden(lat, lng, coverageAreaArr)` (ray casting puro), `gerarMotivo(resultado, ctos, forbiddenAreaName?)`. **Decisão de agregação top-level** quando `disponibilidade='available'`: a CTO mais próxima (item `[0]` de `ctos_within_range`, que o gateway já ordena por `distance` ascendente) determina o `resultado` — espelha o status individual da CTO mais relevante pro operador, não é leitura literal da §4 rule b da spec. Bateria de testes `ViabilidadeParser.test.js` (runner Node, `assert` nativo, sem framework) com 16 testes que cobrem os 5 fixtures reais em `extensao-dharmapro/fixtures/ping/` (capturas autênticas do gateway via `fetch` interceptor) + 8 dos 16 edge cases da §11.5 da spec — itens que tocam `normalizar()`/`pointInForbidden()`. Os 4 edge cases de autocomplete (#8 `lat:0,lng:0`, #9 sugestões duplicadas, #10 `marker_type==='place'`, #16 input curto) ficam para Sprint 2 quando a extensão MV3 + UI no CRM existirem. Spec completa em [prompt-viabilidade-ping.v2.md](prompt-viabilidade-ping.v2.md) §3 (schema gateway), §4 (modelo `ConsultaViabilidade`), §11.5 (edge cases). **Nenhum consumidor em produção ainda** — o parser fica disponível em `globalThis.ViabilidadeParser` pra ser usado pela extensão Chrome (Sprint 2) e por `ViabilidadeAPI.js` (Sprint 3). `.claspignore` ganhou `*.test.js` (impede o teste de subir pro GAS) e `prompt-viabilidade-ping.v2.md` (mantém spec versionada só no git). |
| 16/05/2026 15:30 | v637+ | **Fase 1.5 — Reescrita do `content-ng.js` após descoberta de falso negativo sistêmico.** Logs da Fase 1.0 revelaram que 100% das consultas NG retornavam "Sem contrato ativo" mesmo para vendas comprovadamente instaladas (CPF 618.733.683-64/ADRIANO, contrato 202793012 RESIDENCIAL Habilitado, retornava vazio). Investigação via screenshots manuais do Ricardo identificou que o script estava clicando `visualizaPessoaB` ("Visualizar") no card de resultado de busca — botão que abre um modal de edição de Pessoa SEM contrato algum, caminho dead-end. **O caminho correto é clicar no botão azul "Atender"**, que abre a tela completa de Atendimento com painel "Contratos (N)" no lado esquerdo. Função `clicarVisualizar` em `cdn/content-ng.txt` (servido via jsDelivr CDN do GitHub @main) + mirror em `extensao-dharmapro/content-ng.js` reescrita: prioriza items Wing matching `/atend(e\|er\|imento)/i` (descartando Pessoa), fallback DOM por `<button>` com texto "Atender", aguarda header `Contratos (N)` aparecer no DOM, pausa fixa de 5s pros controllers (`Atend360TabPessoaFisicaWComp`, `Atend360ContratoTipoFisicoCardWComp`, `Atend360InformacoesHeaderPessoaWComp`, `CasoCriacaoDeContratoWComp`, `CasoCriacaoCheckOSExternaDeHabilitacaoWComp` etc) terminarem de renderizar (antes pausa de 3s era insuficiente para multi-contract). Função `buscarCPF` trocou `pesquisaBtn.element.click()` por `simularEnter(input)` direto — mais confiável, eliminou timeouts intermitentes em "Resultado busca CPF" depois de várias consultas sequenciais. Função `lerDadosDom` enriquecida: lê `Contrato`, `Tipo de contrato`, `Instalado em`, `Cancelado em`, `Endereço`, `Bairro`, `Modalidade`, `Status`; detecta `Contratos (0)` no header como sinal explícito de "sem contrato" (não falso negativo); lógica de status — `Cancelado em` com data válida → contrato cancelado (resumo "Contrato cancelado em DD/MM/YYYY"), `Status` contém "Habilitado" → instalada, `Instalado em` válido sem cancelamento → instalada. `lerCampoDOM` parser refatorado para priorizar `nextElementSibling` (preciso pra label-value pares lado-a-lado) sobre varrer filhos do pai (que pegava valor errado em rows com múltiplos campos tipo "Instalado em / Cancelado em" lado-a-lado). Debug por campo lido capturado em `r.debug.lidoContrato`/`lidoInstaladoEm`/`lidoCanceladoEm`/`lidoStatus` e expostos no log via `lC=`/`lI=`/`lCa=`/`lS=` — só aparecem quando DOM fallback é acionado; Wing controllers funcionando OK → DOM fallback não roda → fields não aparecem (sinal de saúde). **Resultados validados** em consultas únicas pós-fix: ADRIANO retorna "Instalada em 01/05/2026 \| ctrls=12 contratos=1 nome=ok"; VITORIA (029.412.340-71) retorna "Agendada para 15/05/2026" capturando `dataAgendamento` via OS Externa; AMALIA (723.321.230-91) e JACQUELINE (006.237.040-56, multi-contract) deixaram de falsificar "Status não identificado" após pausa 5s permitir todos os controllers carregarem. **Pausa entre consultas Varredura recomendada: 8-10s** — elimina timeouts da Vero por carga sequencial sustentada. Aguardando varredura final de 30 vendas para fechar Fase 1.5 oficialmente. **Fase 2** (background polling automático + atualização automática do DharmaPro quando script confirma instalação) é o próximo passo. |
| 15/05/2026 22:45 | v630-v636 | **Fase 1.0 — Instrumentação completa das consultas NG/Adapter + Modo Varredura admin + restauração dos botões NG/AD na Lista.** Origem: BKO acompanhava instalações manualmente de 2 em 2 horas porque os botões NG/AD do CRM "quebravam toda hora"; precisamos primeiro instrumentar pra entender quais erros estavam acontecendo antes de tentar consertar. **Instrumentação**: nova aba `Log Consultas Instalacao` no Sheets (9 colunas: Timestamp, Usuário, Sistema, Linha, CPF, Evento, Categoria, Tempo (ms), Mensagem); backend `logConsultaInstalacao(dados)` em `Code.js` (fire-and-forget — erro no log nunca bloqueia consulta); one-shot `_criarAbaLogConsultasInstalacao()` em `_arquivo.js`. `getVendasParaVarredura(filtros)` em `Code.js` busca direto da planilha (não passa pela paginação `_paginaAtual` que só tem 500 mais recentes), aceita filtros sistemas/statuses/max. Frontend (`JS.html`): 3 helpers — `_logConsulta` (fire-and-forget via `google.script.run`), `_categorizarErroConsulta` (regex categoriza em buckets `auth`/`cpf_nao_encontrado`/`timeout_extensao`/`timeout_frontend`/`http_4xx`/`http_5xx`/`rede`/`popup_bloqueado`/`sem_credenciais`/`outro`), `_mensagemErroHumana` (mensagens humanas por categoria). `_consultarNGVenda` e `_consultarAdapterVenda` ganham 9 pontos de telemetria (iniciado, sucesso, erro_extensao, retry, timeout_frontend, sem_credenciais, popup_bloqueado, erro_backend, cpf_invalido). **Hardening do retry**: `_popup` movido para escopo da função, popup anterior fechado explicitamente antes de retry; delay 5s→10s; validação CPF prévia (rejeita CNPJ/lixo de qualquer tamanho ≠ 11 dígitos); mensagens humanas categorizadas no modal; indicador visual "Tentando novamente (2/2)..." no loading. **Fix crítico de popup reuse**: `window.open(..., 'dhp_ng', ...)` reusa janela existente quando mesmo nome de target — mudança apenas de hash NÃO dispara content_script, causando reuso silencioso entre consultas (popup do consulta anterior aparecia em estado Wing confuso ou tela de "Erro Inesperado"). Corrigido com handles globais `_ngPopupAtual`/`_adapterPopupAtual` que fecham popup anterior antes de abrir novo, e nome único por consulta (`'dhp_ng_' + Date.now()`, `'dhp_adapter_' + Date.now()`). Timeout NG bumped 75s→120s pra acomodar Wing fazendo login do zero. **Modo Varredura admin** (`btnVarredura` no header da Lista de Vendas, `modalVarredura`): admin-only (visibilidade controlada por `_varreduraInitBotao` que checa `AppState.get('perfil') === 'admin'` em cada render da Lista), modal com filtros Sistema (NG/Adapter/Ambos), Status (2 default + 3 default para auditoria reversa — status 1 retirado por ser pré-venda fora do Vero), Máximo até 500, Pausa entre consultas 1-60s. Iterador serial faz swap temporário de `_paginaAtual` por lista retornada do backend (restaura ao final/cancelamento via `_varreduraRestaurarPaginaAtual`), observa DOM dos modais NG/Adapter (`#mng-loading`/`#madp-loading` ocultar + `#mng-resultado`/`#madp-resultado` aparecer) pra detectar conclusão sem invadir as funções de consulta. **Restauração dos botões NG/AD na Lista**: estavam escondidos provisoriamente por `.vi-bot-v6 .vi-actions { display: none !important; }` em `Index.html`. Solução cirúrgica: regra trocada para esconder todo `.btn-popup` exceto os com classe `.btn-popup--consulta`, classe aplicada apenas nos botões NG/AD nos 3 renderizadores (cards principal, PAP, combo agrupado). Botões Assertiva (👤), Copiar (📋), BotConversa (🤖), Viabilidade (🔍) continuam escondidos pelo CSS — só NG/AD ressuscitados. |
| 14/05/2026 16:35 | v629 | **perf(wa-campanha): handlers de webhook param de ler as 70k linhas de WA Disparos — corrige rastreamento de entrega.** Causa raiz do "poucos receipts de entrega": a aba `WA Disparos` tem 70.306 linhas (mailings de 33k da Joysse) e TODO handler de webhook fazia `_waLerLinhas_` (lê a planilha inteira) a cada chamada. O `_handleWaPessoalDeliveryUpdate_` levava 9-14s e retornava `ok:false` — eventos `messages.update` da Evolution chegam em rajada, empilhavam e estouravam timeout (só ~16/47 receitas gravavam). Diagnóstico: o webhook da Evolution ESTÁ configurado certo (`WEBHOOK_EVENTS_MESSAGES_UPDATE=true`, global) e os eventos `DELIVERY_ACK`/`READ` chegam no n8n — o gargalo era 100% o GAS. Correção: 2 helpers novos — `_waAcharLinhasDisparo_` (lookup via `TextFinder`, busca server-side) e `_ajustarTotaisCampanha_` (ajuste incremental dos totais, sem recontar). Os 4 handlers reescritos: `_handleWaPessoalDeliveryUpdate_` (TextFinder por message_id), `_handleWaPessoalUpdate_` (TextFinder por phone + totais incrementais), `_handleWaPessoalMarkRespondeu_` (TextFinder por status='enviado' + totais incrementais), `_handleWaPessoalNextPending_` (lê só colunas A..status, não as 14). `_recalcularTotaisCampanha_` mantido para reparo manual. Validado: delivery handler 9-14s+`ok:false` → 4-6s+`ok:true`. **Pendência:** os 70k+ registros são um problema de escala — TextFinder resolve o timeout mas ainda leva 4-6s; idealmente arquivar campanhas concluídas/grandes em aba separada. Totais de campanhas antigas seguem inflados (incremental só corrige daqui pra frente — rodar `_recalcularTotaisCampanha_` manualmente pra reparar). |
| 14/05/2026 16:23 | v627 | **fix(wa-campanha): alertas de saúde param de gritar shadowban com dados ruins.** O `getSaudeWaPessoal` tratava `entregue_em` como verdade absoluta — mas ele vem do webhook `messages.update` da Evolution, que é best-effort e dispara muito mal (ex.: Joysse 16/47 receipts hoje). Resultado: o alerta vermelho "Entrega crítica → shadowban → pausar AGORA" disparava com amostra ridícula (1/7) e a "Saúde da conta" mostrava "Crítico" falso; o KPI Engajamento (`pct_lido_efetivo = lido_efetivo/entregue`) estourava 100% (mostrou "400%"). Mudanças: (1) `pct_lido_efetivo` passou a dividir por `enviado` (confiável), não por `entregue` — não estoura mais 100%; (2) os alertas de entrega (vermelho/amarelo) só disparam com `entregue >= ENTREGA_AMOSTRA_MIN` (10) — amostra mínima de receipts; (3) novo alerta `info` (cinza, não escala o status) quando há volume (`enviado >= 20`) mas quase nenhum receipt — avisa que a % de entrega não é confiável; (4) o alerta de engajamento agora gateia em `enviado >= 10` em vez de `entregue >= 5`; (5) a queda relativa de entrega vs baseline também exige amostra mínima de receipts. Frontend (`DispPessoal.html`): nível `info` ganhou estilo cinza + ícone ℹ️. **Pendência separada:** investigar por que o webhook `messages.update` da Evolution reporta tão pouco — é o que tornaria a métrica de entrega confiável de novo. |
| 14/05/2026 15:12 | v625 | **fix(wa-campanha): dedup de telefone no mailing + variações preservam marcas.** (1) `criarCampanha` não deduplicava a lista de contatos — telefone repetido no mailing virava N linhas em `WA Disparos`. Como `_handleWaPessoalUpdate_` e `_handleWaPessoalMarkRespondeu_` casam por `(campanha_id, phone)` first-match (não pela linha específica disparada), 1 envio/resposta real se espalhava pelas linhas irmãs do mesmo telefone — inflando `total_enviado`/`total_respondeu` (sintoma: campanha mostrava 6 enviados/3 respostas quando só 2 mensagens reais saíram; `env == resp` em quase toda campanha). Agora `criarCampanha` deduplica por `_normalizePhoneBR_` antes de gravar; `total_contatos` reflete o nº deduplicado; retorno inclui `recebidos` (nº antes do dedup). (2) `gerarVariacoesMensagem`: o prompt dizia "revenda da Vero Internet" e a Claude "corrigia" `Nio`→`Vero` nas variações. Prompt reescrito para reproduzir marcas (Vero, Nio, etc.) exatamente como no original — campanhas de migração entre marcas dependem disso. **Pendência:** o match por linha específica (passar `_row` do `next_pending` até o `wa_pessoal_update` no WF1) continua aberto como hardening — com dedup, deixa de ser crítico, mas elimina de vez o risco de smear. |
| 14/05/2026 14:49 | v623 | **feat(wa-campanha): badge admin global com saúde de disparo.** A bolinha do menu "WA Campanha" sempre funcionou por usuário (cada CRM chama `temCampanhaAtivaWaPessoal(usr, null)` com o próprio login) — mas o admin só via as próprias campanhas. Agora, quando o requisitante é admin e não passa `usuarioAlvo`, `temCampanhaAtivaWaPessoal` retorna visão global via novo `_waResumoCampanhasGlobalAdmin_`: conta campanhas ativas de todos, agrupa por usuário/instância e detecta campanhas **paradas** (`ativa` + tem pendente + dentro da janela de disparo + sem envio nem criação há +15min — `WA_DISPARO_SILENCIO_MS`). Lê `WA Disparos` só quando há campanha ativa (caso comum sem campanha = leitura única de `WA Campanhas`). Badge fica **vermelho** (`.dot-vermelho`) se há campanha parada, **amarelo** se tudo disparando; tooltip lista por usuário (ativas, enviadas nos últimos 15min, último envio, paradas). Novos helpers em `DispPessoalAPI.js`: `_waDentroDaJanela_` (janela BRT + bypass, extraído da lógica do `_handleWaPessoalCheckDispatch_`), `_waParseData_`, `_waMapaNomesUsuarios_`. Frontend: `_waPessoalAtualizarBadge` passou a receber o objeto inteiro (antes só o número). Usuário comum: comportamento idêntico ao anterior. |
| 14/05/2026 14:38 | v620 | **fix(wa-campanha): status da instância quando ela não existe na Evolution.** `getMinhaInstancia` tinha dois caminhos de retorno: o de "instância existe" (linha 261) passava por `_waNormalizarParaCliente_`, mas o de "instância não existe" (linha 247) retornava `resp` cru. Como `resp.daily_date` vem da aba `WA Instâncias` como objeto `Date` e o `google.script.run` não serializa `Date` (vira `null` silenciosamente no client), o frontend recebia `null` → toast "Erro ao consultar status" e o usuário ficava sem o botão Conectar. O bug só se manifestava quando a instância tinha sido removida da Evolution. Fix: o caminho da linha 247 também passa por `_waNormalizarParaCliente_`. Bônus: `deletarInstancia` passou a tolerar HTTP 404 no `DELETE /instance/delete` (instância já removida = objetivo cumprido) — antes estourava e travava a UI em "Conectado". |
| 13/05/2026 12:47 | v601 | **fix(cruzamento): escopo mensal no 🟡 + wipe-and-replace na coluna VERO_STATUS.** Primeira execução do v599 marcou 3027 contratos históricos do CRM como 🟡 ("falta no Vero") porque a consolidação server-side comparava o relatório Vero diário (16 vendas) contra TODO o CRM (3927 contratos), sem o filtro de mês vigente que existe no `_cruzRenderVendas` do client. `_cruzConsolidarServer_` e `_cruzConsolidarESalvar` (client) agora calculam `mesVigente` da aba VENDAS via `DATA_CADASTRO` e só marcam 🟡 contratos cujo `dataAtiv` cai no mesmo mês/ano. Nova função `aplicarVeroStatusCompleto` em `Code.js` escreve a coluna VERO_STATUS inteira via `setValues`, limpando resíduos de imports anteriores — pipelines de import (Gmail auto + botão manual) usam ela no lugar de `salvarResultadoCruzamento` (mantida para compat). Validação E2E: 13 🟢 Instalações + 5 🟢 Vendas + 1 🟡 (vs. 3027 amarelos antes). |
| 13/05/2026 12:15 | v599 | **feat(cruzamento): import automático do relatório Vero via Gmail.** Novo módulo `CruzamentoAutoAPI.js` busca o último e-mail "SNIPER MOBILE" (5 queries em cascata: label `vero-sniper` → from+subject → subject → filename exato → filename:SNIPER), baixa o anexo `.xlsx`, converte para Google Sheets temporário via Drive REST API (UrlFetchApp + OAuth token, sem Advanced Drive Service), lê as abas com SpreadsheetApp, cruza com o CRM aplicando a prioridade `INSTALAÇÕES > VENDAS > 🟡` e grava na coluna VERO_STATUS. Sheets temporário apagado no `finally`; idempotência via Script Property `CRUZ_VERO_LAST_THREAD`. Botão `📧 Buscar último da Vero` na página Cruzamento aciona o pipeline sob demanda; trigger diário 09h `importarRelatorioVeroAutomatico` faz o mesmo automaticamente. One-shots em `_cruzAutoSetup.js`: `configurarTriggerCruzamentoVeroDiario`, `removerTriggerCruzamentoVeroDiario`, `forcarAutorizacaoGmail` (força diálogo OAuth quando GAS não detecta o novo escopo automaticamente após `clasp push`), `testarBuscarVeroAgora`, `limparUltimoThreadProcessadoVero`. Escopo `gmail.readonly` adicionado em `appsscript.json`. |
| 13/05/2026 11:11 | v597 | **fix(cruzamento): INSTALAÇÕES sobrepõe VENDAS no rótulo VERO_STATUS.** A persistência do nome da aba só rodava no render de Vendas, então todo contrato instalado acabava marcado como `🟢 Vendas`. Nova função `_cruzConsolidarESalvar` (client) é chamada após carga do CRM e antes do `_cruzRenderizar`: percorre `_cruzDados.vendas` e `_cruzDados.instalacoes` cruzando com `_cruzDadosCRM` com prioridade `INSTALAÇÕES > VENDAS > 🟡`. Save redundante removido de `_cruzRenderVendas`. |
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
| 09/05/2026 19:33 | v533 | **WA Pessoal — fix DEFINITIVO chain (3 bugs cascateados).** (1) Bug Sheets v4 multi-filter retornava 1 item por filtro em vez de AND (loop pegava sempre row 2 já enviada → 16 msgs duplicadas). Fix: WF1 abandonou Sheets node, criou novo endpoint GAS `wa_pessoal_next_pending` que retorna primeiro pendente atomicamente (claim com `status='enviando'`). (2) Bug LockService timeout: 3 handlers GAS usavam `getScriptLock()` global, causando timeout entre Próximo Pendente → Marca Enviado da mesma chain. Fix: removidos LockService dos 3 handlers (`_handleWaPessoalNextPending_`, `_handleWaPessoalUpdate_`, `_handleWaPessoalDeliveryUpdate_`). (3) Loop Próximo HTTP node sem `method:POST` (default GET → 404 no webhook). Fix: adicionado `"method": "POST"`. |
| 09/05/2026 20:36 | v535 | **WA Pessoal — fix tracking de respostas LID.** WF2 simplificado: `Disparos enviados da instância` + `Resolve match` + `doPost GAS (respondeu)` substituídos por **um único** HTTP node `Mark Respondeu (GAS)` que chama endpoint `wa_pessoal_mark_respondeu` (match exato por phone normalizado + fallback heurístico LID atomicamente). Helper `_normalizePhoneBR_` reduz a 10 dígitos canônicos (DDD + 8) — strippa prefixo `55` e o "9" extra de mobile pra match cross-formato. |
| 09/05/2026 23:34 | v536 | **WA Pessoal — pendência #2 (envio de imagens).** Backend: `uploadImagemCampanha(usuario, base64, filename, mimeType)` em DispPessoalAPI.js — salva no Drive (folder "WA Pessoal Imagens"), `setSharing(ANYONE_WITH_LINK, VIEW)`, retorna URL `drive.google.com/uc?export=download&id=...`. `criarCampanha` aceita `dados.imagem_url` e grava em col N `imagem_url` de `WA Campanhas`. Frontend: input file na "Nova Campanha" + preview + botão remover + validação ≤5MB + auto-upload. WF1: novo IF `Tem imagem?` após Wait Typing → branch `Envia Mídia` (POST `/message/sendMedia/{instance}` com `mediaMessage: {mediatype:image, media:URL, caption:texto}`) OU branch `Envia Mensagem` existente. Variação sorteada vira caption quando há imagem. One-shot `_addColunaImagemUrl` em `_waImagemSetup.js`. |
| 09/05/2026 23:57 | v538 | **WA Pessoal — Saúde Dashboard.** Backend `getSaudeWaPessoal` calcula KPIs hoje vs baseline 7d (entrega %, engajamento [lido OU respondeu]/entregue %, resposta %, erros). Alertas amarelo/vermelho com sugestões anti-ban heurísticas. Read receipts amplamente desabilitados são compensados por "engajamento efetivo". Quedas relativas vs baseline geram alertas. Frontend: bloco no topo do Dashboard com banner status + alertas + 4 mini-KPIs com delta. v542 (10/05): quando `hoje.enviado=0`, mostra média baseline 7d com opacity em vez de `0% / -100%` confuso. |
| 10/05/2026 09:58 | v543 | **WA Pessoal — toggle bypass horário (admin) + bolinha menu + rename "WhatsApp Pessoal" → "WA Campanha".** Novo endpoint `wa_pessoal_check_dispatch` substitui Code "Checa Horário" do WF1 (n8n agora chama GAS pra ver janela 08-20 + bypass admin em tempo real, fuso `America/Sao_Paulo`). Funções `setBypassHorarioWaPessoal`/`getBypassHorarioWaPessoal` (admin only) gravam em Script Property `WA_PESSOAL_BYPASS_HORARIO`. Frontend: toggle switch amarelo no Dashboard (visível só admin). `temCampanhaAtivaWaPessoal` retorna count; `_waPessoalIniciarPollingBadge()` em JS.html chama no login + 60s. CSS `.nav-badge.dot-amarelo` (8x8 amarelo + glow + animação `pulsar` reaproveitada). Rename em Index.html sidebar + JS.html breadcrumb + Usuarios.html permissões. |
| 12/05/2026 22:39 | v595 | **fix(api): `?produto=FIBRA` agora captura `FIBRA_ALONE` + `FIBRA_COMBO`.** Regressão da Fase 1: o alias `FIBRA → FIBRA_ALONE` excluía os 13 Vero Mais (FIBRA_COMBO) do carrossel da LP — historicamente eles eram exibidos, pois o GAS antigo não tinha filtro de `PRODUTO_TIPO` (a coluna só foi criada no Rev5). Match passou de igualdade exata para `startsWith`: `'FIBRA'` captura FIBRA_ALONE+FIBRA_COMBO; `'FIBRA_ALONE'` segue exato (CRM não muda). Resultado: carrossel passa de 14 para 27 planos (13 Vero Mais + 14 Alone). Ordem segue a do JSON — Vero Mais (com móvel) abrem a página 1; "Mais popular" no card central recai sobre "VERO MAIS 800MB + GLP PREMIUM + MÓVEL 20GB". |
| 12/05/2026 21:55 | v593 | **fix(api):** `_formatarPrecoBR_` agora normaliza strings puramente numéricas (`"97.9"` → `"97,90"`). Recorrentes no `planos_vero.json` estão como string; sem o fix, o response do `?action=planos` voltava com ponto em vez de vírgula no `preco_recorrente`. Validado: `curl ...?action=planos&cidade=Juiz%20de%20Fora&produto=FIBRA_ALONE` → boleto `"107,90"` / recorrente `"97,90"`. |
| 12/05/2026 21:51 | v592 | **feat(api): endpoint público `?action=planos` e `?action=cidades` no `doGet`.** Single source para `ofertasverointernet` (que já consumia um GAS proxy `AKfycby9...`) e para `agente-ia-vero/Renata` (Fase 2 — atualmente hardcoded em `no5_montar_payload`). 5 helpers novos próximos de `_getTabela`: `_serveActionPlanos_`, `_serveActionCidades_`, `_parseFeatures_`, `_deriveSpeed_`, `_formatarPrecoBR_`. Shape unificado retrocompatível com a interface `Plano` de `PlanosSection.tsx` (`nome`, `preco`, `speed.{valor,unidade}`, `features[]`, `destaque`) + campos novos `preco_boleto`, `preco_recorrente`, `tipo`, `produto_tipo`, `nome_lp`. `preco` é alias dinâmico do param `?forma=` (BOLETO default). Filtro `PUBLICAR` aceita boolean `true` E string `'SIM'` (compat com revisões antigas do JSON). Filtro `?produto=FIBRA` mapeado para `FIBRA_ALONE` (compat com `PlanosSection.tsx` legado). Sem secret (dados públicos). Cache 600s do `_getTabela()` absorve o tráfego. Doc completa em `CLAUDE.md § Endpoint público`. |
| 12/05/2026 13:14 | v585 | **Sprint 3.3 — Painel lateral unificado (leitura + edição mesmo layout) + edição inline do Móvel Combo.** Duas dores resolvidas: (1) edição de status do Móvel em combo travava silenciosamente porque `_pifValidarTransicaoStatus` e `_validarTransicaoStatusServer_` só conheciam statuses Fibra; (2) layout mudava completamente entre leitura e edição (duas estruturas HTML/CSS distintas: `mostrarPainel` gerava `#painelScroll` via innerHTML com classes `.painel-*`, edição usava `#painelInlineForm` estático com `.pif-*`). **Backend** (`Code.js`): `_validarTransicaoStatusServer_` reconhece `"3- Aguardando Retirada"` (único campo exigido: ID Contrato Móvel); `salvarVenda` em edição aceita `payload.movel` e grava as 2 linhas atômico (snapshot da Fibra original via `linhaAtualSnapshot`, reversão via `setValues` em caso de falha do Móvel). **Frontend** (`JS.html` + `Index.html`): novo `#pif-secao-movel-combo` no `painelInlineForm` com inputs `pif-mv-*` (status, contrato, plano, valor, linhaMovel, portabilidade, dataAtiv, instal, observacao); CSS `.painel-inline-form.modo-edicao` aplica borda+bg surface2 nos inputs (modo leitura padrão = transparente). `mostrarPainel` reescrito: popula inputs em vez de gerar HTML via innerHTML. Novos helpers `_pifPopularInputs(v)`, `_pifPopularInputsMovel(mv)`, `_pifVisibilidadeSecoes(v)`, `_pifAplicarModoLeitura()`, `_pifAplicarModoEdicao()`. `painelToggleEdicao` simplificado para alternar modo leitura/edição via classe CSS. `_dhpMostrarPainelCombo` virou stub no-op (renderizador duplo eliminado). `_dhpAbrirPainelMovel` redireciona pro painel da Fibra mãe. `pifSalvar` anexa `dados.movel` quando seção visível, validando transição antes. Validações novas: `_pifValidarTransicaoStatusMovel` (frontend) + `pifOnStatusChangeMovel` (foca contrato). Net diff: −452 / +485 linhas. |
| 12/05/2026 10:33 | v574 | **JSON Rev6: cluster Móvel Combo alinhado à tabela Vero.** Adiciona `30GB \| MAIS CONECTADO \| COMBO` (R$ 50) — desbloqueia auto-inferência para 3 planos Fibra com "MÓVEL 30GB" no nome (ESPORTES FUTEBOL, DISNEY+ ADS, PRIME VIDEO). Corrige `60GB \| MAIS CONECTADO \| COMBO` (R$ 50 → R$ 80, alinhado a VERO CONTROLE 60GB / TITULAR 60GB). Cluster final: 10GB R$30, 20GB R$40, 30GB R$50, 60GB R$80. Vendas legadas com 60GB a R$ 50 preservam o valor gravado. Helper `_atualizarPlanosVeroJsonRev6` rodado no editor (43 linhas, 10501 bytes). |
| 12/05/2026 10:15 | v572 | **Auto-criação do Móvel Combo a partir da Fibra Combo + Vencimentos 1/3/5/9/13/18.** Modal `_abrirModalMovelCombo` eliminado do fluxo principal — Nova Venda mostra inline um card "📱 Móvel Combo Vinculado" (revelado em `nvOnProdutoChange` quando produto === 'Fibra Combo') com Portabilidade obrigatória + ID Contrato e Linha opcionais. Chip Móvel inferido deterministicamente pelo backend via regex `/MÓVEL\s+(\d+)\s*GB/` cruzada com PRODUTO_TIPO=MOVEL_COMBO no JSON (novo helper `_inferirMovelComboFromFibra_`). `salvarVenda` em cadastro novo de Fibra Combo dispara `criarVendaMovelVinculada` automaticamente após gravar a Fibra; lock liberado entre as duas operações (flag `_lockReleased`). Se a inferência falhar (Móvel não encontrado), Fibra é salva normalmente e `res.avisoMovel` faz o frontend abrir o modal antigo como fallback. Vencimentos: dropdown atualizado (antes 05/10/13/19) — valores fora do enum aparecem como ⚠ legado via `_pifSetSelectComLegado`. |
| 12/05/2026 09:55 | v569 | **Filtro determinístico de planos via coluna `PRODUTO_TIPO`.** Substitui filtro frágil baseado em "MÓVEL no nome do plano" por uma 14ª coluna no JSON com domínio fechado: `FIBRA_ALONE` / `FIBRA_COMBO` / `MOVEL_ALONE` / `MOVEL_COMBO`. Vero pode renomear planos sem quebrar o filtro. `getPlanosPorCidadeProduto` usa um mapa `ALVO_TIPO` para traduzir produto-UI ("Fibra Alone", "Móvel Combo" etc) para o valor esperado de PRODUTO_TIPO, com fallback heurístico se o JSON for Rev4 ou anterior. Helper `_atualizarPlanosVeroJsonRev5` rodado no editor (42 linhas, 10342 bytes). Classificação de seed: 13 Fibra Combo + 14 Fibra Alone + 10 Móvel Alone + 3 Móvel Combo. |
| 12/05/2026 09:47 | v567 | **Fix filtro de planos por produto na Nova Venda (heurístico interino).** Fibra Alone escondia planos com "MÓVEL" no nome; Fibra Combo só mostrava planos com "MÓVEL" no nome. Substituído logo depois pelo filtro determinístico do v569 — comportamento final preservado, mas semântica agora é segura a renomeação. |
| 12/05/2026 09:42 | v565 | **Fix `getValorPlano`: preserva pipes internos no nome do plano + rename "Pagamento Recorrente" → "Recorrente".** Bug: regex `split('|')[0]` truncava "800MB YOUTUBE PREMIUM \| HBO MAX \| TELECINE" no primeiro pipe → erro "Plano não encontrado na TABELA" ao escolher Recorrente. Fix: regex `/\s*\|\s*R?\$?\s*[\d.,]+\s*$/` remove apenas o sufixo numérico de preço, preservando pipes do nome real. Label dos selects `nv-formaPagamento` e `pif-formaPagamento` encurtado de "Pagamento Recorrente" para "Recorrente" (valor interno `'RECORRENTE'` inalterado). |
| 12/05/2026 00:35 | v562 | **Sprint 3 — Forma de Pagamento (Boleto/Recorrente) + Vencimento dropdown.** Tabela Vero NP 2.0 (11/05/2026) formaliza 2 clusters de preço: boleto cheio vs recorrente (−R$10 Fibra). Coluna nova **AT `FORMA_PAGAMENTO`** (índice 45, `'BOLETO' \| 'RECORRENTE' \| ''`). `TOTAL_COLUNAS: 45 → 46`. Novo helper backend `getValorPlano(plano, cidade, forma)` (lookup direto no JSON) — frontend chama ao trocar Plano ou Forma. `getOfertasCidade` retorna `{valorBoleto, valorRecorrente, valor}` (elimina hardcode `−10`); Mapa exibe os 2 valores lado a lado. `salvarVenda` valida cadastro novo: Forma + Vencimento obrigatórios além de canal+resp (legado passa). `_construirLinhaDados` grava AT; **para de gravar col Q (FAT) — liberada para reutilização futura**. `_resumirVendaVinculada_` e `_mapearLinha` expõem `formaPagamento`. `criarVendaMovelVinculada` + `_COMBO_PROPAGAVEIS_` propagam Forma da Fibra para o Móvel vinculado. JSON `planos_vero.json` expandido de 9 → 13 cols (append no final: `ESPECIAIS_REC, OURO_REC, PRATA_REC, PADRÃO_REC`, backward-compatible) via helper `_atualizarPlanosVeroJsonRev4` rodado no editor (42 linhas, 9373 bytes). Frontend: **Nova_venda.html** ganha `nv-formaPagamento` (select Boleto/Recorrente) e `nv-venc` (dropdown 05/10/13/19); `nv-valor` agora readonly recalculado pelo backend; validação no step 3. **Painel lateral** (`pif-formaPagamento`, `pif-venc` dropdown, `pif-fat` removido) com helper `_pifSetSelectComLegado` que preserva valores legados como `⚠ X (legado)` quando fora do enum. Cards visuais (3 renderizadores) substituem "Pagamento" (v.fat) por "Forma" formatada via `_labelFormaPagamento` (💰 Boleto / 🔁 Recorrente). |
| 10/05/2026 10:12 | v544 | **WA Pessoal — auto-conclusão de campanha.** Quando WF1 chama `wa_pessoal_next_pending` e GAS não acha mais disparos `pendente`, novo helper `_concluirCampanhaSeAtiva_` muda status `ativa→concluida` em `WA Campanhas`. Não toca em `pausada`/`cancelada` (preserva intenção do usuário). Idempotente. Cascata: bolinha amarela do menu some automaticamente (`temCampanhaAtivaWaPessoal` filtra só `ativa`); badge "concluida" aparece azul no Histórico. |
| 11/05/2026 23:25 | v559 | **Autor da venda (CRIADO_POR) registrado e exibido na Lista.** Nova coluna AS (índice 44) `CRIADO_POR` em `1 - Vendas` — `TOTAL_COLUNAS: 44 → 45`. `_construirLinhaDados` grava `d.criadoPor`; `_mesclarDadosVendaComLinhaAtual_` preserva o valor original em edições (imutável após criação, semântica idêntica à do `CRIADO_EM`); `_mapearLinhaLista` e `_mapearLinha` expõem `criadoPor` ao frontend. `criarVendaMovelVinculada` herda o autor da fibra-mãe no `dadosMovel`. Frontend: `_buildVendaPayload_` injeta `criadoPor: AppState.get('nomeUsuario')` em ambos os contextos (cadastro/edição), `coletarDados` (wizard antigo) e o fallback inline em `Nova_venda.html` idem. Render: os 3 cards da Lista de Venda (principal, PAP, combo agrupado) passam a exibir `Lanç. DD/MM HH:MM · Nome Completo` (mesma opacidade 55%, mesmo separador `·` já usado nos cards). Vendas legadas/Botconversa sem autor ficam graciosas (só timestamp). Setup: one-shot `_addColunaCriadoPor` em `_criadoPorSetup.js` grava o header `CRIADO_POR` em AS2 — executar UMA VEZ no editor; depois remover o arquivo no próximo push. |
| 11/05/2026 22:40 | v556 | **Auto-fill Sistema/Segmentação em todos os caminhos de gravação.** `_construirLinhaDados` agora faz lookup via `getSistemaPorCidade`/`getSegmentacaoPorCidade` quando `d.cidade` está preenchida e os campos estão vazios (idempotente). `doPost` (webhook Botconversa) refatorado para chamar `buscarCEPBackend` e usar `_construirLinhaDados` — vendas via webhook agora nascem com endereço completo + sistema/segmentação preenchidos. Backfill: `repararSistemaSegmentacao` rodado no editor corrigiu 7 linhas históricas em "1 - Vendas". |
| 11/05/2026 22:07 | v554 | **Defesa em profundidade nas transições de status (Zonas 1+2 do audit de robustez).** Nova função `_validarTransicaoStatusServer_(oldStatus, newStatus, campos)` em `Code.js` espelha a validação do frontend e é chamada por `salvarVenda` (após capturar `statusAntigo` pré-merge), `moverVendaFunil` (drag-and-drop no funil) e `moverLeadAguardando`. Exige `dataAtiv+contrato+agenda+turno` em 1→2 (incluindo formato NG/Adapter); exige `instal` em 2→3 e bloqueia 1→3 direto. `moverVendaFunil` e `moverLeadAguardando` agora normalizam `instal`/`agenda` para DD/MM/YYYY. `atualizarVendaComAdapter`/`atualizarVendaComNG` (integrações externas) recebem só normalização de data — preservam autoridade sobre instalação. |
| 11/05/2026 21:38 | v553 | **Sprint 2 — payload unificado + modais MS2/MS3 eliminados (campos inline no painel).** Novo `_buildVendaPayload_(contexto, vendaAtual)` em `JS.html` consolida 3 caminhos divergentes (NV/PIF/MS2-MS3) num payload único; `pifSalvar` e `nvSalvar` viram one-liners. Novo `_pifValidarTransicaoStatus(vendaAtual, dados)` valida obrigatórios da etapa antes de chamar `salvarVenda`. `pifOnStatusChange` para de abrir MS2/MS3 — revela a seção 📅 Datas inline no painel, pré-preenche `dataAtiv`/`instal` com hoje, foca o próximo campo obrigatório vazio, mostra toast informativo. Bloqueia 1→3 direto no select. Removidos ~350 linhas de JS (funções MS2/MS3) + 110 de HTML (`#modalStatus2`/`#modalStatus3`) + 22 de CSS (`.ms-*`). Backend: `_TURNOS_VALIDOS_` domínio fechado + `_validarContratoFormatoBackend_` em `salvarVenda` para transições para 2/3. Net diff: −336 linhas. |
| 11/05/2026 21:25 | v552 | **Fix mojibake JS.html nos cards combo agrupados + funções `_dhp*`.** 14 substituições (`MÃ³vel`→`Móvel`, `AtivaÃ§Ã£o`→`Ativação`, `Â·`→`·`, `â€"` / `â€º`→`—` / `›`, `ðŸ‘¤` / `ðŸ"‹` / `ðŸ"`→`👤` / `📋` / `🔍`). Alguns eram bugs funcionais (não cosméticos): `prodMap['MÃ³vel Combo']` nunca casava com `'Móvel Combo'` real → CSS class quebrada; `=== '1- Conferencia/AtivaÃ§Ã£o'` nunca era true → branch do VeroHub/preStatus morta no card combo. Auditoria byte-level com Python confirma zero mojibake no projeto. |
| 11/05/2026 21:00 | v551 | **Fix combo agrupamento: card combo não agrupa mais 2 Fibras.** `_decorarVendaComVinculos_` tinha um fallback `if (!melhorFilha && filhos.length) melhorFilha = filhos[filhos.length - 1]` que, se nenhuma filha do vínculo fosse Móvel, pegava qualquer filha — incluindo Fibras Combo legadas/erróneas. Fallback removido. Agora: se nenhuma filha for Móvel, deixa sem vínculo visual. Combo = Fibra + Móvel por definição. Lateral: rodada de `repararVinculosCombosOrfaos` (filtro temporal relaxado de 24h estrito → ±7 dias bidirecional, cobrindo casos onde Móvel foi criado antes da Fibra) vinculou TAINARA FRANCIELE SILVA GOMES; 20 ambíguos + 10 sem par pendentes de revisão manual. |
| 11/05/2026 20:32 | v550 | **Sprint 1 — saneamento do fluxo de cadastro/edição de venda (6 fixes cirúrgicos).** (1) `_filtrarStatusPorProduto` (JS.html) preserva status legado como opção marcada com ⚠ + toast — resolve "não consigo editar status de Móvel em combo" (Móvel cuja venda tinha status legado de Fibra herdado por migração). (2) `_construirLinhaDados` (Code.js) normaliza `DATA_ATIV` / `AGENDA` / `INSTAL` para `DD/MM/YYYY` via `_formatarDataNascimento` — antes os 3 caminhos gravavam em formatos divergentes (ISO no MS2/MS3, BR no PIF, `Date` no MMC). (3) MS2: produto/plano `disabled`, valor `readOnly` — transição de status não troca mais produto acidentalmente. (4) `salvarVenda` rejeita cadastro novo sem canal/responsável. (5) Novo `_propagarFibraParaMovelSeCombo_`: ao editar `cliente`/`CPF`/`endereço`/`contato`/`canal`/`resp` da Fibra, replica no Móvel vinculado ATIVO (status, produto, plano, contrato, datas e portabilidade do Móvel ficam intactos). (6) Nova seção 🔧 Sistema (read-only) no painel mostra `STATUS_PAP`, `VEROHUB`, `VEROHUB_PEDIDO/DT`, `VERO_STATUS`, `CRIADO_EM` (só quando preenchidos). |
| 10/05/2026 10:35 | v546 | **WA Pessoal — fix tracking de respostas com privacidade LID.** Bug: WF2 `Parse e Filtro` usava `body.sender` da Evolution achando que era o phone do remetente da mensagem incoming. Mas `body.sender` é o phone do **dono da instância** (constante = teu número conectado), NÃO do remetente. Por isso match falhava em 100% das respostas com privacidade ON. Fix: voltou a usar `key.remoteJid` — se vem `phone@s.whatsapp.net` faz match exato; se vem `@lid` (privacy ON) ativa `isLid:true` e GAS faz fallback heurístico "disparo enviado mais recente da instância". Documentado no comentário do node. |
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
  - **Exceção permanente: `repararVinculosCombosOrfaos()` fica no `Code.js`** (não no `_arquivo.js`). O problema que ela resolve reincide — vendas perdem o vínculo de combo na aba `Vinculos Vendas` — então a função precisa estar sempre deployada e disponível no dropdown do editor para reparo recorrente. **Não mover de volta para `_arquivo.js`** em limpezas futuras. (movida em 20/05/2026.)

---

## Proximos Passos Naturais

### WA Campanha — pendências

1. ~~**Reescrita de mensagem via Claude API**~~ ✅ 09/05/2026 (v527) — `gerarVariacoesMensagem`
   em `DispPessoalAPI.js`; placeholder `{nome}`/`{cidade}` opcional desde v530. Coluna
   `variacoes_json` (col M).
2. ~~**Envio de imagens nas campanhas**~~ ✅ 10/05/2026 (v536) — upload pra Drive +
   `imagem_url` (col N) + WF1 IF `Tem imagem?` → branch `sendMedia` com caption.

3. **Inbox dentro do CRM** (`~3-5 dias`) — única pendência aberta. Permitir que cada
   usuário responda clientes diretamente pela tela do DharmaPro em vez de pelo WhatsApp
   Web. Componentes:
   - Lista de conversas com last-message + contador de não-lidas
   - Histórico paginado via Evolution `/chat/findMessages/{instance}`
   - Envio de mensagens novas (texto e mídia)
   - Polling ou WebSocket pra mensagens em tempo real
   - Vínculo com lead/cliente do CRM (perfil ao lado da conversa)
   - **Antes de implementar, sessão de planejamento dedicada** com decisões de design
     (polling vs WebSocket, mídia sim/não, layout, scope por instância vs global).

### WA Campanha — features adicionadas fora do roadmap original

- **Log completo de disparos** (09/05/2026, v528): cols K-N em `WA Disparos`
  (`mensagem_enviada`, `message_id`, `entregue_em`, `lido_em`). Modal `📋` no Histórico
  com tabela expansível por contato + ícones `✓`/`✓✓` estilo WhatsApp.
- **UX modais** (v529): confirm/loading nativos do CRM, escapam containing block do
  sidebar via `appendChild(document.body)`.
- **Excluir campanha** (admin only, v530): botão `🗑` no Histórico.
- **Saúde Dashboard** (v538): KPIs hoje vs baseline 7d, alertas anti-ban heurísticos.
- **Toggle bypass janela horário** (admin only, v543): WF1 consulta GAS em tempo real.
- **Auto-conclusão** (v544): campanha vira `concluida` quando esgota pendentes; bolinha
  amarela do menu some sozinha.
- **Tracking de respostas com privacidade LID** (v546): Evolution `key.remoteJid` como
  fonte (LID quando privacy ON), com fallback heurístico no GAS.

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

### Fluxo de vendas — pendências pós-refatoração de 11/05/2026

- **20 ambíguos do `repararVinculosCombosOrfaos`**: CPFs com 2+ Fibras Combo + N Móveis
  (KARINA ALVES, LUCAS SEGANTINI, KARLLET CAROLINA, JANDERSON, SERGIO RICARDO etc) —
  geralmente cancelamentos + renovações. Precisam revisão humana caso a caso.
  Considerar uma aba "Vínculos Pendentes" com botões aprovar/rejeitar no CRM.
- **10 "sem par"** do mesmo reparo: Fibras Combo sem Móvel correspondente na janela de
  7 dias. Investigar se o Móvel existe mais distante temporalmente ou se nunca foi criado.
- **Portabilidade obrigatória só no MMC** (audit §4 item 5): no painel de edição,
  portabilidade pode ser apagada quando produto é Móvel. Tornar obrigatória.
- **Domínio fechado para `VENC` e `FAT`** (audit §4 item 9): hoje texto livre. Migrar
  para enum (Boleto, Débito automático, Cartão, Pix etc).
- **Validação de transição em integrações externas**: `atualizarVendaComNG`/`atualizarVendaComAdapter`
  hoje só normalizam datas e respeitam autoridade externa. Considerar log de warning
  quando pulam de status 1 direto para 3 (operador esqueceu de passar por 2).

### Consultas NG/Adapter — Fase 2 (pendente)

- **Validação final da Fase 1.5**: rodar varredura de 30 vendas (NG, Status 2+3, pausa 8-10s) e confirmar taxa de acerto ≥90% antes de fechar a fase oficialmente.
- **Fase 2 — Background polling automático**:
  - Trigger time-based (talvez 2x ao dia, 09h e 15h) que percorre vendas em status 2 com agenda de instalação para hoje/amanhã e dispara consulta NG/Adapter em background.
  - Quando o script retornar `instalada: true`, atualizar status do DharmaPro automaticamente para "3 - Finalizada/Instalada" + gravar `dataInstalacao` na coluna `INSTAL`.
  - Quando retornar `Contrato cancelado em DD/MM/YYYY`, marcar venda como cancelada (status a definir).
  - Pendência crítica: NG/Adapter rodam **no browser do BKO via extensão Chrome com VPN ativa** — não dá pra rodar via trigger GAS puro. Precisamos decidir arquitetura: agendar um "BKO de plantão" que deixa CRM aberto em horários específicos, OU migrar para chamada API direta (sem scraping) se Vero expuser.
- **Gravar `contrato_vero` na linha da venda durante a primeira consulta bem-sucedida**: hoje a consulta casa por CPF, mas clientes podem ter múltiplos contratos (caso JACQUELINE 006.237.040-56). Gravar o `numContrato` retornado evita ambiguidade em consultas subsequentes — o automático sabe exatamente qual contrato monitorar.
- **Fase 1.6 (hardening adicional, opcional)**: investigar timeouts de "Resultado busca CPF" que ainda apareciam ocasionalmente após várias consultas sequenciais — pode ser rate limit da Vero ou sessão Wing instável. Possível solução: forçar logout+relogin a cada N consultas, ou intervalos maiores entre consultas (já mitigado parcialmente com pausa de 10s).

### Outras pendências do DharmaPro

- rodar `migrarUsuariosParaSheet()` no editor Apps Script para ativar a gestao de usuarios via CRM;
- ~~rodar `configurarTriggerRelatorioDiarioAds()` UMA VEZ no editor Apps Script para ativar o relatório diário automático às 07h~~ ✅ configurado e gravando dados desde 06/05/2026;
- ~~resolver pagamentos pendentes na conta Meta Ads antes de ativar campanhas A/B/C~~ ✅ 28/04/2026;
- ~~resolver erro #1487194 do A2 (Instagram vinculado) antes de editar o anuncio no Ads Manager~~ ✅ 28/04/2026 — creative recriado via API;
- consolidar o workflow WABA final no projeto `disparo-massa`;
- documentar de forma definitiva a captura correta de `messaging_limit_tier`;
- ~~revisar encoding de arquivos HTML/JS antigos~~ ✅ 11/05/2026 — mojibake zerado em `JS.html`;
- rotacionar chaves expostas em testes operacionais.
