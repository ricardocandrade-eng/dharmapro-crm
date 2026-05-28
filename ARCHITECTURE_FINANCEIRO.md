# Arquitetura — Módulo Financeiro

**Data:** 21/05/2026 (rev 4 — §11.9 resolvida: fórmula confirmada via reverse-engineering do extrato de março)
**Sessão:** Cowork (Claude desktop) → Claude Code (rev 4)
**Status:** Design — pré-implementação. 9 decisões fechadas (§11). §11.9 RESOLVIDA (Cenário 1 confirmado, com 3 correções ao modelo de Móvel). Pronto para Fase 1.

**Escopo declarado:** painel financeiro cobre apenas **B2C Fibra + Móvel** (Alone e Combo). **Ficam de fora:** EPON, B2B e Móvel avulso. Esses dados podem ser visíveis em outras telas operacionais (Lista, Funil etc.), mas não entram na projeção/conciliação/risco do painel. Acesso: **admin only**.

---

## 1. Propósito do documento

Este é o norte da próxima fase do DharmaPro: trazer a contabilidade da Vero **para dentro do CRM** e transformar o sistema de "registro de vendas" em **sistema de previsibilidade de caixa**.

A palavra-chave é **PREVISIBILIDADE**. O painel financeiro precisa responder, em qualquer instante:

- Quanto vou receber nos próximos 4 meses, decomposto por mês?
- Quais clientes estão na janela de ação (inadimplência 30-90d) e qual o valor exposto?
- A Vero pagou o que a gente esperava neste mês? Onde divergiu?
- A operação está saudável (estrelas, churn, HUB, disciplina de cancelamento)?

Cada decisão de design abaixo serve a essas 4 perguntas.

---

## 2. Princípios arquiteturais

### 2.1. Códigos da Vero como chave primária

Codes não variam, nomes variam. Toda a contabilidade da Vero — extrato, pontuação, inadimplência, churn — referencia plano por código (`4624`, `4390` etc.). O CRM precisa armazenar o código resolvido **na própria linha da venda** (não derivado em tempo de leitura) para que relatórios históricos não dependam do estado atual do dicionário.

**Onde o código aparece:** em todos os módulos operacionais do CRM (Lista, Funil, Painel Lateral, Extrato, Inadimplência, Conciliação, Dashboard financeiro).

**Onde NÃO aparece:** Renata (agente IA) e landing page (ofertasverointernet). Esses dois consomem o `planos_vero.json` via endpoint público `?action=planos` — cliente final não precisa ver código interno.

### 2.2. Decomposição econômica obrigatória

Todo combo é tratado como **duas posições econômicas independentes**:

```
Venda combo retail "VERO MAIS 800MB + HBO MAX + MÓVEL 20GB" (preço cliente)
├─ Posição Fibra (linha em 1 - Vendas, produto = "Fibra Combo")
│  ├─ COD_PLANO_FIBRA: 4279
│  ├─ PONTOS_FIBRA: 70 (Pontos BL — da tabela de pontuação por segmentação)
│  └─ Receita Vero esperada: pontos_BL × fator do mês ± adimplência
└─ Posição Móvel (linha vinculada em 1 - Vendas, produto = "Móvel Combo")
   ├─ COD_PLANO_MOVEL: 4390
   ├─ PONTOS_MOVEL_COMBO: 40 (20GB — da tabela de pontuação, NÃO é R$)
   └─ Receita Vero esperada: pontos_móvel × fator do mês (= 40 × 2,6 = R$ 104)
```

Razão: a Vero apura em duas linhas separadas no extrato (`Instalações BL` = Σ Pontos BL × fator + `Móvel` = Σ Pontos Móvel Combo × fator) — **mas ambas usam o mesmo fator do mês** (ver §11.9, fórmula confirmada pelo extrato de março). Estornos, churn, inadimplência, suspensão — tudo é apurado por contrato, e Fibra/Móvel em combo têm contratos distintos. O modelo atual do CRM (duas linhas em `1 - Vendas` unidas por vínculo em `Vinculos Vendas`) **já está correto estruturalmente** — o que falta é trancar a invariante "combo SEMPRE tem as duas linhas".

> **Correção rev 4:** o desenho original tratava o Móvel combo como R$ absoluto (R$ 40, sem fator). O reverse-engineering do §11.9 mostrou que o Móvel combo é pago `pontos × fator` igual à Fibra. Os valores 25/40/85 são **pontos** (10/20/60GB), não reais.

### 2.3. Reconciliação, não replicação

O CRM **não recalcula** a folha de pagamento da Vero. Recalcular significaria modelar todas as regras da Carta de Meta (descontos por churn por aging, multas CN Vendas, bônus HUB, adimplência diferida etc.) e manter sincronizado mês a mês — alto custo, alta fragilidade.

Em vez disso, o CRM:
1. **Calcula uma expectativa** com regra simplificada (pontos × fator vigente + Móvel R$).
2. **Importa o realizado** do extrato mensal sob demanda (Cruzamento auto já lê parte do XLSX — vai ser estendido).
3. **Mostra divergências** como tarefas operacionais ("contrato X cobrado a menos: R$ Y") em vez de mascarar com fórmulas internas.

A regra é: **a Vero é a verdade contábil; o CRM é a verdade operacional e o auditor da Vero.**

### 2.4. Camadas de sinal

Inadimplência tem dois canais com resoluções distintas:

| Fonte | Frequência | Profundidade | Uso |
|---|---|---|---|
| Aba SAFRA do relatório diário | Diária (Cruzamento auto 09h) | Janela recente, baixa resolução | Sinal contínuo: dispara alertas, atualiza estado da linha |
| Relatório completo sob demanda | Quando o Ricardo pede ao gestor Vero | 7 meses, alta resolução (Faixa de Risco, Never Paid, Aging detalhado) | Refresh profundo: reclassifica risco, popula campos enriquecidos |

O CRM correlaciona os dois: SAFRA mantém o estado vivo; relatório completo recalibra os campos pesados. Quando o Ricardo importar um novo relatório completo, ele sobrescreve os campos de risco; o SAFRA diário só atualiza estado de pagamento.

### 2.5. JSONs no Drive como fundação versionada

Padrão já estabelecido por `planos_vero.json`, `planos_vero_codigos.json` e `cidades_vero.json`: dicionários pequenos, baixa frequência de mudança, cacheados 600s pelo backend, editáveis via helper one-shot. Vamos seguir o mesmo padrão para `pontuacao_planos.json` e `cartas_meta_pap.json`.

---

## 3. Fontes de dados

### 3.1. Espelhos da Vero (entrada)

| Arquivo | Origem | Frequência | Canal | Já importado? |
|---|---|---|---|---|
| Espelho mensal "SNIPER MOBILE" (xlsx) | Vero — relatório diário | Diária | Gmail (label `vero-sniper`) → `CruzamentoAutoAPI.js` | Sim, 09h |
| Extrato fechado "SNIPER MOBILE 〈mês〉" (xlsx) | Vero — gestor | Mensal pós-fechamento | **Upload manual via frontend** (tela admin) | Não |
| Relatório de inadimplência (xlsx) | Vero — gestor | Sob demanda | **Upload manual via frontend** (tela admin) | Não |
| Tabela de pontuação (xlsx) | Vero — gestor | Mensal (quando há reajuste) | **Upload manual via frontend** (tela admin) | Não |
| Carta de Meta PAP (pdf) | Vero — gestor | Mensal (recebe até dia 10) | **Upload manual via frontend** (tela admin) | Não |

**Decisão arquitetural (decisão 4 e 5 do Ricardo):** o **único** canal automático de e-mail é o espelho diário (que já funciona). Os outros 4 arquivos chegam mensalmente sem dificuldade de obtenção — o overhead de configurar label Gmail + heurística de detecção + idempotência não compensa. Importação é manual via UI:

- 4 telas admin de upload (uma por tipo de arquivo).
- Cada tela aceita o xlsx/pdf, valida heurística (presença das abas/seções esperadas), gera **preview da mudança** (linhas afetadas, divergências), exige confirmação antes de aplicar.
- Padrão de UX consistente com o botão `📧 Buscar último da Vero` existente no Cruzamento Vero, mas substituindo "buscar Gmail" por "selecionar arquivo".

**Identificação por conteúdo, não por nome:** mesmo com upload manual, o parser valida o tipo do arquivo pelas abas (espelho tem `VENDAS`/`INSTALACOES`/`CANCELAMENTO`/`MOVEL`; extrato tem `RESUMO COMPLETO`/`BD_INSTALAÇÃO`/`Bônus Quinzenal`/`HUB`/`Pagamentos`; inadimplência é mono-aba com colunas `Faixa de Risco`/`Never Paid`/`Aging`). Erro de upload (arquivo errado na tela errada) rejeitado com mensagem clara.

### 3.2. Fontes internas (saída/operação)

| Tabela | Local | Função |
|---|---|---|
| `1 - Vendas` (existente) | Sheets | Linha de venda — vai ganhar colunas econômicas (ver §5) |
| `Vinculos Vendas` (existente) | Sheets | Liga Fibra-mãe a Móvel-filha em combo |
| `Espelho Vero` (nova) | Sheets | Snapshot da última importação SAFRA + cancelamentos + churn |
| `Extrato Vero` (nova) | Sheets | Detalhamento por contrato do último extrato mensal fechado |
| `Inadimplencia Vero` (nova) | Sheets | Snapshot da última importação de inadimplência (substitui na próxima) |
| `Inadimplencia Historico` (nova) | Sheets | Versão histórica preservada (para análise de tendência) |
| `Conciliacao Mensal` (nova) | Sheets | Saída do cruzamento expectativa × realizado |

### 3.3. JSONs de fundação (Drive)

