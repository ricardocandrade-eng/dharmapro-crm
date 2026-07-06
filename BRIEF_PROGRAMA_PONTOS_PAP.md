# BRIEF — Programa de Pontos PAP (Loja de Pontos)

> Documento de arquitetura/handoff para implementação via Claude Code.
> Origem: sessão de design com Ricardo (06/07/2026). Substitui o esqueleto
> derivado atual (`_calcularPontos` 1/2 + matching por nome) por um modelo de
> **livro-razão (ledger)**.

---

## 0. Decisões travadas (não reabrir sem novo debate)

| # | Decisão | Valor |
|---|---|---|
| D1 | Régua de pontos | **1 ponto = R$ 1,00 do valor mensal do plano** (`Math.round` do `VALOR`) |
| D2 | Combo | **Soma `VALOR` da fibra + `VALOR` do móvel vinculado** |
| D3 | Valor de referência | `VALOR` gravado na venda, como está (inclui desconto recorrente) |
| D4 | Data de corte | **Data da venda ≥ 01/07/2026** (gate). Crédito só após instalação confirmada |
| D5 | Modelo de saldo | **Ledger de eventos** (não derivado) — exigido pela validade de 24m e pelo estorno pós-resgate |
| D6 | Dial de custo | **Conservador (R$ 0,03–0,05/ponto)** — tabela de resgate como está |
| D7 | Clawback pós-resgate | **Saldo pode ficar negativo**; bloqueia novos resgates até quitar |
| D8 | Validade dos pontos | **24 meses** a partir da data do crédito (instalação), consumo FIFO |
| D9 | Resgate mínimo | **1.000 pontos** |
| D10 | Loja | Catálogo dinâmico (reusa aba `PAP Premios`), admin adiciona/remove/pausa |

---

## 1. Objetivo

Benefício adicional ao PAP (a comissão de ~R$ 100/instalação continua intacta).
O programa custa **3–5% da comissão** no dial conservador — top-up de engajamento,
não substitui remuneração. Premia naturalmente quem vende plano de maior valor.

---

## 2. Régua de acúmulo

- **1 ponto = R$ 1,00** do valor mensal do plano contratado, `Math.round`:
  - R$ 104,99 → **105 pts**
  - R$ 119,99 → **120 pts**
  - R$ 149,90 → **150 pts**
  - R$ 199,90 → **200 pts**
- **Combo:** soma o `VALOR` da linha Fibra + o `VALOR` da linha Móvel vinculada
  (ex.: fibra R$ 150 + móvel R$ 40 = **190 pts**). Usar o mapa de vínculos já
  existente (`_getVinculosVendasMap_`) para achar a linha filha ATIVA.
- **Gate de elegibilidade:** só vendas cuja **data da venda** (campo `DATA_ATIV`,
  fallback `CRIADO_EM`) seja **≥ 01/07/2026**.
- **Trigger do crédito:** status instalado (status `4`/"Finalizada/Instalada"/
  "instalada"/"ativo") **e** com `INSTAL` preenchido. O crédito é datado pela
  **data de instalação** (base da validade de 24 meses).

---

## 3. Atribuição da venda ao parceiro (ponto de atenção)

O parceiro no programa é identificado por **CPF** (`autenticarParceiro`). A venda
carrega o **nome** do vendedor em `RESP` + `CANAL=PAP`. Portanto o motor de crédito
precisa resolver `RESP` (nome) → **CPF do parceiro** via a aba `3 - PAP`
(registro nome↔cpf↔whats).

- Risco: dois parceiros com mesmo nome → atribuição ambígua.
- **Recomendação de hardening (fase futura):** carimbar o CPF do parceiro na
  linha da venda no momento do cadastro via portal (Máscara de Venda / `FilaPAP`),
  eliminando o lookup por nome. Enquanto isso: lookup por nome normalizado, e
  logar em aba de exceção quando o nome casar com 2+ CPFs.

---

## 4. Modelo de dados — Ledger

### Aba nova: `PAP Pontos Ledger`

| Col | Campo | Descrição |
|---|---|---|
| A | `id` | `PL-xxxxxxxx` |
| B | `ts` | Timestamp do lançamento do evento |
| C | `cpf` | CPF do parceiro (normalizado) |
| D | `nome` | Nome do parceiro (snapshot) |
| E | `tipo` | `CREDITO_VENDA` \| `DEBITO_RESGATE` \| `ESTORNO_CANCELAMENTO` \| `EXPIRACAO` \| `AJUSTE_MANUAL` \| `BONUS_CAMPANHA` |
| F | `pontos` | Inteiro **com sinal** (crédito +, débito/estorno/expiração −) |
| G | `ref` | Chave de idempotência: `CONTRATO` p/ crédito/estorno, `id` do resgate p/ débito, lote+mês p/ expiração |
| H | `ref_tipo` | `CONTRATO` \| `RESGATE` \| `LOTE_EXPIRACAO` \| `MANUAL` |
| I | `data_competencia` | Data da instalação (crédito) — base do FIFO/validade |
| J | `expira_em` | `data_competencia + 24 meses` (só CREDITO/BONUS) |
| K | `origem` | `JOB_DIARIO` \| `CRUZAMENTO_VERO` \| `RESGATE_APP` \| `ADMIN` |
| L | `obs` | Livre |

