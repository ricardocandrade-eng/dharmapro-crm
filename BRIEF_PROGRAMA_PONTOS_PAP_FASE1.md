# FASE 1 — Motor de Crédito + Ledger (spec de implementação)

> Handoff para o Claude Code. Pré-req: ler `BRIEF_PROGRAMA_PONTOS_PAP.md`
> (decisões travadas D1–D10). Esta fase entrega **acúmulo de pontos**; resgate
> fica na Fase 2. Não mexer em `resgatarPremio`/catálogo ainda.

## Escopo da Fase 1

1. Criar a aba `PAP Pontos Ledger`.
2. Motor de crédito idempotente (régua R$1=1pt, combo somado, gate 01/07/2026).
3. Leitura de saldo/extrato a partir do ledger (para a Fase 2 plugar).
4. One-shot de backfill de julho + trigger diário.
5. **Não** remover `_calcularPontos` ainda — deixar dormente até a Fase 2 migrar
   os leitores. Marcar com comentário `// LEGADO — substituído pelo ledger (Fase 1)`.

---

## Contexto do código existente (usar, não reinventar)

Arquivo: `ParceirosAPI.js`. Helpers já disponíveis:
- `_papNormCpf(cpf)` — normaliza CPF.
- `autenticarParceiro(cpfLimpo)` → `{ found, nome, ... }`.
- `_papGetOrCreateSheet(nome, headers)` — cria aba com header se faltar.
- `_papGerarId(prefixo)` — id tipo `PL-xxxx`.
- `_papNow()` — timestamp.
- `_getSpreadsheet_()` — planilha principal (Code.js).
- Constantes: `PAP_SHEET_VENDAS` (= `1 - Vendas`), `PAP_SHEET_PREMIOS`, `PAP_SHEET_RESGATES`.
- `CONFIG.COLUNAS` (0-based). Chaves usadas nesta fase: `CANAL`, `STATUS`, `RESP`,
  `PRODUTO`, `VALOR`, `DATA_ATIV`, `INSTAL`, `CONTRATO`, `CLIENTE`.

Mapa de vínculos de combo (em `Code.js`): `_getVinculosVendasMap_()` →
`{ filhasPorMae, maePorFilha }` (linhas 1-based, só ATIVO). Usar para achar a
linha Móvel filha de uma Fibra Combo e somar o `VALOR`.

Registro do parceiro (nome↔CPF): aba `3 - PAP`. O nome do vendedor na venda é
`RESP`; o CPF do parceiro está na col W (índice 4 do bloco lido a partir da col S,
1-based 19). Ver `getMeusPagamentosPAP` para o padrão de leitura de `3 - PAP`.

---

## 1. Schema da aba `PAP Pontos Ledger`

```js
const PAP_SHEET_LEDGER = 'PAP Pontos Ledger';
const HEADERS_LEDGER = [
  'ID','Timestamp','CPF','Nome','Tipo','Pontos',
  'Ref','Ref Tipo','Data Competencia','Expira Em','Origem','Obs'
];
```

`Tipo` ∈ `CREDITO_VENDA | DEBITO_RESGATE | ESTORNO_CANCELAMENTO | EXPIRACAO | AJUSTE_MANUAL | BONUS_CAMPANHA`.
`Pontos` é inteiro com sinal. Nesta fase só grava `CREDITO_VENDA` (+).

---

## 2. Funções a criar (`ParceirosAPI.js`)

### 2.1 `_papResolverCpfParceiroPorNome(nomeResp)` → `{ cpf, nome, ambiguo }`
Lê `3 - PAP`, casa por nome normalizado (trim+lowercase+strip acento).
- 1 match → `{ cpf, nome, ambiguo:false }`.
- 0 match → `{ cpf:'', ... }` (venda fica sem crédito; logar).
- 2+ matches → `{ cpf:'', ambiguo:true }` (não credita; logar exceção).

Cachear o índice nome→CPF numa passagem só (não reler `3 - PAP` por venda).

### 2.2 `_papPontosDaVenda(row, c, vinculosMap, linha1based)` → `number`
- Base: `Math.round(_normalizarValorParaNumero_(row[c.VALOR]))`.
- Se `PRODUTO` contém `COMBO`: somar o `VALOR` da linha Móvel filha
  (`vinculosMap.filhasPorMae[linha1based]`, ler a linha, `Math.round`).
- Retorna inteiro. (Reusar `_normalizarValorParaNumero_` de Code.js para R$→número.)