| Arquivo | Já existe? | Função |
|---|---|---|
| `planos_vero.json` | Sim | Preços para o cliente, segmentação por cidade |
| `planos_vero_codigos.json` | Sim | Tradução código numérico ↔ nome canônico |
| `cidades_vero.json` | Sim | Sistema/segmentação/rede neutra |
| `pontuacao_planos.json` | **Não — criar** | Pontuação por código + segmentação |
| `cartas_meta_pap.json` | **Não — criar** | Fator do mês, regras de desconto, metas |

---

## 4. Estrutura dos novos JSONs

### 4.1. `pontuacao_planos.json`

Mapeamento código × segmentação → pontos e valor R$ Móvel. Snapshot mensal (substituído quando a Vero reajusta a tabela de pontuação).

```json
{
  "_meta": {
    "versao": "1.0",
    "vigencia_inicio": "2026-05-01",
    "vigencia_fim": null,
    "fonte": "Tabela de Pontuação Vero 04.05.2026",
    "gerado_em": "2026-05-21T..."
  },
  "planos": [
    {
      "codigo": "4279",
      "nome_crm": "VERO MAIS 800MB + HBO MAX + MÓVEL 20GB",
      "produto_tipo": "FIBRA_COMBO",
      "pontuacao_bl": {
        "ESPECIAL": 70,
        "OURO": 70,
        "PRATA": 70,
        "PADRAO": 70
      },
      "movel_vinculado": {
        "codigo": "4390",
        "pontos_movel_combo": 40,
        "franquia_gb": 20
      }
    },
    {
      "codigo": "4390",
      "nome_crm": "VERO CONTROLE 20GB COMBO",
      "produto_tipo": "MOVEL_COMBO",
      "pontuacao_bl": null,
      "pontos_movel_combo": 40,
      "franquia_gb": 20
    },
    {
      "codigo": "4XXX",
      "nome_crm": "VERO CONTROLE 10GB",
      "produto_tipo": "MOVEL_ALONE",
      "pontuacao_bl": null,
      "pontos_movel_combo": 25,
      "franquia_gb": 10
    }
  ]
}
```

**Notas (rev 4 — Móvel passou de `valor_rs` para `pontos_movel_combo`):**
- Plano Fibra Alone tem `pontuacao_bl` por segmentação e `movel_vinculado: null`.
- Plano Fibra Combo tem `pontuacao_bl` (pontos da Fibra) por segmentação e referencia o Móvel (com `pontos_movel_combo`). A receita do combo = `(pontuacao_bl + pontos_movel_combo) × fator`.
- Plano Móvel (Alone ou Combo) tem `pontos_movel_combo` direto, `pontuacao_bl: null`. **Esses pontos são multiplicados pelo fator do mês** (não são R$ — ver §11.9). Mapa de franquia: 10GB=25, 20GB=40, 60GB=85.
- Segmentação `ESPECIAL` é o mesmo `ESPECIAIS` do `planos_vero.json` — padronizar nomenclatura. Na prática quase todos os planos têm os 4 valores iguais; exceções reais observadas na tabela 24.03/04.05: `MUNDO FIBRA 550 + ASSISTÊNCIA` (95/97/97/97), `MUNDO FIBRA 750` (95/98/98/98), `VERO MAIS 550 + 10GB` (95/92/92/92).
- **Fonte (decisão §11.9):** semear pelos pontos reais por IDPLANO do `BD_INSTALAÇÃO`; Tabela de Pontuação 04.05 como cross-check e para planos ausentes do extrato.
- Quando a Vero envia nova tabela, o arquivo é substituído; o anterior fica no histórico do Drive. Vendas já lançadas guardam o snapshot dos **pontos que foram pagos** (ver §5), então mudança de tabela não retroage.

### 4.2. `cartas_meta_pap.json`

Snapshot mensal da Carta de Meta. Cada mês é uma entrada; o backend resolve o mês de competência da venda para achar o fator correto.

```json
{
  "_meta": {
    "versao": "1.0",
    "gerado_em": "2026-05-21T..."
  },
  "cartas": [
    {
      "mes_competencia": "2026-05",
      "vigencia_inicio": "2026-05-01",
      "vigencia_fim": "2026-05-31",
      "estrelas": [
        { "tier": "2_ESTRELAS", "pontos_min": 0,    "pontos_max": 49,   "fator_base": 2.0, "adimplencia_diferida": 0.4 },
        { "tier": "3_ESTRELAS", "pontos_min": 50,   "pontos_max": 249,  "fator_base": 2.6, "adimplencia_diferida": 0.4 },
        { "tier": "4_ESTRELAS", "pontos_min": 250,  "pontos_max": 569,  "fator_base": 2.9, "adimplencia_diferida": 0.4 },
        { "tier": "5_ESTRELAS", "pontos_min": 570,  "pontos_max": 899,  "fator_base": 3.2, "adimplencia_diferida": 0.4 },
        { "tier": "6_ESTRELAS", "pontos_min": 900,  "pontos_max": 1699, "fator_base": 3.5, "adimplencia_diferida": 0.4 },
        { "tier": "PRIME_VERO", "pontos_min": 1700, "pontos_max": null, "fator_base": 3.8, "adimplencia_diferida": 0.4 }
      ],
      "movel_pontos": {
        "10GB": 25,
        "20GB": 40,
        "30GB": 55,
        "60GB": 85
      },
      "metas": {
        "bl": 41,
        "movel": 29,
        "churn": 0,
        "du_bl": 1.8,
        "du_movel": 1.3,
        "du_total": 22.5
      },
      "regras": {
        "churn_voluntario_aging": [
          { "ate_dias": 30,  "desconto_pct": 100 },
          { "ate_dias": 60,  "desconto_pct": 50 },
          { "ate_dias": 90,  "desconto_pct": 40 },
          { "ate_dias": null, "desconto_pct": 30 }
        ],
        "churn_involuntario_ate_dias": 180,
        "churn_involuntario_desconto_pct": 100,
        "inadimplencia_primeira_fatura_pct": 100,
        "suspensao_ate_dias": 180,
        "suspensao_desconto_pct": 100,
        "cncl_comercial_threshold_pct": 5,
        "cncl_comercial_bonus_multa_pct": 7.5,
        "hub_tolerancia_pct": 5,
        "hub_excedente_desconto_pct": 50
      }
    }
  ]
}
```

**Notas:**
- Cada `mes_competencia` é uma entrada independente. Histórico é preservado para auditoria/recalibração.
- Quando o Ricardo recebe a carta do mês (até dia 10), faz upload via tela admin `◇ Cartas de Meta` (§9.4). Não há helper one-shot — é tela com upload de pdf + parser com fallback para formulário manual.
- As `regras` são modeladas mas **o CRM não recalcula descontos** — elas servem para o painel **explicar** discrepâncias do extrato ("contrato X teve desconto de 50% porque churn entre 31-60d") em vez de recalcular.

> **Correção rev 5 (carta real de maio/2026):** o exemplo acima foi ajustado ao PDF real:
> - **Tiers de estrela são por NÚMERO DE INSTALAÇÕES no mês, não por pontos** — o JSON usa `instalacoes_min`/`instalacoes_max` (validado: março teve Instalação+Móvel=75 → 3 estrelas/50-249 → fator base 2,6). Fatores base: 2★=2,0 · 3★=2,6 · 4★=2,9 · 5★=3,2 · 6★=3,5 · Prime=3,8 (todos +0,4 de adimplência diferida = `fator_total`).
> - **Móvel**: combo = pontos × fator (`movel_combo_aplica_fator=true`); **avulso (chip avulso Vero Controle) = pontuação flat sem fator** (`movel_alone_aplica_fator=false`); chip adicional = R$15 flat após ativação.
> - **Churn voluntário** real: 0-90d=100% · 91-120d=50% · 121-150d=40% · 151-181d=30% (não os ranges 30/60/90 do exemplo original).
> - Metas maio: BL=41, Móvel=29, Churn=0, DU BL=1,8, DU Móvel=1,3, Dias Úteis=22,5. HUB tolerância 5% (excedente −50%). CNCL comercial: <5% = +7,5% bônus / >5% = −7,5% multa.
> - Arquivo real gerado: `cartas_meta_pap.json` (rev1, só maio). Reader em `Code.js`: `getCartaDoMes`, `resolverEstrelaPorInstalacoes`.

---

## 5. Schema — novas colunas em `1 - Vendas`

Hoje `1 - Vendas` tem 46 colunas (A-AT). Vamos estender com colunas econômicas. Convenção: append no final, sem deslocar nada, mantendo retrocompat com tudo o que já lê os índices fixos.