**Saldo** = `SUM(pontos)` sobre o ledger daquele CPF. Pode ser negativo (D7).

**Idempotência:** um `CREDITO_VENDA` por `CONTRATO`; um `ESTORNO_CANCELAMENTO`
por `CONTRATO`; um `EXPIRACAO` por (lote de crédito × mês). Sempre checar `ref`
antes de gravar. Mesmo padrão de dedupe já usado em `EXTRATO_VERO_PROCESSADO_*`
e `VEROHUB_PEDIDO`.

---

## 5. Motor de crédito

Função nova (ex.: `creditarPontosPAPVendas()`), idempotente, chamável por:
- **Trigger diário** (sugestão: junto ou após o cruzamento Vero das 09h).
- **Backfill de julho** (rodar uma vez para carimbar as vendas já instaladas).

Lógica:
1. Varre `1 - Vendas` filtrando `CANAL=PAP`, status instalado, `INSTAL` preenchido,
   `DATA_ATIV ≥ 01/07/2026`.
2. Para cada venda, se já existe `CREDITO_VENDA` com aquele `CONTRATO` no ledger → pula.
3. Calcula pontos = `Math.round(VALOR)` (+ soma do móvel vinculado se combo).
4. Resolve parceiro (`RESP` → CPF via `3 - PAP`).
5. Posta linha `CREDITO_VENDA`, `data_competencia = INSTAL`, `expira_em = INSTAL + 24m`.

---

## 6. Clawback (estorno) — automático

Hook no import diário do Vero (`CruzamentoAutoAPI.js`), que já detecta
cancelamento/churn por contrato.

- Quando um contrato é marcado como cancelado/churn **e** existe `CREDITO_VENDA`
  para ele **sem** `ESTORNO_CANCELAMENTO` correspondente → posta
  `ESTORNO_CANCELAMENTO` de `−(pontos originais)`.
- Alinhar ao §4 do regulamento: idealmente só estornar quando o cancelamento
  **gera estorno de comissão** (ex.: cancelamento comercial / dentro da janela).
  Config flag para quais tipos de cancelamento estornam (default: comercial).
- Saldo pode ficar negativo; resgates ficam bloqueados enquanto negativo.

---

## 7. Validade / Expiração (24 meses, FIFO)

Job mensal, **recompute puro** (não muta linhas de crédito):
1. Por CPF, ordena créditos por `data_competencia` asc e débitos cronologicamente.
2. Consome créditos por débitos (FIFO), apurando o saldo remanescente de cada lote.
3. Para cada lote de crédito cujo `expira_em < hoje` com remanescente > 0 →
   posta `EXPIRACAO` de `−remanescente` (dedupe por lote × mês).

> Fase mais delicada — exige testes unitários cobrindo a interação
> crédito × débito × estorno × expiração. Deixar para depois do MVP.

---

## 8. Resgate + Loja de Pontos

### Reaproveitar o que já existe
- `getCatalogoPremios` / `resgatarPremio` / estoque / `LockService` — adaptar
  para ler saldo do **ledger** (não mais `_calcularPontos` derivado) e postar
  `DEBITO_RESGATE`.
- Gate: `saldo ≥ custo` **e** `saldo ≥ 1000` (mínimo) **e** saldo não-negativo.
- `getExtratoPontos` passa a ler o ledger → extrato honesto (§5 do regulamento).

### Loja (catálogo dinâmico — 80% pronto)
- Aba `PAP Premios` já tem `PUBLICAR` (SIM/NÃO), `estoque`, `imagem`.
- Falta: **tela admin** no CRM para adicionar/remover/pausar prêmio e subir
  imagem sem editar a planilha na mão.

### Fulfillment (novo — operação real)
- Estender `PAP Resgates` com: `endereco_entrega`, `codigo_voucher`, `status`
  (`Pendente` → `Em separação` → `Entregue` / `Cancelado`).
- Crédito Uber/iFood = código (admin cola o voucher). Prêmio físico = endereço
  (capturar no resgate). Tela admin marca "Entregue" e anexa o código.

---

## 9. Migração do código atual

