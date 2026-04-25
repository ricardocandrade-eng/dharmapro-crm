<!-- dharmapro-crm | AGENTS.md | 25/04/2026 19:42 -->

# DharmaPro CRM

## Visao Geral

**dharmapro-crm** e o CRM operacional de leads, vendas e apoio comercial da
Mobile Digital / Mobile Fibra, revenda oficial da Vero Internet em Juiz de Fora, MG.

O sistema roda em **Google Apps Script + Google Sheets + HTML/JavaScript** e esta
em **producao**. Ele centraliza operacao comercial, atendimento interno, parceiros PAP,
controle financeiro auxiliar, tickets e rastreio de origem de leads.

No fluxo comercial de combos, o backend deve continuar tratando fibra e movel
como duas linhas independentes na aba principal, inclusive para status, relatorios
e automacoes. No frontend, quando existir vinculo estrutural entre essas duas
linhas, a `Lista de Vendas` pode consolidar a exibicao em um unico card visual.
Se essa camada cliente usar normalizacao de texto para agrupar ou comparar
produtos/status, o helper precisa existir no frontend e nao pode depender apenas
da implementacao backend em `Code.js`.
Para combos antigos sem registro na aba `Vinculos Vendas`, o backend pode inferir
agrupamento retroativo apenas em casos inequivocos, mas essa inferencia nao deve
rodar dentro da abertura da `Lista de Vendas`. O caminho seguro atual e preparar
esse cache legado por rotina separada e depois reutilizar o resultado na listagem.
Nos cards agrupados de combo, evitar excesso de cores nos substatus. O padrao
atual usa emoji + texto neutro para cada status secundario, preservando a cor
forte apenas no status principal da venda.

Papel no ecossistema:
- receber e organizar leads vindos de WhatsApp, indicacoes, PAP e Meta Ads;
- servir como CRM principal do time comercial;
- registrar conversoes reais usadas por outras frentes do ecossistema;
- apoiar operacao de campo, parceiros e processos internos.

---

## Arquitetura Real

### Backend principal

- `Code.js`
  - nucleo do backend Apps Script;
  - concentra autenticacao, listagens, salvamentos, dashboard, busca global,
    documentos do Drive, historico, webhook `doPost`, integracoes externas,
    extrato e varias rotinas auxiliares;
  - define `CONFIG` com nomes de abas e mapeamento detalhado de colunas da
    aba principal `1 - Vendas`;
  - usa cache e helpers para reduzir leituras de planilha;
  - contem o modulo completo de Gerenciar Usuarios (ver secao abaixo).

- `Config.js`
  - configuracao central da aplicacao;
  - `DEPLOY_DATE` (atualizado automaticamente pelo bat de deploy);
  - `USUARIOS`: array de usuarios — serve como fallback se a aba Usuarios estiver vazia;
  - `PERFIS_MENUS`: mapeamento perfil → menus permitidos — serve como fallback se
    `PERFIS_MENUS_JSON` nao existir no PropertiesService;
  - metas e parametros do dashboard;
  - mensagem global do sistema;
  - estrutura inicial de tickets.

- `MetaAdsAPI.js`
  - modulo dedicado a `Leads Meta Ads`;
  - registra leads, exporta dados, lista registros e reage a edicoes de status.

- `ParceirosAPI.js`
  - backend do portal de parceiros PAP;
  - autentica parceiro, consulta viabilidade, credito, Assertiva, CEP,
    salva pre-venda, aprova/rejeita e move negocio para `1 - Vendas`.

- `DisparosAPI.js`
  - backend do modulo de Disparos em Massa;
  - le campanhas do Supabase (`v_campaign_stats`).

### Frontend principal

- `Index.html`
  - shell desktop principal;
  - login, sidebar, topbar, modais e paginas internas;
  - inclui `Cruzamento.html` e `JS.html`;
  - redireciona mobile para a view `?view=mobile`.

- `JS.html`
  - controlador client-side principal;
  - concentra logica da UI: filtros, edicao inline, formularios,
    busca global, efeitos, validacoes, integracoes da interface e fluxos de modais;
  - define `_menuMap` e `_menusPermitidos` — base do sistema de permissoes por perfil;
  - contem duas definicoes de `navegar()` (desktop e mobile) — qualquer novo modulo
    deve adicionar a branch `else if` nas duas ocorrencias.