| Nova coluna | Índice | Header | Tipo | Quem grava | Quando |
|---|---|---|---|---|---|
| AU | 46 | `COD_PLANO` | string | Backend (`salvarVenda`) | No save, via reverse-lookup em `planos_vero_codigos.json` |
| AV | 47 | `PONTOS_VENDA` | number | Backend | No save, via `pontuacao_planos.json` (`pontuacao_bl`) × `SEGMENTACAO` da venda. É o Pontos BL da Fibra |
| AW | 48 | `PONTOS_MOVEL` | number | Backend | No save, se produto é Móvel (Alone ou Combo) — `pontos_movel_combo` do `pontuacao_planos.json`. É **pontos** (multiplicar por fator), não R$ |
| AX | 49 | `MES_COMPETENCIA` | string `YYYY-MM` | Backend | No save (status ≥ 2) ou na instalação — define qual Carta de Meta aplica |
| AY | 50 | `ESTRELAS_NO_MES` | string | Backend ou import | Resolvido no fechamento do mês via `cartas_meta_pap.json` + pontuação total |
| AZ | 51 | `FATOR_APLICADO` | number | Importação extrato | No import do extrato mensal — é o que a Vero efetivamente usou |
| BA | 52 | `RECEITA_PREVISTA` | number | Backend (calc) | Calculada: `PONTOS_VENDA × FATOR` (Fibra) ou `PONTOS_MOVEL × FATOR` (Móvel) — ambos usam o fator do mês (§11.9) |
| BB | 53 | `RECEITA_REALIZADA` | number | Importação extrato | Do extrato mensal — pode ter desconto/multa |
| BC | 54 | `STATUS_ADIMPL_90D` | enum | Importação extrato (M+3) | `EM_DIA` / `INADIMPLENTE_90D` / `ADIMPLENTE_90D_LIBERADO` |
| BD | 55 | `STATUS_CHURN` | enum | Importação espelho/extrato | `ATIVO` / `CHURN_VOLUNTARIO` / `CHURN_INVOLUNTARIO` / `CANCELADO_COMERCIAL` |
| BE | 56 | `STATUS_SUSPENSAO` | enum | Importação espelho/extrato | `NORMAL` / `SUSPENSO_<dias>` |
| BF | 57 | `FAIXA_RISCO` | int 1-6 | Importação inadimplência | Da coluna `Faixa de Risco` do relatório completo |
| BG | 58 | `NEVER_PAID` | bool | Importação inadimplência | Coluna `Never Paid` |
| BH | 59 | `AGING_DIAS` | int | Importação inadimplência ou SAFRA | Dias em atraso da fatura mais antiga |
| BI | 60 | `ULTIMO_REFRESH_RISCO` | datetime | Importação inadimplência | Timestamp do último refresh profundo |
| BJ | 61 | `ORIGEM_CONTRATO_VERO` | enum | Importação | `HUB` / `ADP` / `ADAPTER` / `NG` / `SIMETRA` — sistema de origem na Vero |
| BK | 62 | `MES_REF_VENDA` | string | Importação extrato | `M0` / `M-1` / `M-2` ... — vintage da venda |
| BL | 63 | `CLASSIFICACAO_CLUSTER` | string | Importação | Segmentação reportada pela Vero (pode divergir do CRM) |

`TOTAL_COLUNAS: 46 → 63`.

**Observação sobre snapshot vs. live:**
- `COD_PLANO`, `PONTOS_VENDA`, `PONTOS_MOVEL`, `MES_COMPETENCIA` são **snapshots** no momento da venda — não se atualizam quando o JSON muda. Garante que vendas históricas mantenham os pontos pelos quais foram apuradas.
- `ESTRELAS_NO_MES`, `FATOR_APLICADO`, `RECEITA_REALIZADA`, status de adimplência/churn/suspensão são **live** — vão sendo atualizados pela importação mensal do extrato e SAFRA diário.

---

## 6. Invariantes de integridade — Sprint Integridade de Vendas

Esta é a primeira coisa a ser feita, antes do painel financeiro. Toda invariante abaixo precisa ser **garantida pelo backend** em **todos os caminhos de gravação**, não só no formulário Nova Venda.

### 6.1. Lista de invariantes

| # | Regra | Aplicação |
|---|---|---|
| INV-01 | Toda venda Fibra Combo tem uma venda Móvel vinculada ativa em `Vinculos Vendas` | Save de Fibra Combo (cadastro ou edição); validar no `salvarVenda` server-side |
| INV-02 | Toda venda Móvel Combo tem uma venda Fibra Combo mãe ativa | Save de Móvel Combo; validar mãe existe e está ATIVO |
| INV-03 | Nenhuma venda pode trocar produto de Fibra Alone → Fibra Combo sem criar Móvel | Edição via painel lateral — interceptar mudança de produto |
| INV-04 | Nenhuma venda pode ir de status 1 → 2 sem `dataAtiv`, `contrato`, `agenda`, `turno` | Já existe em `_validarTransicaoStatusServer_` — auditar cobertura |
| INV-05 | Nenhuma venda pode ir de status 2 → 3 sem `instal` E vir obrigatoriamente de 2 | Já existe — auditar |
| INV-06 | Toda venda em status ≥ 2 tem `COD_PLANO` resolvido (não vazio) | Garantir no save com fallback de aviso visual se não resolveu |
| INV-07 | Toda venda Móvel (Alone ou Combo) tem `linhaMovel` preenchida | Validar no save |
| INV-08 | Toda venda Fibra (Alone ou Combo) tem `contrato` preenchido em status ≥ 2 | Já validado em INV-04 |
| INV-09 | `FORMA_PAGAMENTO` ∈ {BOLETO, RECORRENTE} para cadastros novos | Já existe desde v562 — auditar |
| INV-10 | `VENC` ∈ {05, 10, 13, 19} para cadastros novos | Dropdown desde v562, valores legados marcados — manter |
| INV-11 | Combo herda `FORMA_PAGAMENTO`, canal, responsável da Fibra-mãe para o Móvel | Existe em `_COMBO_PROPAGAVEIS_` — auditar |
| INV-12 | Webhook BotConversa nunca cria combo (sempre Fibra Alone) | Auditar `doPost` rota default — confirmar |
| INV-13 | Integrações externas (NG/Adapter) não trocam produto | Já são read-only do contrato, mas conferir |
| INV-14 | `CRIADO_POR` imutável após primeiro save | Já existe em `_mesclarDadosVendaComLinhaAtual_` — manter |
| INV-15 | `MES_COMPETENCIA` é fixado na transição para status 2 (ou na instalação se preferir M de instalação) | A decidir com Ricardo: vintage por venda ou por instalação |

### 6.2. Caminhos de cadastro a auditar

Todos os 7 portões de entrada precisam respeitar as invariantes:

1. **Nova Venda (form Index.html)** — v572 já tem card inline de Móvel Combo, mas o save server-side precisa **rejeitar** se Fibra Combo veio sem Móvel resolvido.
2. **Painel lateral em edição (`pifSalvar`)** — mudança de produto Fibra Alone → Fibra Combo deve disparar criação do Móvel ou rejeitar o save. Hoje a lógica de auto-criação só existe em cadastro novo.
3. **Webhook BotConversa (`doPost` rota default)** — confirmar que nunca chega payload com `produto: 'Fibra Combo'`. Se chegar, criar Móvel inferido ou marcar como "Vínculo Pendente" automático.
4. **Drag-and-drop no funil (`moverVendaFunil`)** — não muda produto, mas se a venda já está Fibra Combo sem Móvel, **deveria rejeitar o move para status ≥ 2** com toast "complete o vínculo de Móvel antes".
5. **Mover lead aguardando (`moverLeadAguardando`)** — mesmo critério acima.
6. **Integrações NG/Adapter (`atualizarVendaComNG/Adapter`)** — não tocam produto, OK.
7. **PAP (botão Pagar)** — não cria venda, OK.

### 6.3. Backfill do legado

Existe dívida histórica: 20 ambíguos + 10 sem par no `repararVinculosCombosOrfaos`. A página `Vínculos Pendentes` continua sendo a ferramenta de triagem dessa dívida — mas após a Sprint Integridade, **nenhuma venda nova deve cair lá**. Métrica de sucesso: `Vínculos Pendentes` vai a zero e fica em zero por 30 dias consecutivos.

### 6.4. Saída da sprint

- Backend rejeita combo sem Móvel em todos os caminhos.
- Backfill: `repararVinculosCombosOrfaos` rodado uma última vez; resíduo triado manualmente via `Vínculos Pendentes`.
- Métrica de monitoramento: alerta no sino 🔔 se um combo órfão aparecer em status ≥ 2.

---

## 7. Pipelines de importação

Dois canais distintos:
- **Automático (Gmail)** — só o espelho diário, já implementado em `CruzamentoAutoAPI.js`. Não mexer no que funciona.
- **Manual (upload via UI)** — todos os outros 4 arquivos. Pipeline reusa o parser/conversor de xlsx existente em `CruzamentoAutoAPI.js`, mas chamado a partir das telas admin de upload.

### 7.1. Pipeline existente — espelho diário (estender com SAFRA) ✅ IMPLEMENTADO 26/05/2026

Trigger 09h via `importarRelatorioVeroAutomatico`, label `vero-sniper`. Lê VENDAS/INSTALACOES/CANCELAMENTO/MOVEL **+ SAFRA** (adicionada na Fase 4). Atualiza `VERO_STATUS` + propõe correções via Cruzamento Vero **+ aplica SAFRA em `1 - Vendas`** (4 campos econômicos live: BC/BD/BE/BH).

**Aba SAFRA — shape** (1670 linhas × 18 cols na amostra de 26/05):

| Col | Tipo | Uso na Fase 4 |
|---|---|---|
| `CONTRATO` (col 2) | string `NG\d+` | Chave de join (normalizada via `_cruzNormIdServer_`) |
| `STATUS_CONTRATO` (col 3) | enum | Mapeia pra `STATUS_SUSPENSAO` + `STATUS_CHURN` (§5) |
| `DIAS ATRASO` (col 14) | int | Compõe `AGING_DIAS` (max entre faturas em aberto) |
| `PAGAMENTO` (col 12) | data ou vazio | Vazio = fatura em aberto (entra no aging) |
| (demais 14 cols) | meta | Não usadas nesta fase; podem alimentar a aba `Espelho Vero` no futuro |

**Granularidade**: 1 linha por **fatura** (não por contrato). Mesmo contrato aparece N vezes (1 por safra/mês). `_consolidarSafraServer_` agrupa por contrato antes da escrita.

**Helpers** (`CruzamentoAutoAPI.js`): `_consolidarSafraServer_`, `_safraParseInt_`, `_mapearStatusContrato_`, `_aplicarSafraEm1Vendas_`.

**Idempotência**: trigger respeita `CRUZ_VERO_LAST_THREAD` — não re-processa o mesmo thread. Pipeline manual (`buscarEImportarVero`, `forcar=true`) re-processa, com mesmo resultado (overwriting com mesmo valor).

### 7.2. Pipeline novo — extrato fechado mensal (upload via UI)

