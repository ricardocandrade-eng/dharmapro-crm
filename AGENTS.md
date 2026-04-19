<!-- dharmapro-crm | 190426_0218 | AGENTS.md atualizado apos leitura da estrutura real do projeto -->

# DharmaPro CRM

## Visao Geral

**dharmapro-crm** e o CRM operacional de leads, vendas e apoio comercial da
Mobile Digital / Mobile Fibra, revenda oficial da Vero Internet em Juiz de Fora, MG.

O sistema roda em **Google Apps Script + Google Sheets + HTML/JavaScript** e esta
em **producao**. Ele centraliza operacao comercial, atendimento interno, parceiros PAP,
controle financeiro auxiliar, tickets e rastreio de origem de leads.

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
  - usa cache e helpers para reduzir leituras de planilha.

- `Config.js`
  - configuracao central da aplicacao;
  - `DEPLOY_DATE`;
  - usuarios, perfis e menus visiveis;
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

### Frontend principal

- `Index.html`
  - shell desktop principal;
  - login, sidebar, topbar, modais e paginas internas;
  - inclui `Cruzamento.html` e `JS.html`;
  - redireciona mobile para a view `?view=mobile`.

- `JS.html`
  - controlador client-side principal;
  - concentra boa parte da logica da UI: filtros, edicao inline, formularios,
    busca global, efeitos, validacoes, integracoes da interface e fluxos de modais.

### Views HTML do sistema

- `Dashboard.html`: painel KPI com funil, rankings, canais e auto refresh.
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

---

## Abas e Estruturas de Dados

Abas confirmadas no codigo:
- `1 - Vendas`: base principal do CRM.
- `Usuarios`: usuarios e permissoes operacionais.
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
- existe `deploymentId` fixo configurado na pipeline.

Observacao importante:
- `.claspignore` impede envio de arquivos como `.git`, `.clasp.json`, `.claspignore`
  e scripts `.bat`;
- nem todo arquivo auxiliar da pasta vai para o Apps Script;
- sempre separar claramente codigo de runtime GAS de artefatos locais.

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
- integracoes com Assertiva, portais externos e webhooks exigem cuidado adicional.

### 4. Convencao de arquivos

Ao criar artefatos novos:
- usar `nome_do_arquivo_DDMMAA_HHMM.ext`;
- incluir comentario de cabecalho com projeto, data/hora e resumo;
- adaptar comentario ao tipo do arquivo.

---

## Pontos de Atencao ao Editar

### Se a mudanca for no backend

- localizar primeiro se a logica esta em `Code.js`, `MetaAdsAPI.js` ou `ParceirosAPI.js`;
- confirmar impacto em nome de aba, coluna, cache, webhook e payloads;
- verificar se a funcao e chamada por alguma view HTML ou por `google.script.run`.

### Se a mudanca for na UI principal

- olhar `Index.html` e `JS.html` juntos;
- evitar duplicar logica client-side espalhada;
- confirmar se a experiencia desktop e mobile continuam coerentes.

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

## Arquivos Auxiliares e Sensiveis

Arquivos auxiliares detectados fora do runtime principal:
- `dharma_ajustes_130426.md`
- scripts de exportacao de conversas do BotConversa
- artefatos da extensao

Observacao:
- existem scripts auxiliares com finalidade operacional fora do GAS;
- tratar esses arquivos como sensiveis e nao replicar credenciais em novas alteracoes;
- se precisar mexer neles, revisar antes onde o arquivo entra no fluxo real.

---

## Como Trabalhar Neste Projeto

Fluxo recomendado ao iniciar uma tarefa:
1. identificar qual modulo real sera afetado;
2. localizar view HTML + backend correspondente;
3. conferir impacto em Sheets, Drive, webhook ou extensao;
4. fazer mudanca minima e segura;
5. validar efeitos colaterais no fluxo comercial.

Atalho mental util:
- CRM central: `Code.js` + `Index.html` + `JS.html`
- configuracao e permissoes: `Config.js`
- Meta Ads: `MetaAdsAPI.js` + `LeadsMetaAds.html`
- PAP: `ParceirosAPI.js` + `Parceiros.html` + `FilaPAP.html`
- mobile: `Mobile.html`
- financeiro: `Extrato.html`
- suporte interno: `Tickets.html`
- reconciliacao: `Cruzamento.html`

---

## Origem Deste AGENTS

Este arquivo foi consolidado a partir de:
- `G:\Meu Drive\Projetos Claude\AGENTS.md`
- estrutura real da pasta `G:\Meu Drive\Projetos Claude\dharmapro-crm`
- leitura dos arquivos principais do projeto
- manifesto Apps Script e pipeline de deploy

Se a arquitetura mudar, este AGENTS deve ser atualizado antes de novas rodadas
grandes de manutencao.
