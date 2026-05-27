# Plano — Padronização / Ponte de Nomes de Planos (long tail do resolver)

**Data:** 21/05/2026 · **Status: IMPLEMENTADO 26/05/2026 — não destravou o gap esperado, mas a infra fica em produção (forward-only).**

> **Resumo do desfecho (26/05):** a Opção recomendada foi executada (Rev9 do JSON com col 14 `NOME_VERO` + passo (0) no resolver). O `fase3Backfill` em janela 6m subiu de 97 → 112 (não 200+ como esperado). Diagnóstico (`_diagBackfillSemCod`) mostrou que o gap real **não era nome truncado**: 282 das 301 vendas sem código têm na coluna PLANO nomes legacy de revs antigas do JSON (formato pipe, NAKED, "ENTRENIMENTO" com typo, B2B). Decisão: encerrar forward-only — não migrar histórico nem expandir aliases. Detalhes em `ARCHITECTURE_FINANCEIRO.md §11.11`.

---

**Data original:** 21/05/2026 · Status original: Plano para aprovação (não implementado)
**Origem:** o resolver de código por sweep VeroHub (deploy 23:46) resolve **97/415**
vendas da janela. O teto vem dos **nomes truncados** no `planos_vero.json`
(ex.: `"850MB FILMES"`) que não casam com o nome completo da Vero do sweep
(`"MUNDO COMPLETO 850MB + FILMES"`). Match automático falha com **falso positivo**
(provado: `"550MB MUNDO FIBRA"` → casou errado a variante `+ ASSISTÊNCIA`;
`"VERO CONTROLE 20GB"` → casou errado um combo fibra). Logo, **não há atalho
automático seguro** — precisa de uma ponte revisada por humano.

---

## Raio de impacto — `planos_vero.json` é contrato crítico

`planos_vero.json` col 0 (`nome`) é a **chave de match** E o **texto exibido**.
Consumidores do `nome`:

| Consumidor | Usa `nome` para | Impacto de renomear |
|---|---|---|
| CRM — dropdown Nova Venda (`getPlanosPorCidadeProduto`) | valor do option (vira o PLANO da venda) | vendas novas nasceriam com nome novo |
| CRM — vendas EXISTENTES (`1 - Vendas` col PLANO) | guardam o nome antigo | **precisariam de migração** (find/replace) |
| CRM — `getValorPlano`/`getOfertasCidade` | lookup por nome | segue o JSON (ok) |
| **LP `ofertasverointernet`** — `PlanosSection.tsx:157`, `HeroForm.tsx:190` | **exibe `plano.nome` ao cliente** | **mudaria o texto que o cliente vê** |
| Endpoint `?action=planos` | retorna `nome` + `nome_lp` | LP/Renata consomem |
| Renata (n8n `no4c`/`no5`) | consome o endpoint | **verificar** se casa/exibe por `nome` |
| `planos_vero_codigos.json` (`nome_crm_match`) | dicionário legado (fallback) | ficaria stale |

➡️ **Renomear `nome` é mudança quebrante e visível ao cliente.** Por regra de
contrato (CLAUDE.md raiz), produtor + consumidores mudariam juntos + migração.

---

## Opção recomendada: **coluna aditiva `NOME_VERO`** (sem renomear, sem migrar)

Em vez de trocar `nome`, **adicionar uma coluna nova** `NOME_VERO` no
`planos_vero.json` = o nome completo da Vero (do sweep) por plano. O `nome`
(col 0) e o `nome_lp` ficam **intactos** → LP, Renata e vendas antigas não mudam.

**Cadeia de resolução (100% exata, sem fuzzy em runtime):**
```
venda.PLANO  ──(match exato col 0)──>  linha do planos_vero.json
              ──(lê NOME_VERO)──────>  nome completo Vero
              ──(na cidade da venda, código cujo nome === NOME_VERO)──>  CÓDIGO
```
Como `NOME_VERO` é setado = nome exato do sweep, o match cidade→código é **exato**
(sem chute). Destrava os MUNDO/avulsos truncados **sem** os riscos do rename.

**Trabalho (offline, revisado):** preencher `NOME_VERO` para os ~41 planos do
`planos_vero.json`. Os combos/bem-nomeados o script casa sozinho (j=1.0); os
**~14 ambíguos** (MUNDO/avulsos truncados + VERO CONTROLE) **você confirma**
numa tabela. Eu gero a proposta, você revisa, eu aplico.

### Fases (opção recomendada)
1. **Gerar proposta de mapa** `nome (col0) → NOME_VERO` (sweep) + marcar os ambíguos. (eu)
2. **Você revisa/corrige** as ~14 linhas ambíguas. (Ricardo — conhece os planos)
3. **Adicionar col `NOME_VERO`** ao `planos_vero.json` (append, sem mexer em col 0..13). Helper one-shot rev (padrão `_atualizarPlanosVeroJsonRevN`). Backward-compat total.
4. **Resolver**: adicionar passo "via NOME_VERO" no `getCodigoVeroPorPlanoCidade` (lê a col, casa exato na cidade) — antes do fallback legado. Sem afrouxar nada.
5. **Re-rodar `fase3Backfill`** (janela 6 meses) → cobertura sobe de 97 pra perto do total.
6. Validar no painel.

**Risco:** baixo. Aditivo; nada que já existe muda; sem migração de venda; LP/Renata intactos.

---

## Opção alternativa: padronização total dos nomes (consistência no ecossistema)

Trocar `nome` (col 0) pelos nomes completos da Vero em **todo o ecossistema**.
Mais "limpo" conceitualmente, porém **projeto coordenado** com mais risco:

### Fases (opção alternativa)
1. Decidir nomes canônicos (= NOME_VERO revisado).
2. **LP**: mudar `PlanosSection.tsx`/`HeroForm.tsx` para exibir **`nome_lp`** (nome amigável) em vez de `nome` — senão o cliente passa a ver nomes técnicos. (muda o repo `ofertasverointernet` + deploy)
3. **Renata**: verificar/ajustar `no4c`/`no5` se casarem por `nome`.
4. `planos_vero.json`: trocar col 0 (helper rev) + `nome_lp` garantido em todos.
5. **Migração das vendas antigas**: one-shot find/replace na col PLANO (`startsWith`, preserva sufixo `| R$`, idempotente, com backup) — padrão da migração VERO DUO (v675).
6. Atualizar `planos_vero_codigos.json` nome_crm_match.
7. Resolver passa a casar exato; re-backfill.

**Risco:** alto/médio. Toca 3 projetos (CRM + LP + Renata) + dados históricos.
Exige coordenação produtor↔consumidor na mesma janela (regra de contrato).

---

## Recomendação

**Fazer a Opção recomendada (coluna `NOME_VERO`)** — destrava o resolver com risco
mínimo e sem mexer no que o cliente vê. A padronização total (Opção alternativa)
fica como melhoria de consistência separada, se/quando quiser unificar nomes na LP.

## Pendências antes de executar (qualquer opção)
- Você revisar as ~14 linhas ambíguas do mapa.
- (Opção alternativa) confirmar como Renata consome `nome` no endpoint.