**Trigger:** botão "📤 Importar Extrato" na tela admin `◆ Extrato`. Aceita xlsx do tipo SNIPER MOBILE mensal. **Idempotência:** Script Property `EXTRATO_VERO_PROCESSADO_<YYYY-MM>` — se import do mesmo mês já foi feito, UI pergunta "deseja substituir?".

**Validação no upload:** parser identifica o tipo de arquivo pela presença da aba `RESUMO COMPLETO` + extrai `MES_REF` da aba para popular automaticamente o campo "mês de competência" da UI. Arquivo errado (sem `RESUMO COMPLETO`) é rejeitado.

**Parsing das 14 abas:**

| Aba | Função | Granularidade |
|---|---|---|
| RESUMO COMPLETO | Fonte da verdade do total a receber/pago do mês | Por mês de competência (1 linha) |
| BD_INSTALAÇÃO | Lista das instalações pagas (com pontos e fator aplicado) | Por contrato |
| BD_VENDA BRUTA | Vendas reportadas brutas (antes de descontos) | Por contrato |
| Bônus Quinzenal | Adicional pago | Por mês |
| Adimplência | Liberação dos 0,4 dos 3 meses atrás | Por contrato |
| BD_CHURN | Cancelamentos que viraram churn | Por contrato |
| BD_CANCELAMENTOS | Cancelamentos pré-churn | Por contrato |
| Pagamentos | Histórico de pagamentos no mês | Por contrato/data |
| Inadimplentes | Recorte de inadimplentes do mês | Por contrato |
| Suspensos 120 dias | Recorte de suspensos | Por contrato |
| Devolução Suspensos | Reativações | Por contrato |
| Móvel | Vendas Móvel separadas | Por contrato |
| Estorno Móvel Venda Combo | Estornos específicos de Móvel em combo | Por contrato |
| HUB | Disciplina HUB | Por mês |

**Escrita:**
- Nova aba `Extrato Vero` recebe um snapshot detalhado (por contrato) — pode ser wipe-and-replace por mês.
- Linhas correspondentes em `1 - Vendas` recebem update dos campos econômicos: `FATOR_APLICADO`, `RECEITA_REALIZADA`, `STATUS_CHURN`, `STATUS_ADIMPL_90D`, `STATUS_SUSPENSAO`, `ORIGEM_CONTRATO_VERO`, `MES_REF_VENDA`, `CLASSIFICACAO_CLUSTER`.
- Geração da aba `Conciliacao Mensal`: cruzamento `RECEITA_PREVISTA × RECEITA_REALIZADA` por contrato, com flag de divergência.

**Preview obrigatório:** antes de aplicar, UI mostra resumo (X contratos atualizados, Y divergências detectadas, valores agregados). Confirmação aplica em transação atômica.

### 7.3. Pipeline novo — relatório de inadimplência (upload via UI)

**Trigger:** botão "📤 Importar Inadimplência" na tela admin `◇ Inadimplência`. Sob demanda — o Ricardo pede ao gestor Vero quando quer atualizar.

**Validação:** parser identifica pela mono-aba com coluna `Faixa de Risco` + `Never Paid`.

**Parsing:** 28 colunas mapeadas para `Inadimplencia Vero` (snapshot atual) + cópia para `Inadimplencia Historico` antes de sobrescrever (preserva tendência).

**Escrita:**
- Linhas em `1 - Vendas` recebem refresh dos campos profundos: `FAIXA_RISCO`, `NEVER_PAID`, `AGING_DIAS`, `ULTIMO_REFRESH_RISCO`.
- Contratos no relatório que **não existem em `1 - Vendas`** vão para um alerta: "contrato Z na inadimplência da Vero não tem venda correspondente no CRM" — provável reconciliação reversa (venda perdida ou cancelada erroneamente).

### 7.4. Pipeline novo — Tabela de Pontuação (upload via UI)

**Trigger:** botão "📤 Importar Tabela de Pontuação" na tela admin `◈ Tabela de Pontuação`. Recebida quando a Vero ajusta valores (não tem cadência fixa).

**Validação:** parser identifica pelas abas `EPON` + `SUL, MG e CO 〈data〉` + `SP 〈data〉` + `Planos novos`.

**Parsing:** lê só as abas `SUL, MG e CO 〈data〉` e `SP 〈data〉` (EPON fora de escopo conforme decisão §11.7). Cada plano tem 4 colunas (Especial/Ouro/Prata/Padrão). Reconcilia com `planos_vero.json` por `nome_crm_match` (mesma heurística usada em `planos_vero_codigos.json`).

**Escrita:** atualiza `pontuacao_planos.json` no Drive. Versão anterior é preservada (renomeada com timestamp). Cache 600s invalidado.

### 7.5. Pipeline novo — Carta de Meta (upload via UI)

**Trigger:** botão "📤 Importar Carta de Meta" na tela admin `◇ Cartas de Meta`. Recebida mensalmente até dia 10.

**Tipo do arquivo:** pdf. Parser tenta extrair via text-extraction os campos estruturados (estrelas, fator, metas, regras). Como pdf pode ser difícil de parsear, **fallback:** UI permite ao Ricardo preencher os campos manualmente via formulário se a extração automática falhar (campos pré-populados pelo parser + edição manual). Saída do parser é exibida em preview pra confirmação antes de gravar.

**Escrita:** append no array `cartas` do `cartas_meta_pap.json` com `mes_competencia` extraído do arquivo (ou informado manualmente). Não sobrescreve histórico.

---

## 8. Painel Financeiro — 4 quadrantes

A tela principal. URL/menu novo: `◐ Financeiro` (perfil admin). Quadrantes independentes, cada um respondendo uma das 4 perguntas do §1.

### 8.1. Q1 — Projeção de Caixa (próximos 4 meses)

**O que mostra:**

```
Mês       | Previsto    | Realizado* | Confiança
----------|-------------|------------|----------
M (atual) | R$ XX.XXX   | R$ Y.YYY   | parcial — em apuração
M+1       | R$ XX.XXX   | —          | alta (vendas instaladas + adimpl. M-2)
M+2       | R$ XX.XXX   | —          | média (depende de instalações de M+1)
M+3       | R$ XX.XXX   | —          | baixa (estimado por safra)
```

**Como calcula:**

Para cada venda em `1 - Vendas` com `MES_COMPETENCIA` resolvido e `RECEITA_PREVISTA > 0`:

- Mês M (atual): contrato instalado e em dia → `RECEITA_PREVISTA`. Liberação da adimplência diferida M-3.
- Mês M+1: contratos instalados em M com fator vigente.
- Mês M+2: contratos com instalação prevista em M+1 (status 2 com `agenda` no mês) × probabilidade histórica de conclusão.
- Mês M+3: estimativa por safra (média móvel histórica do mesmo mês do ano anterior, se houver).

Componentes somados:
1. `Pontos × Fator` das vendas Fibra ativas no mês.
2. `VALOR_MOVEL_RS` das vendas Móvel ativas no mês.
3. Adimplência liberada (parcela 0,4 das vendas de M-3 que estão `EM_DIA`).
4. Bônus quinzenal projetado (média histórica das últimas 6 quinzenas).

Componentes subtraídos:
1. Descontos por churn em curso (vendas com `STATUS_CHURN ≠ ATIVO` e aging dentro de janela).
2. Inadimplentes na janela 0-90d com `NEVER_PAID = true` (provável não-pagamento).

**Apresentação:** card grande no topo + breakdown por componente + gráfico de barras 4 meses.

### 8.2. Q2 — Risco em Janela de Ação

**O que mostra:** lista priorizada de inadimplentes onde ainda dá pra agir.

```
Janela de ação (0-90d):
┌─────────────────────────────────────────────────────────────┐
│ CT.12345  · MARIA SILVA   · R$120 · 65d · Risco 5 · NP false│
│ CT.67890  · JOÃO SANTOS   · R$ 80 · 32d · Risco 3 · NP true │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
Janela de risco (91-180d, último alerta):
┌─────────────────────────────────────────────────────────────┐
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
Estorno iminente (>180d):
┌─────────────────────────────────────────────────────────────┐
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
```

**Ordenação:** `(risco × valor_exposto) / dias_restantes_acao`. Quanto mais valor, mais risco, menos tempo, mais alto.

**Fonte:** `1 - Vendas` filtrada por `AGING_DIAS > 0` e `STATUS_ADIMPL_90D ≠ EM_DIA`.

**Ações por linha:** botão "Adicionar à campanha de cobrança" (abre seletor para enfileirar no WA Campanha — ver §8.5), botão "Marcar como ação tomada" (anota observação + timestamp + usuário), botão "Detalhe da venda" (abre painel lateral com tudo da venda).

**Cobrança usa o WA Campanha existente:** não cria infraestrutura nova. O Painel Risco serve como "fila de pessoas para cobrar" e oferece atalhos para enfileirar contatos em campanhas de cobrança via o módulo WA Campanha já operacional. Detalhamento da integração em §8.5.

**Total exposto:** somatório de `RECEITA_PREVISTA` dos contratos listados, decomposto por janela.

### 8.3. Q3 — Conciliação Mensal ✅ ENTREGUE 27/05/2026 — `◆ Conciliação` em produção

Aba `Conciliacao Mensal` (sub-fatia 7.2) + aba `Extrato Vero` (sub-fatia 7.3) alimentam o painel `◆ Conciliação`. Painel inclui: dropdown de mês, KPIs em 3 grupos (Conciliação comparáveis vs Contexto sem-previsto vs Distribuição de flags), decomposição do Realizado por 5 categorias (Base/Bonificações/Ajustes/Extras/Descontos + total da Vero), filtros por flag, busca, tabela ordenável por contrato/cliente/plano. Refinamento futuro: explicação automática por linha via `cartas_meta_pap.json` (churn voluntário 31-60d aplica 50% etc).

**O que mostra:** após import do extrato mensal, tabela de divergências.

