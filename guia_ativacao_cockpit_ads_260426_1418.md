<!-- dharmapro-crm | guia_ativacao_cockpit_ads_260426_1418.md | 26/04/2026 14:18 | Ativacao do cockpit Claude Ads no DharmaPro -->

# Guia de Ativacao do Cockpit Ads

## Objetivo

Fazer o `Painel Ads` do DharmaPro parar de depender de leitura solta de Meta Ads
e passar a consumir o pacote oficial do `Claude Ads 2.0`.

Resultado esperado:
- o CRM vira a tela principal de operacao;
- o sistema mostra `pause`, `scale`, inteligencia comercial e experimentos;
- a leitura fica didatica para uso diario.

## Como funciona

Fluxo ideal:

`meta-ads-vero` -> webhook do DharmaPro -> Script Properties -> `PainelAds.html`

Ou seja:
1. o `meta-ads-vero` gera o bridge;
2. ele envia esse bridge para o CRM;
3. o CRM salva o JSON nas propriedades do script;
4. o `Painel Ads` le esse bundle e renderiza o cockpit.

## O que ja esta pronto

No `dharmapro-crm`:
- `Code.js` ja aceita `action = claude_ads_bridge_upsert`
- `MetaAdsAPI.js` ja consegue ler:
  - `CLAUDE_ADS_BRIDGE_JSON`
  - `CLAUDE_ADS_BRIDGE_URL`
- `PainelAds.html` ja mostra:
  - resumo do operador
  - acao prioritaria
  - inteligencia comercial
  - experimentos
  - fila de automacao
  - readiness

No `meta-ads-vero`:
- o ciclo diario ja gera `bridge_crm_ads_latest.json`
- o pipeline ja tenta enviar ao CRM quando as env vars existem

## Passo 1: confirmar o segredo do CRM

No Apps Script do DharmaPro, confirme qual eh o segredo esperado no `doPost`.

Hoje, o envio do `meta-ads-vero` usa:
- `DHARMAPRO_WEBHOOK_SECRET`

Esse valor precisa bater com o segredo validado pelo CRM.

## Passo 2: obter a URL do web app do DharmaPro

Voce vai precisar da URL publicada do Apps Script do CRM.

Ela sera usada como:
- `DHARMAPRO_WEBHOOK_URL`

## Passo 3: configurar o meta-ads-vero

No ambiente onde o `meta-ads-vero` roda, definir:

```powershell
$env:DHARMAPRO_WEBHOOK_URL="URL_DO_WEBAPP_DHARMAPRO"
$env:DHARMAPRO_WEBHOOK_SECRET="SEGREDO_COMPARTILHADO"
```

Se preferir persistir depois, isso pode ir para `.env` ou para o ambiente do n8n/VPS.

## Passo 4: rodar o ciclo diario

Executar:

```powershell
node "G:\Meu Drive\Projetos Claude\meta-ads-vero\scripts\run_daily_cycle_260426_0435.js"
```

Se estiver tudo certo, a saida deve indicar:
- `Bridge enviado ao CRM: SIM`

## Passo 5: validar no DharmaPro

Abrir o `Painel Ads` no CRM e conferir:
- topo com `Claude Ads 2.0`
- bloco `Resumo do Operador`
- bloco com `Pausar / Revisar`, `Escalar com cuidado` e `Observar`
- inteligencia comercial
- experimentos prioritarios

Se isso aparecer, o cockpit esta ativo.

## Plano B temporario

Se o webhook ainda nao estiver publicado, da para testar manualmente salvando
o conteudo do bridge em:

- `CLAUDE_ADS_BRIDGE_JSON`

ou apontando:

- `CLAUDE_ADS_BRIDGE_URL`

Mas isso eh apenas um teste. O ideal operacional eh webhook automatico.

## Ordem de uso recomendada

Todo dia:
1. rodar o ciclo diario do `meta-ads-vero`
2. abrir `Painel Ads` no DharmaPro
3. olhar primeiro:
   - `Pausar / Revisar`
   - `Escalar com cuidado`
   - `Pior publico`
   - `Pior criativo`
4. so depois abrir Meta Ads para executar

## Regra simples de operacao

- se apareceu em `pause`, investigar rapido e cortar desperdicio
- se apareceu em `scale`, subir com degrau pequeno
- se apareceu em `observar`, nao agir por ansiedade
- se apareceu em `experimento`, testar com verba controlada

## Observacao importante

O CRM agora pode ser sua tela principal de leitura.
Mas a execucao ainda acontece no Meta Ads.

Entao a logica correta eh:
- decidir no CRM
- executar no Meta
- medir de novo no CRM no dia seguinte