| Hoje | Vira |
|---|---|
| `_calcularPontos` (derivado 1/2, nome) | `SUM` do ledger por CPF |
| Matching por `RESP` lowercase | `RESP` → CPF via `3 - PAP` (atribuição), saldo por CPF |
| `getCatalogoPremios` | mantém (catálogo) |
| `resgatarPremio` | posta `DEBITO_RESGATE` no ledger |
| `getExtratoPontos` | lê ledger (crédito/débito/estorno/expiração) |
| régua 1/2 | régua R$1 = 1pt |

Menu "Pontos & Prêmios" está desativado ("Em breve") — reativar ao concluir a Fase 2.

---

## 10. Fases de implementação (para o Claude Code)

1. **Motor de crédito + ledger.** Aba `PAP Pontos Ledger`, régua R$1=1pt
   (combo somado), atribuição por CPF, job idempotente + backfill de julho.
2. **Resgate sobre o ledger.** Saldo = SUM, mínimo 1.000, extrato honesto,
   reaproveitando catálogo/estoque/lock. Reativar o menu.
3. **Clawback automático.** Hook no cruzamento Vero diário.
4. **Expiração 24m FIFO.** Job mensal + testes unitários.
5. **Loja + entrega.** Admin do catálogo (imagem), captura de código/endereço,
   status de entrega.

Regra do projeto: funções one-shot (`backfill*`, `configurar*`) vão em arquivo
`_*Setup.js` fora do `.claspignore`-tracked, executadas no editor e removidas.
Toda página/menu novo entra em `Gerenciar Usuários` (`US_MENU_LABELS` +
`US_TODOS_MENUS`) — ver regra no `CLAUDE.md`.

---

## 11. Tabela de resgate (dial conservador — custo R$ 0,03–0,05/ponto)

| Prêmio | Valor médio | Pontos | Custo/ponto |
|---|---:|---:|---:|
| Crédito Uber R$ 30 | R$ 30 | 1.000 | R$ 0,030 |
| Crédito iFood R$ 30 | R$ 30 | 1.000 | R$ 0,030 |
| Crédito Uber R$ 50 | R$ 50 | 1.600 | R$ 0,031 |
| Crédito iFood R$ 50 | R$ 50 | 1.600 | R$ 0,031 |
| Fone Bluetooth | R$ 120 | 3.000 | R$ 0,040 |
| Alexa Echo Pop | R$ 250 | 5.000 | R$ 0,050 |
| Smartwatch | R$ 350 | 7.000 | R$ 0,050 |
| Caixa de Som JBL | R$ 450 | 9.000 | R$ 0,050 |
| Echo Dot | R$ 450 | 9.000 | R$ 0,050 |
| Kindle | R$ 600 | 12.000 | R$ 0,050 |
| Tablet | R$ 900 | 18.000 | R$ 0,050 |
| Smartphone intermediário | R$ 1.500 | 30.000 | R$ 0,050 |
| TV 43" | R$ 2.000 | 40.000 | R$ 0,050 |
| Notebook | R$ 3.000 | 60.000 | R$ 0,050 |

> Campanhas de bônus (ex.: "pontos em dobro em agosto") dão picos de engajamento
> sem rebaixar a régua base. O *breakage* (pontos que expiram sem resgate)
> reduz o custo efetivo abaixo dos 3–5%.

---

## 12. Regulamento consolidado (para publicação ao parceiro)

**1. Objetivo.** Reconhecer e premiar os vendedores pelo desempenho em vendas
realizadas e instaladas.

**2. Vigência.** Pontuação contabilizada para vendas realizadas a partir de
**1º de julho de 2026**. Duração indeterminada; pode ser alterado/encerrado
mediante comunicação prévia.

**3. Como acumular.** Cada **R$ 1,00** do valor mensal do plano contratado =
**1 ponto**. Em combo, soma-se o valor da fibra + móvel. Crédito somente após a
confirmação da instalação.

**4. Cancelamentos.** Vendas canceladas antes da instalação não geram pontos.
Caso a venda gere estorno de comissão, a empresa poderá cancelar os pontos
correspondentes — inclusive se já resgatados (saldo pode ficar negativo,
bloqueando novos resgates até a quitação).

**5. Consulta de saldo.** Extrato disponível no portal do parceiro.

**6. Resgate.** A partir de **1.000 pontos**. Pontos podem ser acumulados para
prêmios de maior valor.

**7. Validade.** Os pontos valem **24 meses** a partir da data do crédito.

**8. Disposições gerais.** Pontos pessoais e intransferíveis; não convertíveis em
dinheiro; a empresa pode incluir novos prêmios ou ajustar a tabela conforme
disponibilidade.