```
Resumo do mês 〈M-1〉                Expectativa | Realizado | Δ
────────────────────────────────────────────────────────────
Pontos × Fator                       R$ 19.500  | R$ 19.242 | -258
Móvel                                R$  3.900  | R$  3.678 | -222
Adimplência (liberação M-3)          R$  8.800  | R$  8.825 | +25
Bônus quinzenal                      R$    600  | R$    580 | -20
Descontos esperados                  R$ -1.200  | R$ -1.450 | -250
────────────────────────────────────────────────────────────
Total                                R$ 31.600  | R$ 30.875 | -725

Divergências por contrato (>R$10):
┌──────────────────────────────────────────────────────────────┐
│ CT.5555  Esperado R$45 → Recebido R$22  | Churn voluntário 35d (50%) │
│ CT.8888  Esperado R$60 → Recebido R$0   | Inadimplente 90d (100%) │
│ ...                                                            │
└──────────────────────────────────────────────────────────────┘
```

**Fonte:** join de `1 - Vendas` (`RECEITA_PREVISTA`) × `Extrato Vero` (`RECEITA_REALIZADA`).

**Cada linha de divergência tem uma "explicação"** resolvida pelas regras em `cartas_meta_pap.json`. Não é recálculo — é interpretação ("churn voluntário entre 31-60d aplica 50% de desconto, e foi isso que aconteceu").

**Tarefas pendentes:** divergências sem explicação automática viram tarefa para o Ricardo investigar.

### 8.4. Q4 — Saúde Operacional ✅ ENTREGUE 27/05/2026 — `⊙ Saúde Operacional` em produção

Tela admin standalone (`SaudeOperacional.html` + `SaudeOperacionalAPI.js`). 3 seções: estrelas estimadas (tier resolvido por instalações BL do mês), indicadores operacionais (%CN com regra Vero — Cancelamento Comercial Fibra / vendas brutas Fibra do mês cohort, threshold 5% multa/bônus; HUB disciplina dependendo da Fase 7.3 da `ORIGEM_CONTRATO_VERO`; DU médio = vendas/dias úteis; Churn breakdown vol/invol), comparativo dos últimos 3 meses. Plugado no menu admin. Defensivas: cols pendentes mostram "—" com observação. **Ricardo solicitou revisão geral de dados após Fase 8 entregar** (inconsistências históricas residuais por causa da base legacy forward-only).

**O que mostra:** indicadores de operação no mês corrente.

- **Faixa de estrelas estimada:** pontos acumulados no mês atual + projeção até fim do mês × meta de cada tier.
- **% CN Vendas:** cancelamentos pré-instalação / vendas. Trigger de multa em 5%.
- **HUB disciplina:** % HUB / total. Tolerância em 5%.
- **Churn no mês:** voluntário + involuntário.
- **DU médio:** vendas por dia útil do mês.
- **Comparativo:** o mês atual vs últimos 3 meses (faixa de estrelas, %CN, DU).

**Apresentação:** painel de KPIs com gauges/barras. Alertas amarelo/vermelho quando ultrapassa threshold.

### 8.5. Integração com WA Campanha

Cobrança reusa o módulo WA Campanha já operacional (Evolution API, anti-ban, blacklist, tracking de resposta, métricas, dashboards). Sem aba nova, sem subsistema paralelo.

**Como o Painel Risco se conecta:**

1. **Listagem da fila:** o Painel Risco (§8.2) mostra inadimplentes priorizados. Cada linha tem checkbox + botão "Adicionar à campanha de cobrança".
2. **Seleção em lote:** botão "Selecionar todos da janela" permite marcar todos os inadimplentes de uma janela (0-30, 31-60, 61-90, 91-180, >180) de uma vez.
3. **Criação da campanha:** botão "Criar campanha de cobrança" abre o fluxo de Nova Campanha do WA Campanha pré-populado com:
   - Lista de contatos = os marcados no painel Risco
   - Template = sugerido pelo estágio dominante da seleção (Cordial / Firme / Pré-encerramento)
   - Nome da campanha = `Cobrança 〈estágio〉 - DD/MM` por padrão
4. **A partir daí, o usuário usa o WA Campanha normalmente** — gera variações via Claude, anexa imagem se quiser, dispara. Anti-ban, delay, tracking de resposta, dashboards de saúde — tudo já existe.

**Templates de cobrança como Quick Templates:** os 3 textos sugeridos (Cordial / Firme / Pré-encerramento) ficam em uma propriedade `COBRANCA_TEMPLATES_JSON` editável pelo admin. WA Campanha ganha um seletor "Usar template de cobrança ▾" no campo de mensagem (não interfere no uso normal — só atalho).

**Sinalização de status na linha da venda:** cada vez que um contato é adicionado a uma campanha de cobrança, anota em `OBSERVACAO` da linha em `1 - Vendas` um registro estruturado tipo `[2026-06-15 cobrança cordial enviada]`. Resposta detectada pelo WA Campanha (já trackeada em `WA Disparos.respondeu_em`) pode disparar um job que move o contato para o próximo estágio na próxima rodada.

**Métricas:** já vêm de graça do dashboard de Saúde do WA Campanha — taxa de entrega, % respondeu, blacklist. A única métrica nova é "valor recuperado por mês", que vem do extrato (contratos que pagaram após serem incluídos em campanha de cobrança) cruzado com `Toques` registrados em `OBSERVACAO`.

**Vantagens dessa abordagem:**
- Zero duplicação de infraestrutura (anti-ban, janela horário, claim atômico, bolinha de campanha ativa — tudo herdado).
- Curva de aprendizado zero — Ricardo já opera WA Campanha.
- Histórico de cobrança fica em `WA Disparos` (mesma tabela de toda comunicação de massa), não em silos.

---

## 9. Telas administrativas auxiliares

Além do Painel Financeiro principal, 4 telas admin de upload + visualização (menu Operacional → subgrupo "Financeiro"):

### 9.1. `◆ Extrato` (admin)

**Upload:** botão "📤 Importar Extrato" aceita xlsx do SNIPER MOBILE mensal. Preview obrigatório antes de aplicar.

**Visualização:** último extrato importado, filtros por contrato/status/mês de competência. Drill-down em cada linha → detalhes (origem da pontuação, fator, descontos aplicados). Exporta CSV. Histórico de imports anteriores acessível em dropdown "Ver mês:".

### 9.2. `◇ Inadimplência` (admin)

**Upload:** botão "📤 Importar Inadimplência" aceita xlsx mono-aba. Preview antes de aplicar.

**Visualização:** snapshot atual em tabela com filtros por aging, faixa de risco, valor, Never Paid. Acesso ao histórico (`Inadimplencia Historico`) com slider temporal pra ver evolução.

### 9.3. `◈ Tabela de Pontuação` (admin)

**Upload:** botão "📤 Importar Tabela de Pontuação" aceita xlsx do tipo "Tabela pontuação atualizada". Preview mostra deltas vs versão atual (planos novos, planos com pontuação alterada).

**Visualização:** tabela com plano × segmentação × pontuação atual. Botão "Ver histórico" para acessar versões anteriores no Drive.

### 9.4. `◇ Cartas de Meta` (admin)

**Upload:** botão "📤 Importar Carta de Meta" aceita pdf. Parser tenta extrair campos estruturados; se falhar, abre formulário pré-preenchido para revisão manual.

**Visualização:** histórico de cartas mensais. Permite ver fator, metas e regras de cada mês em uma timeline. Cada carta editável (caso o parser tenha errado um campo).

---

## 10. Fases de implementação

Ordem proposta, depende da Sprint Integridade ser cumprida primeiro. Tela de upload é integrada à fase do respectivo pipeline (não vira fase à parte).

### Fase 0 — Aprovação do design (esta fase)

Ricardo lê o documento, fecha a decisão pendente do §11.9 (fórmula de cálculo), aprova.

### Fase 1 — Sprint Integridade de Vendas

Implementar as invariantes do §6. Auditoria dos 7 portões de entrada. Backfill final do legado. Métrica: `Vínculos Pendentes` zera e fica em zero por 30 dias consecutivos.

**Tamanho:** 1-2 semanas. Sem dependência externa.

### Fase 2 — Fundação dos JSONs

Criar `pontuacao_planos.json` a partir da Tabela de Pontuação 04.05 e `cartas_meta_pap.json` a partir da Carta de Maio. Helpers one-shot iniciais (rev1). Backend de leitura cacheado 600s.

**Tamanho:** 2-3 dias.

### Fase 3 — Schema extension em `1 - Vendas`

Append das 17 novas colunas (AU-BL). One-shot de migração que popula `COD_PLANO`, `PONTOS_VENDA`, `VALOR_MOVEL_RS`, `MES_COMPETENCIA` para vendas existentes via reverse-lookup. Atualizar `_construirLinhaDados` para gravar essas colunas em vendas novas.

**Tamanho:** 3-5 dias.

### Fase 4 — Espelho diário: extensão SAFRA ✅ ENTREGUE 26/05/2026 11:11

Implementação ampliou o escopo original: além de `AGING_DIAS` (BH=59) e `STATUS_ADIMPL_90D` (BC=54), a mesma passagem grava `STATUS_SUSPENSAO` (BE=56) e `STATUS_CHURN` (BD=55), aproveitando que `STATUS_CONTRATO` vem na mesma aba (custo marginal zero). Refinamento `CHURN_VOLUNTARIO`/`CHURN_INVOLUNTARIO` segue na Fase 7 (extrato fechado).

**Dados reais observados na 1ª aplicação:**
- SAFRA: 1670 linhas-fatura → 589 contratos únicos.
- CRM `1 - Vendas`: 593 linhas atualizadas (4 a mais que contratos únicos — investigar duplicatas de CONTRATO no CRM em fase 6.x).
- **87 inadimplentes 90d** identificados. Aging máximo: 194 dias.
- Distribuição STATUS_CONTRATO: HABILITADO 1127 | SUSPENSO 308 | SUSPENSO PARCIALMENTE 121 | CANCELADO 108 | HABILITADO EM CONFIANCA 6.