### Fluxo de vendas

Estado atualizado em 25/04/2026:
- `salvarVenda()` nao deve mais assumir que todo frontend envia payload completo;
- em edicoes, o backend agora mescla os dados recebidos com a linha atual antes de regravar;
- isso evita perda silenciosa de campos em fluxos parciais como painel lateral e modais;
- o painel lateral de `Lista de Vendas` agora expoe `Data Ativacao` e `Data Instalacao`;
- a persistencia passou a manter tambem `VEROHUB`, `BC_TAGS`, `BC_STATUS` e `VIABILIDADE`
  quando a venda e atualizada por qualquer fluxo.
- combos com movel agora usam vinculo estrutural em aba `Vinculos Vendas`, sem depender
  de observacao solta na venda;
- `Fibra Combo` sem venda movel vinculada deve exibir alerta visual e botao
  `Duplicar para Movel` no painel lateral.
- a venda movel criada por duplicacao deve entrar em `2- Aguardando Entrega`;
- o alerta `Combo sem movel` deve ocupar a area visual onde o `VeroHub` nao e exibido
  nesse fluxo, evitando ruído ao lado do produto.
- o painel lateral deve permitir navegar entre `Fibra` e `Movel` vinculados
  por links discretos na secao de vinculos.

### Views HTML do sistema

- `Dashboard.html`: painel KPI com funil, rankings, canais, Agente IA e WABA Monitor.
- `Nova_venda.html`: wizard de cadastro de nova venda.
- `LeadsMetaAds.html`: tela operacional da aba `Leads Meta Ads`.
- `FilaPAP.html`: fila de aprovacao de consultas e pre-vendas PAP.
- `Tickets.html`: kanban de tickets com anexos e notificacoes.
- `Extrato.html`: modulo financeiro com importacao XLSX, analise e arquivos em Drive.
- `Docs.html`: navegador de documentos do Google Drive.
- `Indicacoes.html`: gestao de indicacoes e pagamentos associados.
- `Parceiros.html`: portal web dos parceiros/freelancers PAP.
- `Mobile.html`: interface mobile-first com dashboard, lista, funil, PAP e tickets.
- `Cruzamento.html`: conciliacao entre CRM e bases importadas.
- `PainelAds.html`: painel operacional de Meta Ads.
- `Disparos.html`: modulo de Disparos em Massa.
- `Usuarios.html`: painel de Gerenciar Usuarios (admin only) — duas abas: Usuarios e Permissoes por Perfil.

### Cruzamento Vero

Estado atualizado em 25/04/2026:
- a chave principal de comparacao e o `ID Contrato`;
- o frontend normaliza o ID removendo prefixos e caracteres nao numericos
  como `NG`, aspas e sufixo `.0` antes do match;
- a aba de cancelamentos agora consolida `CANCELAMENTO` + `CHURN` do XLS da Vero;
- a aba `MOVEL` do XLS agora possui uma visao propria dentro do CRM;
- a view foi reescrita para evitar textos quebrados e melhorar a leitura operacional.

---

## Modulo Gerenciar Usuarios

Implementado em 24/04/2026. Menu ID: `usuarios`. Visivel apenas para perfil `admin`.

### Fonte de dados

Aba `Usuarios` da planilha principal:
- Coluna A: `usuario` (login key, case-insensitive)
- Coluna B: `senhaHash` (SHA-256 hex)
- Coluna C: `nome`
- Coluna D: `perfil` (admin / supervisor / backoffice)
- Coluna E: `foto` (URL Google Drive thumbnail)
- Coluna F: `ativo` (TRUE / FALSE)

Se a aba estiver vazia ou inacessivel, `validarLogin()` faz fallback automatico
para o array `USUARIOS` do `Config.js`.

### Migracao

Funcao `migrarUsuariosParaSheet()` em `Code.js`:
- rodar UMA VEZ no editor Apps Script;
- idempotente (nao faz nada se a aba ja tiver dados);
- copia os 4 usuarios do `Config.js` com `ativo = TRUE`.