### 2.3 `_papVendaElegivel(row, c)` → `boolean`
- `CANAL` === `PAP`.
- Status instalado: `STATUS` casa `/^4/` ou inclui `instalad`/`ativo`.
- `INSTAL` preenchido (data válida).
- `DATA_ATIV` (fallback `CRIADO_EM` se existir) **≥ 01/07/2026**.

### 2.4 `creditarPontosPAPVendas(opts)` → `{ ok, creditadas, pulhadas, semParceiro, ambiguos, pontosTotais }`
Motor idempotente. `opts = { dryRun?:bool }`.
1. Carrega set de `Ref` (contratos) já com `CREDITO_VENDA` no ledger (1 leitura).
2. Varre `1 - Vendas` (a partir da linha 3), aplica `_papVendaElegivel`.
3. Para cada elegível com `CONTRATO` **não** no set:
   - resolve parceiro (`_papResolverCpfParceiroPorNome(RESP)`); se sem CPF/ambíguo → conta e pula.
   - pontos = `_papPontosDaVenda(...)`; se ≤ 0 → pula.
   - monta linha ledger: `CREDITO_VENDA`, `Ref=CONTRATO`, `Ref Tipo=CONTRATO`,
     `Data Competencia=INSTAL`, `Expira Em=INSTAL+24m`, `Origem` (param).
4. Grava em **batch** (`setValues`), não `appendRow` por linha. `LockService` ao redor da escrita.
5. `dryRun` → não grava, só retorna contadores.

Idempotência: um `CREDITO_VENDA` por contrato. Reexecução não duplica.

### 2.5 `getSaldoPontos(cpf)` → `{ ok, saldo, porTipo }`
`SUM(Pontos)` do ledger para o CPF. `saldo` pode ser negativo. `porTipo` = soma por `Tipo`.

### 2.6 `getExtratoPontosLedger(cpf, limite=50)` → `{ ok, saldo, eventos:[...] }`
Eventos ordenados desc por `Timestamp`. Cada um: `{ tipo, pontos, ref, data, expira, obs }`.
(Fica pronto para a Fase 2 trocar `getExtratoPontos`.)

---

## 3. One-shots de setup (`_pontosPapSetup.js` — fora do Code.js, remover após uso)

- `criarAbaPontosLedger()` — cria `PAP Pontos Ledger` com `HEADERS_LEDGER`.
- `backfillPontosPapJulho()` — chama `creditarPontosPAPVendas({ origem:'BACKFILL' })`
  e loga o resultado. Rodar **uma vez** no editor após deploy.
- `dryRunPontosPapJulho()` — `creditarPontosPAPVendas({ dryRun:true })` para conferir
  contadores antes de gravar.
- `configurarTriggerPontosPapDiario()` — trigger time-based diário (sugestão 09h30,
  após o cruzamento Vero das 09h), idempotente. `removerTriggerPontosPapDiario()`.

Seguir a convenção do projeto: `_*Setup.js` não vai no deploy versionado do Code.js;
executar no editor e remover no push seguinte.

---

## 4. Testes / validação (antes de fechar a fase)

- `node --check ParceirosAPI.js`.
- **Dry-run**: rodar `dryRunPontosPapJulho()` e conferir `creditadas`, `semParceiro`,
  `ambiguos` fazem sentido (ex.: nenhum contrato duplicado, total de pontos plausível).
- **Idempotência**: rodar `backfillPontosPapJulho()` 2× → a 2ª retorna `creditadas:0`.
- **Combo**: pegar um contrato Fibra Combo conhecido e conferir que os pontos =
  round(valor fibra) + round(valor móvel).
- **Gate**: uma venda instalada com `DATA_ATIV` de junho **não** credita.
- **Saldo**: `getSaldoPontos(cpf)` de um parceiro conhecido bate com a soma manual.

## 5. Critérios de aceite

- [ ] Aba `PAP Pontos Ledger` criada com header correto.
- [ ] `creditarPontosPAPVendas` idempotente (não duplica por contrato).
- [ ] Régua R$1=1pt com combo somado e gate 01/07/2026 corretos.
- [ ] Parceiro sem CPF/ambíguo é pulado e contado (não quebra o motor).
- [ ] `getSaldoPontos`/`getExtratoPontosLedger` leem do ledger.
- [ ] `_calcularPontos` intacto mas marcado como LEGADO (migra na Fase 2).
- [ ] Trigger diário configurável; one-shots em `_pontosPapSetup.js` removidos após uso.

> **Fora de escopo da Fase 1:** resgate, clawback, expiração, loja/admin, UI do
> portal. Não reativar o menu "Pontos & Prêmios" ainda.