**Refinamento futuro (baixa prioridade):** distinguir `SUSPENSO_PARCIAL` de `SUSPENSO` total em STATUS_SUSPENSAO. Hoje ambos caem em `SUSPENSO`. Q2 (Risco) pode querer essa granularidade — parcial = navega com restrição (cliente usável), total = sem internet (mais grave). Sem urgência; refinar quando atacar Q2/Q4.

### Fase 5 — Tela `◈ Tabela de Pontuação` + pipeline de upload

Tela admin com upload de xlsx. Parser, validação heurística, preview de deltas, gravação no `pontuacao_planos.json`. Histórico de versões no Drive.

**Tamanho:** 4-5 dias.

### Fase 6 — Tela `◇ Cartas de Meta` + pipeline de upload

Tela admin com upload de pdf + parser com fallback para formulário manual. Append em `cartas_meta_pap.json`.

**Tamanho:** 1 semana.

### Fase 7 — Tela `◆ Extrato` + pipeline de upload de extrato mensal — EM ANDAMENTO (fatiada)

A página `◆ Extrato` (`Extrato.html`) **já existia** em produção desde 17/03 — parser SheetJS client-side, dashboard Chart.js, persistência em localStorage, arquivamento no Drive. O que faltava era a **ponte pro `1 - Vendas`** (escrita das cols econômicas) e a **conciliação** (§8.3). Entregues como sub-fatias separadas:

**Sub-fatia 7.1 ✅ ENTREGUE 27/05/2026 — BD_INSTALAÇÃO → 1-Vendas.**
Backend `ExtratoAPI.js` novo. Frontend ganha botão **📥 Aplicar ao CRM** no header da página. Reusa o parser SheetJS (sem reescrever), envia `_sheets.instBL` via `google.script.run`, faz **preview obrigatório server-side** com modal customizado (KPIs + amostras + alerta se mês já processado) e, na confirmação, escreve em batch nas cols `FATOR_APLICADO` (AZ=51), `RECEITA_REALIZADA` (BB=53), `MES_REF_VENDA` (BK=62). Match por contrato via `_cruzNormIdServer_` (mesma normalização da Fase 4/cruzamento). Idempotente via Script Property `EXTRATO_VERO_PROCESSADO_<YYYY-MM>`. **1ª aplicação real (abril/2026)**: 51 contratos no extrato → 53 vendas atualizadas (2 a mais por duplicatas no CRM — mesmo achado da Fase 4), 0 sem match, 0 divergências (≥5%), R$ 14.340,02 Total Pago.

**Sub-fatia 7.2 ✅ ENTREGUE 27/05/2026 — aba materializada `Conciliacao Mensal`.**
Backend amplia `aplicarExtratoMensal` (no `confirmar: true`) pra também gerar/atualizar a aba `Conciliacao Mensal` no Sheets. Schema de 17 cols: `MES_REF`, `LINHA_CRM`, `CONTRATO`, `CLIENTE`, `PLANO`, `PRODUTO`, `SEGMENTACAO`, `COD_PLANO`, `PONTOS_VENDA`, `PONTOS_MOVEL`, `FATOR_APLICADO`, `RECEITA_PREVISTA`, `RECEITA_REALIZADA`, `DIFF`, `PCT`, `FLAG`, `APLICADO_EM`. `FLAG`: `OK` (|pct|<5%) / `DIVERG_LEVE` (5-20%) / `DIVERG_GRAVE` (≥20%) / `SEM_PREVISTO` (previsto≤0). **Wipe-and-replace POR MÊS** (deleta só linhas do mês alvo em blocos contíguos descendentes, preserva outros meses). Permite histórico acumulado sem reprocessar tudo. Formatação aplicada (R$/pct/fator). Distribuição de flags volta no resultado e aparece no modal de sucesso (KPIs extras: OK / leve / grave / sem previsto).

**Sub-fatia 7.x — UX dos modais ✅ 27/05/2026.** Os 4 `confirm()`/`alert()` nativos da página foram substituídos por modais customizados seguindo o padrão `ep-modal-overlay`: `epConfirm({...}, onConfirm, onCancel)` genérico com variantes `warn`/`danger`. Cobre: re-upload de mês existente, apagar fechamento (botão 🗑), apagar arquivo do Drive, e o fluxo "Aplicar ao CRM" (3 estados — preview / loading / resultado). Bug fix incluso: overlays movidos pra `document.body` (`epEscaparOverlay`) pra escapar do stacking context do `#pageExtrato`.

**Sub-fatia 7.3 ✅ ENTREGUE 27/05/2026 — agregados em `Extrato Vero` + decomposição visual no Q3.**
Materializa nova aba `Extrato Vero` (snapshot mensal, wipe-and-replace) com os 13 componentes do Realizado parseados do RESUMO COMPLETO (instBL, móvel, adimplência, bônus quin/extra, multa cancelamento, descontos churn/inadimp/susp/estorno/HUB, B2B, e TOTAL). Schema: `MES_REF | COMPONENTE | VALOR | SINAL | CATEGORIA | APLICADO_EM`. Frontend `ConciliacaoAPI` lê o mês ativo e devolve agregados pra renderizar a seção "Decomposição do Realizado" no painel Q3 (5 cards categorizados: Base, Bonificações, Ajustes, Extras, Descontos + card grande "REALIZADO TOTAL DA VERO"). Implementa a tabela do §8.3 sem precisar de "explicação automática" por contrato (refinamento futuro: cruzar com `cartas_meta_pap.json` por linha).

**Sub-fatia 7.4 ✅ ENTREGUE 27/05/2026 — BD_CHURN refina STATUS_CHURN.**
Frontend extrai aba `BD_CHURN` completa via SheetJS e envia ao backend. Helper `_aplicarBdChurnEm1Vendas_` detecta `TIPO`/`CATEGORIA`/`MOTIVO_CHURN` por header (defensivo), mapeia `VOLUNT → CHURN_VOLUNTARIO` e `INVOLUNT → CHURN_INVOLUNTARIO`, e sobrescreve `STATUS_CHURN` (BD=55) das vendas matched. SAFRA continua marcando `CANCELADO_COMERCIAL` como default — BD_CHURN substitui com granularidade quando o extrato fechado é aplicado. Modal de sucesso ganha KPIs `Churn voluntário` (warn) e `Churn involuntário` (bad). Observação amarela do Q4 sobre "depende Fase 7.4" some sozinha.

**Painel Q3 visual ✅ ENTREGUE 27/05/2026 — `◆ Conciliação`.**
Tela admin standalone (`Conciliacao.html` + `ConciliacaoAPI.js`). Lê a aba `Conciliacao Mensal` materializada na Fase 7.2 + agregados da Fase 7.3. Inclui: dropdown de mês, KPIs em 3 grupos (Conciliação, Contexto, Distribuição) — comparáveis vs sem-previsto isolados pra evitar artefato de soma; decomposição do Realizado por categorias; filtros por flag (Todos/Graves/Leves/OK/Sem previsto); busca por contrato/cliente; tabela ordenável por qualquer coluna; badges coloridos por flag. Plugado no menu admin (Config.js + Index.html + JS.html + Usuarios.html). Cache 60s no backend, invalidado por `_limparCacheConciliacao_` chamado pelo ExtratoAPI.

**Sub-fatia 7.5 ✅ ENTREGUE 28/05/2026 — Backfill de PONTOS via BD_INSTALAÇÃO.**
Resolve o gap SEM_PREVISTO legacy sem depender da cobertura do `pontuacao_planos.json`. No mesmo loop de match do `aplicarExtratoMensal`, quando a venda matched tem `PONTOS_VENDA`/`PONTOS_MOVEL` vazios E o extrato traz `pontosBL`/`pontosMovelCombo`/`movelAdicional > 0` (cols da BD_INSTALAÇÃO já lidas pra calcular receita), carimba retroativamente em `1-Vendas` (AU=47, AV=48 — números efetivos no `c.PONTOS_VENDA`/`c.PONTOS_MOVEL`). Idempotente: nunca sobrescreve valor existente. `Math.max(0, ...)` clampa lixo (descoberta no abril: 5 vendas com Date object serializado como timestamp em PV/PM por causa de col com `numberFormat=Data` — também detectadas + zeradas via one-shot `_diag75` + `_diag75CorrigirFormatoCols`). `previsto` é recomputado com pontos efetivos → flag `SEM_PREVISTO` vira `OK` na conciliação. Contador `backfill75={vendas,somaPV,somaPM}` propaga em preview/resultado/registro de idempotência; modal Extrato.html ganha KPI "Pontos backfilled (7.5)". **Decisão Ricardo (27/05)**: Path A direto (pontos realizados do extrato) em vez de Path B (via COD_PLANO + json) — entrega previsto que bate com realizado por construção, sem custo de cobertura. **Resultado abril/26**: 14 OK + 39 SEM_PREVISTO → 47 OK + 3 leve + 3 grave + 0 SEM_PREVISTO. Os 3 graves restantes são ruído operacional (cancelamento parcial, plano divergente CRM×Vero); 2 dos 3 leves são erro de ~5pts no `pontuacao_planos.json` rev2 (COD 4623 `550MB MUNDO FIBRA` PV=98 deveria ser 93 — ajuste pra rev futura).