### Permissoes por perfil

- Armazenadas no PropertiesService com chave `PERFIS_MENUS_JSON` (JSON).
- Se ausente, usa `PERFIS_MENUS` do `Config.js` como fallback.
- Editaveis pela aba "Permissoes por Perfil" do painel `Usuarios.html`.
- Entram em vigor no proximo login de cada usuario.
- Para restaurar o padrao do Config.js: deletar `PERFIS_MENUS_JSON` nas propriedades do script.

### API backend (`Code.js`)

| Funcao | Descricao |
|--------|-----------|
| `_getUsuariosSheet_()` | Helper privado: le aba Usuarios, retorna `[]` em erro |
| `_getPerfilMenus_()` | Helper privado: retorna PERFIS_MENUS do PropertiesService ou Config.js |
| `_assertAdmin_(adminUsuario)` | Guard: lanca erro se o usuario nao for admin |
| `getUsuarios(adminUsuario)` | Lista usuarios sem senhaHash |
| `salvarUsuario(adminUsuario, dados)` | Cria ou atualiza usuario |
| `toggleAtivoUsuario(adminUsuario, usuarioAlvo, ativo)` | Ativa/desativa usuario |
| `resetarSenha(adminUsuario, usuarioAlvo, novaSenha)` | Redefine senha via PropertiesService + planilha |
| `excluirUsuario(adminUsuario, usuarioAlvo)` | Remove linha da planilha; bloqueia excluir o proprio admin |
| `getPerfilMenus(adminUsuario)` | Retorna PERFIS_MENUS vigente |
| `salvarPerfilMenus(adminUsuario, perfilMenus)` | Salva PERFIS_MENUS no PropertiesService |
| `migrarUsuariosParaSheet()` | Migracao unica de Config.js para a planilha |
| `getUsuariosHtml()` | Retorna conteudo de Usuarios.html |

### Nota sobre `novaVenda`

O ID `novaVenda` e um alvo interno de `navegar()` vinculado ao ID `formulario`
(menu Nova Venda na sidebar). Nao e exibido na UI de permissoes por perfil.
Sempre incluir `novaVenda` junto com `formulario` no array de menus de qualquer perfil.

---

## Abas e Estruturas de Dados

Abas confirmadas no codigo:
- `1 - Vendas`: base principal do CRM.
- `Usuarios`: usuarios e permissoes — colunas A-F (usuario, senhaHash, nome, perfil, foto, ativo).
- `Historico`: historico de alteracoes.
- `Leads Meta Ads`: leads vindos de Meta Ads com status e motivo.
- `Consultas`: consultas PAP.
- `Pre-Vendas`: fila de pre-vendas PAP.
- `3 - PAP`: base de parceiros PAP.

Observacoes importantes:
- `Code.js` trabalha com mapeamento de muitas colunas da aba `1 - Vendas`;
- o sistema depende de nomes de aba e indices de coluna estaveis;
- antes de alterar planilha, conferir o mapeamento no backend.

---

## Integracoes Confirmadas

### Google Apps Script / Google Workspace

- leitura e escrita em Sheets;
- listagem e armazenamento de arquivos no Google Drive;
- web app publicado via Apps Script.

### Meta Ads

- `MetaAdsAPI.js` registra leads na aba `Leads Meta Ads`;
- esta aba e parte operacional do rastreio de origem e conversao;
- usada como ponte para analise posterior de desempenho real.

### Parceiros PAP

- `Parceiros.html` consome o web app via `fetch`;
- `ParceirosAPI.js` processa a acao recebida no `doPost`;
- fluxo cobre consulta, pre-venda, aprovacao e rejeicao.

### Assertiva

- ha integracao confirmada no backend para consultas por:
  - CPF
  - CNPJ
  - telefone
  - nome
- qualquer alteracao nessa area exige cuidado com token, limites e payloads.

### VeroHub / Adapter / NG Billing

- a UI principal possui configuracoes e modais para VeroHub, Adapter e NG Billing;
- existe uma extensao Chrome dedicada para automatizar parte desse fluxo;
- esta integracao e operacional e deve ser tratada como sensivel.