**Sub-fatias pendentes** (sob demanda):
- **Migração de planos legacy** (decisão Ricardo: rejeitada por enquanto, ver memo `project_dharmapro_cod_plano_forward_only`). A 7.5 resolveu o caso do extrato (pontos realizados); pra vendas que NÃO entram em extrato (status 2 sem instalação ainda), nomes legacy seguem sem COD/PONTOS. Vai diluir organicamente em ~3 meses; revisitar se a base estiver pequena e quiser empurrar cobertura.
- **Ajuste fino do `pontuacao_planos.json`** — COD 4623 (`550MB MUNDO FIBRA`) PV=98 → 93; COD 4279 (`VERO MAIS 800MB + HBO + MÓVEL 20GB`) ESPECIAIS subestimado em ~10pts. Aguardar mais 1-2 meses de extrato pra confirmar antes de cortar uma rev.
- **Refinamento Q4 Tier** — `resolverEstrelaPorInstalacoes` usa contagem de instalações com `STATUS atual = 3` (corrigido em 27/05 pra contar `INSTAL` preenchido independente do status). Inconsistências históricas residuais ainda podem aparecer — Ricardo solicitou **revisão geral de dados após Fase 8 entregar** (não ajustar painel por painel agora).

**Tamanho original:** 2 semanas. **Entregue 27-28/05/2026:** 5 sub-fatias em ~1,5 dias (reuso máximo do parser SheetJS existente).

### Fase 8 — Tela `◇ Inadimplência` + pipeline de upload

Tela admin com upload do xlsx de inadimplência. Snapshot + histórico. Update de `1 - Vendas`.

**Tamanho:** 1 semana.

### Fase 9 — Painel Financeiro Q1 (Projeção de Caixa)

Implementar o quadrante 1. Depende de `COD_PLANO`, `PONTOS_VENDA`, `VALOR_MOVEL_RS`, `FATOR_APLICADO` (Fases 2 + 3 + 7).

**Tamanho:** 1-2 semanas.

### Fase 10 — Painel Financeiro Q2 (Risco em Janela de Ação) + Integração com WA Campanha

Lista priorizada + ações. Integração com WA Campanha (§8.5): botão "Adicionar à campanha de cobrança", `COBRANCA_TEMPLATES_JSON` no admin, Quick Templates no WA Campanha, registro estruturado em `OBSERVACAO` da linha da venda. Sem aba nova nem subsistema paralelo.

**Tamanho:** 1 semana (lista + integração leve com WA Campanha existente).

### Fase 11 — Painel Financeiro Q3 (Conciliação Mensal)

Após primeiro import de extrato, ativa o quadrante 3.

**Tamanho:** 1 semana.

### Fase 12 — Painel Financeiro Q4 (Saúde Operacional)

KPIs + comparativos.

**Tamanho:** 3-5 dias.

**Total estimado:** ~12-15 semanas de trabalho, sequencial. As Fases 5-8 (telas de upload) podem ser paralelizadas. As Fases 9-12 (quadrantes do painel) também podem ser paralelizadas após a fundação pronta.

---

## 11. Decisões

### 11.1 a 11.8 — Fechadas pelo Ricardo em 21/05/2026

1. **Vintage por instalação** — `MES_COMPETENCIA` é fixado na transição para status 3 (instalada), usando o mês da coluna `INSTAL`. Vendas instaladas no dia 04 do mês seguinte ao lançamento entram no mês seguinte. ✅
2. **Adimplência diferida** — aplica no painel apenas na liberação efetiva (M+3 quando o extrato confirma). Mas ao detectar a liberação, **gera item de revisão** que o Ricardo precisa confirmar antes de fechar o mês. ✅
3. **Métrica Sprint Integridade** — `Vínculos Pendentes` zerado por 30 dias consecutivos. ✅
4. **Importação dos arquivos Vero** — **NÃO** monitorar Gmail. Espelho diário continua via Gmail (já funciona), mas extrato, inadimplência, tabela de pontuação e carta de meta são todos **upload manual via frontend** em telas admin dedicadas. Sem dificuldade de obtenção justifica não automatizar. ✅
5. **Carta de Meta** — recebida mensalmente até dia 10. Upload via tela admin (`◇ Cartas de Meta`). ✅
6. **Cobrança** — **reusar WA Campanha existente** (revisão da decisão original "fluxo separado" após segunda reflexão). Painel Risco vira fonte de "fila de pessoas para cobrar" com botão "Adicionar à campanha de cobrança" que enfileira contatos no WA Campanha. Templates Cordial/Firme/Pré-encerramento ficam em `COBRANCA_TEMPLATES_JSON` e aparecem como Quick Templates na criação de campanha. Detalhes em §8.5. ✅
7. **Escopo do painel financeiro** — EPON, B2B e Móvel avulso **ficam de fora**. Apenas B2C Fibra (Alone + Combo) e Móvel (Alone + Combo) com `PUBLICAR=true` no `planos_vero.json`. ✅
8. **Acesso** — admin only por enquanto. Backoffice pode ganhar acesso ao subsistema de cobrança no futuro, se necessário. ✅

### 11.9 — RESOLVIDA (21/05/2026): fórmula de cálculo de receita = Cenário 1

**Cenário 1 confirmado.** Reverse-engineering do extrato `SNIPER MOBILE.xlsx` (fev/março) feito em Claude Code, batendo exatamente com o `RESUMO`.

**Fórmula confirmada (por instalação):**

```
Total Pago = (Pontos BL + Pontos Móvel Combo) × Fator do mês
```

A aba `BD_INSTALAÇÃO` já traz por contrato as colunas `Pontos BL`, `Pontos Móvel Combo`, `Móvel Adicional`, `Fator` e `Total Pago`. Em **todas as 48 linhas, sem uma exceção**, `Total Pago = (Pontos BL + Pontos Móvel Combo + Móvel Adicional) × Fator` (Fator = 2,6 em março).

**Reconciliação com o `RESUMO` (exata, zero divergência):**

| Componente | RESUMO | Reverse-eng. (BD_INSTALAÇÃO) |
|---|---|---|
| Instalações BL | R$ 9.794,20 | Σ Pontos BL (3767) × 2,6 = **9.794,20** ✓ |
| Móvel | R$ 3.549,00 | Σ Pontos Móvel Combo (1365) × 2,6 = **3.549,00** ✓ |
| **Σ Total Pago** | **R$ 13.343,20** | **R$ 13.343,20** ✓ |

(O `Realizado` total de R$ 18.574,05 inclui ainda Adimplência +11.837, Bônus, Desc. Churn, Multas, Desc. Inadimplentes, Suspensos, Devolução, Estorno Móvel e B2B — a camada de **reconciliação** que o §2.3 já decide *não* recalcular. Os dois componentes que o `RECEITA_PREVISTA` modela — BL e Móvel — fecham 100%.)

**3 correções ao desenho original (decididas com Ricardo em 21/05):**

1. **"Pontuação" NÃO é o preço do cliente.** A premissa que disparou esta decisão (Cowork viu `VERO MAIS 550 + 20GB = 112,9` e supôs pontuação = preço) foi sobre-generalização de uma das poucas linhas com decimal. A maioria dos planos tem pontos **inteiros e menores** que o preço (MUNDO FIBRA 550 = 93 pts; MUNDO ENT 800 = 122 pts; COMPLETO FILMES = 150 pts) e batem com o extrato. **Não existe Cenário 2 / tabela de conversão oculta.**

2. **⚠️ O Móvel em combo é pago `pontos × fator`, NÃO R$ fixo.** No extrato o `Pontos Móvel Combo` é somado aos pontos BL e multiplicado pelo mesmo fator. Os números 25/40/85 (que o desenho original tratava como "R$") são **pontos**:

   ```
   Móvel combo 10GB = 25 pts → 25 × 2,6 = R$ 65,00
   Móvel combo 20GB = 40 pts → 40 × 2,6 = R$ 104,00   (NÃO R$ 40)
   Móvel combo 60GB = 85 pts → 85 × 2,6 = R$ 221,00
   ```

   O R$ 40 fixo aparece só na aba `Estorno Móvel Venda Combo` (como `Valor plano`/base de desconto na reconciliação) — outra camada. Esta correção altera §2.2, §4.1, §4.2, §5 (col AW/BA) e §13 — todos atualizados nesta rev 4.

3. **A Tabela de Pontuação é versionada por mês.** O extrato de fev/março usou pontos próximos da aba `24.03` (MUNDO FIBRA 550 = 93), enquanto a aba `04.05` já mostra 107,9 para o mesmo plano. Confirma o §5: `PONTOS_VENDA` precisa ser **snapshot por venda** e o `pontuacao_planos.json` deve guardar vigência.

**Decisão de fonte do `pontuacao_planos.json` (Fase 2):** semear pelos **pontos reais por IDPLANO do `BD_INSTALAÇÃO`** (o que a Vero efetivamente pagou), usando a Tabela de Pontuação 04.05 como **cross-check** e para planos que não aparecem no extrato. O extrato é a verdade do realizado; a Tabela tem linhas decimais contaminadas por preço (MUNDO FIBRA 550/750) que divergem do pago.

**Mapeamento confirmado (Pontos Móvel Combo por franquia):** 10GB = 25 · 20GB = 40 · 60GB = 85.

### 11.10 — Decisões secundárias ainda em aberto (baixa prioridade)

- **Identificação automática de vendas suspeitas** no upload do extrato: se o extrato cobra contrato que o CRM não tem, o que fazer além de alertar? (Provável: virar tarefa no painel, não tomar ação automática.)
- **Edição manual de campos econômicos** — admin pode sobrescrever `FATOR_APLICADO` ou `PONTOS_VENDA` na linha em casos específicos? Probably sim, com log de auditoria.

### 11.11 — FECHADA (26/05/2026): backfill de COD_PLANO é forward-only

Após o deploy do sweep VeroHub (21/05 23:45 — `getCodigoVeroPorPlanoCidade` em camadas, 432 cidades/163 códigos) e do Rev9 do `planos_vero.json` (26/05 — coluna 14 `NOME_VERO` canônica + passo (0) no resolver), o `fase3Backfill` em janela 6m carimbou **112 de 413 vendas** com `COD_PLANO`. As 301 sem código foram diagnosticadas via `_diagBackfillSemCod` (one-shot, descartado após o uso):