### Supabase

- projeto `zfunugupwvktcggvicuk`;
- lido pelo Dashboard (WABA Monitor) e pelo modulo Disparos em Massa;
- credencial: PropertiesService `SUPABASE_SERVICE_ROLE`.

### Documentos e anexos

- `Docs.html` lista arquivos do Drive;
- `Extrato.html` salva e recupera arquivos de extrato no Drive;
- `Tickets.html` suporta anexos de print.

---

## Extensao do DharmaPro

Existe uma extensao em `extensao-dharmapro/` com:
- `manifest.json` em MV3;
- `background.js`;
- scripts de conteudo para `adapter.veronet.com.br`;
- loader e scripts para `ng.vero.objective.com.br`.

Ha tambem artefatos auxiliares:
- `Manual_Extensao_DharmaPro.pdf`
- `extensao-dharmapro.rar`
- `cdn/content-ng.txt`

Uso pratico:
- automacao de consultas em sistemas externos;
- apoio a fluxos de Adapter e NG Billing;
- qualquer manutencao nessa camada deve considerar risco operacional e de login.

---

## Deploy e Publicacao

Arquivos de deploy observados:
- `appsscript.json`
- `.clasp.json`
- `.claspignore`
- `.github/workflows/deploy.yml`
- `update_deploy.ps1`
- `deploy.log`

Fatos confirmados:
- runtime Apps Script: `V8`;
- timezone: `America/Sao_Paulo`;
- web app:
  - `executeAs: USER_DEPLOYING`
  - `access: ANYONE_ANONYMOUS`
- deploy automatizado via GitHub Actions com `clasp push --force`;
- workflow atualiza `DEPLOY_DATE` em `Config.js` antes do deploy;
- `deploymentId` fixo: `AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw`
- depois de qualquer ajuste em producao, validar sincronismo entre pasta local,
  `git status` e ultimo `clasp push/deploy`.

Fluxo manual de deploy:
```bash
clasp push --force
clasp version "descricao"
clasp deploy --deploymentId AKfycbyOB1HP_wIn0Haxw14npDgY7imWJL7wCEDvrnrVvU8WiXyDwXWa36PAo7Kd06sxEoMTKw --description "descricao"
```

---

## PropertiesService — Chaves Relevantes

| Chave | Descricao |
|-------|-----------|
| `CRM_SPREADSHEET_ID` | ID da planilha principal |
| `SUPABASE_SERVICE_ROLE` | Chave de servico do Supabase |
| `META_ACCESS_TOKEN` | Token da Meta Ads API |
| `PERFIS_MENUS_JSON` | Permissoes por perfil editadas via CRM (JSON); ausente = usa Config.js |
| `pwd_<usuario>` | Hash SHA-256 de senha alterada pelo usuario ou pelo admin |
| `auth_lock_<usuario>` | Flag de bloqueio por tentativas excessivas (30 min) |
| `auth_fail_<usuario>` | Contador de falhas de login (janela 15 min) |

---

## Regras Obrigatorias

### 1. Performance em GAS

- nunca ler planilha inteira sem necessidade;
- sempre preferir intervalos especificos e colunas conhecidas;
- manter padrao SWR quando a UI precisar de resposta rapida;
- manter Optimistic UI nas escritas quando o fluxo permitir;
- `LockService` deve ficar fora de chamadas externas lentas.

### 2. Compatibilidade com producao

- este sistema e usado no dia a dia comercial;
- evitar refactors grandes sem necessidade clara;
- preservar nomes de abas, ids de view, contratos de funcoes e payloads;
- quando possivel, evoluir por acrescimo e nao por substituicao agressiva.

### 3. Seguranca

- credenciais nunca devem ser hardcoded em codigo novo;
- preferir PropertiesService, ambiente externo ou cofre de senhas;
- integracoes com Assertiva, portais externos e webhooks exigem cuidado adicional;
- todas as funcoes da API de usuarios passam por `_assertAdmin_()` antes de executar.

### 4. Convencao de arquivos

Ao criar artefatos novos:
- usar `nome_do_arquivo_DDMMAA_HHMM.ext`;
- incluir comentario de cabecalho com projeto, data/hora e resumo;
- adaptar comentario ao tipo do arquivo.