- **282 (94%)** têm na coluna PLANO **nomes legacy** que não existem em nenhuma rev do `planos_vero.json` atual: formato com pipes (`"800MB | PROMO | VERO MAIS 800MB + GLOBOPLAY PREMIUM + MAIS CONECTADO 60GB"`), `NAKED` (planos descontinuados sem combo móvel), erro de digitação `"ENTRENIMENTO"` (vez de "ENTRETENIMENTO"), B2B, e a sazonal `OFERTA VERÃO`.
- **14 (5%)** têm `NOME_VERO` propositalmente vazio (Móvel Alone/Combo — sem código fibra próprio — e a oferta sazonal linha 6).
- **5 (1%)** outras variações da oferta sazonal escritas em formatos diferentes.

**Decisão (com Ricardo, 26/05):** não migrar vendas históricas nem expandir o JSON com aliases legacy. Aceita-se que vendas antigas (formatos pre-Rev5/6/7) ficam sem `COD_PLANO`. O resolver passa a operar **forward-only**: vendas novas (cadastro a partir de 20/05 19:52, que já carimba COD no save) e re-edições de vendas antigas que reescolham o plano via dropdown atual recebem `COD_PLANO` automaticamente. As 112 vendas já carimbadas + as vendas novas alimentam o Painel Q1.

**Tradeoff aceito:** Painel Q1 sub-conta a projeção do trimestre atual enquanto a base for majoritariamente legacy. À medida que vendas novas vão entrando (e as antigas saem da janela 6m), a cobertura sobe organicamente. Em ~3 meses o efeito legacy deve sumir naturalmente.

**Saídas técnicas desta decisão:**

- `_plansVeroNomeVeroSetup.js` é one-shot, foi rodado e **deletado do repo** (deploy 26/05). A coluna 14 do JSON e o passo (0) do resolver ficam — destravam o long tail truncado se/quando aparecer em vendas novas (cidades com sufixo `RH`/`RN` no sweep, etc).
- `PLANO_PADRONIZACAO_NOMES.md` está concluído. A opção alternativa (padronização total dos nomes) continua arquivada como melhoria futura de consistência, não como caminho pro backfill.
- Sem nova ação no fluxo. O Rev9 já gravou; o resolver completo (0+1+2) está ativo.

---

## 12. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Tabela de Pontuação mudar formato a cada mês | Média | Parser da tela de upload tolerante a colunas extras; preview de deltas força revisão humana antes de aplicar |
| Vero mudar formato do extrato (xlsx) | Baixa | Parser tolerante a colunas extras; testes em fixtures |
| Backfill de `COD_PLANO` falhar em vendas com nome de plano truncado/legado | Alta | Reverse-lookup tem fallback de confiança baixa + marca como `cod_plano_pendente` para revisão manual |
| Sprint Integridade demorar mais que o esperado e atrasar o painel | Alta | Painel Q4 (Saúde) pode ser desenvolvido em paralelo — não depende da integridade dos vínculos de combo |
| Parser de pdf da Carta de Meta falhar em algum mês | Média | Fallback para formulário manual pré-populado; Ricardo edita os 6-8 campos chave em <2 min |
| ~~Cenário 2 da §11.9~~ | — | **Resolvido (21/05)**: Cenário 1 confirmado por reverse-engineering exato do extrato de março. Sem fórmula oculta. |
| Sumir os pontos do Móvel porque alguém mexer no JSON | Média | Snapshot por venda em `PONTOS_MOVEL` (col AW) torna a coluna do JSON apenas referência para vendas futuras |

---

## 13. Apêndice — exemplos concretos

### 13.1. Venda combo: cálculo da expectativa (Cenário 1 — confirmado §11.9)

**Dados reais** confirmados pelo extrato de março: plano `VERO MAIS 800MB + HBO MAX + MÓVEL 20GB` (códigos 4279/4305/4323) = **70 Pontos BL + 40 Pontos Móvel Combo**. Receita = `(pontos) × fator`, com Fibra e Móvel usando o **mesmo fator**.

Venda lançada em 31/05/2026, instalada em 04/06/2026 (vintage por instalação → competência = junho), cidade Juiz de Fora.

```
Linha Fibra em 1 - Vendas:
  COD_PLANO:        4279
  PONTOS_VENDA:     70   (Pontos BL — igual nas 4 segmentações para este plano)
  PONTOS_MOVEL:     null
  MES_COMPETENCIA:  2026-06    (mês de INSTAL)
  ESTRELAS_NO_MES:  resolvido no fechamento do mês via cartas_meta_pap.json
  FATOR_APLICADO:   null       (ainda não fechou o mês)
  RECEITA_PREVISTA: 70 × fator_estimado
                    Se 3 estrelas (fator 2,6):    R$ 182,00
                    Se 4 estrelas (fator 2,9):    R$ 203,00
                    Se Prime Vero (fator 3,8):    R$ 266,00

Linha Móvel vinculada em 1 - Vendas:
  COD_PLANO:        4390
  PONTOS_VENDA:     null
  PONTOS_MOVEL:     40        (20GB — pontos, NÃO R$ — multiplica pelo fator)
  MES_COMPETENCIA:  2026-06
  RECEITA_PREVISTA: 40 × fator_estimado
                    Se 3 estrelas (fator 2,6):    R$ 104,00
                    Se Prime Vero (fator 3,8):    R$ 152,00

Total esperado (igual a (70+40) × fator, como o extrato apura):
  Se 3 estrelas: R$ 286,00
  Se Prime Vero: R$ 418,00

(+0,4 × 70 = 28 pts de adimplência diferida BL em set/2026 se cliente pagar em dia 90d)
```

### 13.2. Fluxo após import do extrato de junho (em 05/07/2026)

```
1. Pipeline lê BD_INSTALAÇÃO do extrato:
   contrato 12345 (Fibra) → Pontos BL 70 × fator 2,6 = R$ 182,00 ✓ (se Ricardo fechou 3 estrelas)

2. Pipeline lê Pontos Móvel Combo do mesmo contrato (ou linha Móvel vinculada):
   40 × fator 2,6 = R$ 104,00 ✓

3. Pipeline lê BD_CHURN, Adimplência, Suspensos, Estornos:
   nenhuma ocorrência para esses contratos no mês ✓

4. Updates em 1 - Vendas:
   Linha Fibra:  FATOR_APLICADO = 2,6, RECEITA_REALIZADA = 182,00, STATUS_CHURN = ATIVO,
                 ESTRELAS_NO_MES = 3_ESTRELAS
   Linha Móvel:  FATOR_APLICADO = 2,6, RECEITA_REALIZADA = 104,00

5. Aba Conciliacao Mensal:
   sem divergência para esses dois contratos

6. Em set/2026 (M+3):
   Pipeline detecta liberação dos 0,4 na aba Adimplência do extrato de setembro
   Linha Fibra:  STATUS_ADIMPL_90D = ADIMPLENTE_90D_LIBERADO
   Receita adicional: 0,4 × 70 × 2,6 = R$ 72,80 entra no extrato de setembro
   → gera item de revisão para o Ricardo confirmar (decisão §11.2)
```

### 13.3. Caso de divergência

Venda igual à 13.1 (instalada em 04/06/2026), mas cliente cancela em 17/06/2026 (13 dias após instalação — churn voluntário <30d).

```
Extrato de junho mostra:
  BD_INSTALAÇÃO: contrato 12345 → R$ 182,00 (Fibra) + R$ 104,00 (Móvel) inicialmente lançado
  BD_CHURN:      contrato 12345 → desconto 100% (regra: churn voluntário <30d)

Updates em 1 - Vendas:
  RECEITA_REALIZADA = 0,00 (Fibra e Móvel)
  STATUS_CHURN      = CHURN_VOLUNTARIO

Conciliacao Mensal mostra:
  CT.12345 | Esperado R$ 182,00 → Recebido R$ 0,00 | Δ -182,00
            Explicação automática: "churn voluntário 13 dias após instalação (100% desconto pela Carta de Meta de junho)"
  → não vira tarefa pendente (explicação resolveu)

E o Móvel?
  BD_CHURN ou Estorno Móvel Venda Combo mostra estorno do Móvel também
  Linha Móvel: RECEITA_REALIZADA = 0,00, STATUS_CHURN = CHURN_VOLUNTARIO
  Conciliação: -R$ 104,00, mesma explicação
  (Nota: a aba Estorno Móvel usa Valor plano R$ 40 como base de desconto na
   reconciliação interna da Vero — camada à parte do Pontos Móvel Combo × fator)
```

### 13.4. Exemplo de variação por segmentação

A maioria dos planos tem pontuação idêntica entre Especial/Ouro/Prata/Padrão. Exceção registrada na tabela 04.05: `MUNDO FIBRA 550 MB + ASSISTENCIA RESIDENCIAL` tem `Especial=95, Ouro=97, Prata=97, Padrão=97`. Para esse plano, a coluna `SEGMENTACAO` da venda determina o `PONTOS_VENDA`:

```
Venda em cidade Especial: PONTOS_VENDA = 95
Venda em cidade Ouro/Prata/Padrão: PONTOS_VENDA = 97
```

Esse caso justifica a estrutura `pontuacao` ser um objeto de 4 chaves no `pontuacao_planos.json`, mesmo que na prática a maioria das chaves seja redundante.

---

## 14. Próxima ação

1. ~~**Resolver a §11.9**~~ ✅ 21/05/2026 — Cenário 1 confirmado por reverse-engineering exato do extrato de março (ver §11.9). 3 correções ao modelo de Móvel aplicadas nesta rev 4.
2. **Iniciar Fase 1** (Sprint Integridade de Vendas) — combo bem nascido é pré-requisito de tudo. Levantamento dos 7 portões + 15 invariantes em curso (planejar antes de codar).
3. Manter este documento como north star — atualizar conforme as fases forem revelando detalhes não previstos.