### 5. Adicionar novo modulo ao CRM

Passos obrigatorios:
1. Criar `NomeModulo.html`;
2. Adicionar `getNomeModuloHtml()` em `Code.js`;
3. Adicionar ID do menu no `PERFIS_MENUS` de `Config.js`;
4. Adicionar entrada em `_menuMap` no `JS.html`;
5. Adicionar item `<div class="nav-item">` no sidebar em `Index.html`;
6. Adicionar container `<div id="pageNomeModulo">` em `Index.html`;
7. Adicionar branch `else if (pagina === 'nomeModulo')` nas **duas** ocorrencias
   de `navegar()` em `JS.html` (linhas ~1343 e ~6444).

---

## Pontos de Atencao ao Editar

### Se a mudanca for no backend

- localizar primeiro se a logica esta em `Code.js`, `MetaAdsAPI.js`, `DisparosAPI.js` ou `ParceirosAPI.js`;
- confirmar impacto em nome de aba, coluna, cache, webhook e payloads;
- verificar se a funcao e chamada por alguma view HTML ou por `google.script.run`.

### Se a mudanca for na UI principal

- olhar `Index.html` e `JS.html` juntos;
- evitar duplicar logica client-side espalhada;
- confirmar se a experiencia desktop e mobile continuam coerentes;
- `navegar()` existe em DOIS lugares em `JS.html` — sempre alterar os dois.

### Se a mudanca for em permissoes

- `PERFIS_MENUS` em `Config.js` e o padrao base;
- `PERFIS_MENUS_JSON` no PropertiesService sobrescreve o padrao em runtime;
- o painel `Usuarios.html` edita o PropertiesService, nao o Config.js;
- `novaVenda` deve sempre acompanhar `formulario` nos arrays de menu.

### Se a mudanca for em PAP

- revisar `Parceiros.html` e `ParceirosAPI.js` em conjunto;
- lembrar que aprovacao de pre-venda pode alimentar `1 - Vendas`.

### Se a mudanca for em Meta Ads

- revisar `LeadsMetaAds.html` e `MetaAdsAPI.js`;
- nao quebrar colunas, status, timestamps e exportacoes.

### Se a mudanca envolver integracao externa

- checar timeouts, autenticacao, risco de bloqueio e impacto no usuario final;
- se houver extensao envolvida, revisar tambem `extensao-dharmapro/`.

---

## Atalho Mental por Area

| Area | Arquivos |
|------|----------|
| CRM central | `Code.js` + `Index.html` + `JS.html` |
| Configuracao e permissoes | `Config.js` + PropertiesService `PERFIS_MENUS_JSON` |
| Usuarios e acessos | `Usuarios.html` + funcoes `*Usuario*` e `*PerfilMenus*` em `Code.js` |
| Meta Ads | `MetaAdsAPI.js` + `LeadsMetaAds.html` |
| PAP | `ParceirosAPI.js` + `Parceiros.html` + `FilaPAP.html` |
| Disparos em Massa | `DisparosAPI.js` + `Disparos.html` |
| Dashboard / WABA | `Dashboard.html` + Supabase `zfunugupwvktcggvicuk` |
| Mobile | `Mobile.html` |
| Financeiro | `Extrato.html` |
| Suporte interno | `Tickets.html` |
| Reconciliacao | `Cruzamento.html` |

---

## Arquivos Auxiliares e Sensiveis

- `dharma_ajustes_130426.md`: registro de ajustes anteriores
- scripts de exportacao de conversas do BotConversa
- artefatos da extensao

Observacao:
- existem scripts auxiliares com finalidade operacional fora do GAS;
- tratar esses arquivos como sensiveis e nao replicar credenciais em novas alteracoes.

---

## Como Trabalhar Neste Projeto

Fluxo recomendado ao iniciar uma tarefa:
1. identificar qual modulo real sera afetado;
2. localizar view HTML + backend correspondente;
3. conferir impacto em Sheets, Drive, webhook ou extensao;
4. fazer mudanca minima e segura;
5. validar efeitos colaterais no fluxo comercial.
