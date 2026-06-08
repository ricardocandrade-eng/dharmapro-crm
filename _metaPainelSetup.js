/**
 * _metaPainelSetup.js  (one-shot — rodar no editor quando precisar mudar)
 *
 * Script Properties do Cockpit Financeiro do Painel Ads:
 *  - META_AGENCIA_FEE_MENSAL = R$/mês do fee da agência (0 = sem agência)
 *  - META_TM_REAL_OVERRIDE   = override manual do TM em R$ (0 = AUTO/dinâmico)
 *
 * **TM é DINÂMICO por padrão** — `_getMetaConfigFinanceiro_` calcula a partir
 * das vendas META ADS instaladas do período (Σ valor ÷ qtd com valor>0) × fator
 * estrela (CFG.FATOR_VERO, hoje 2,6). Só usa override se META_TM_REAL_OVERRIDE>0.
 * Fallback final (amostra < 3): R$ 267,69.
 *
 * Quando override faz sentido: fechamento de mês com fator alterado e a amostra
 * de instaladas no Painel ainda não reflete (raro). Caso geral: deixar em 0.
 *
 * Como rodar:
 *   1. Ajustar FEE_MENSAL / TM_OVERRIDE abaixo conforme estado atual
 *   2. Editor Apps Script → função `metaPainelSetup` → ▶ Executar
 *   3. Conferir log
 */
function metaPainelSetup() {
  var FEE_MENSAL  = 1500; // editar: R$/mês do fee da agência (0 quando cortar)
  var TM_OVERRIDE = 0;    // 0 = automático (recomendado). Setar só se quiser fixar.

  PropertiesService.getScriptProperties().setProperties({
    'META_AGENCIA_FEE_MENSAL': String(FEE_MENSAL),
    'META_TM_REAL_OVERRIDE':   String(TM_OVERRIDE)
  });

  var p = PropertiesService.getScriptProperties();
  Logger.log('OK — fee=' + p.getProperty('META_AGENCIA_FEE_MENSAL')
           + ' / tm_override=' + p.getProperty('META_TM_REAL_OVERRIDE')
           + ' (0 = TM dinâmico via vendas Meta instaladas × fator)');
}

/** Diagnóstico (rodar no editor) — mostra valores atuais sem alterar. */
function metaPainelStatus() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('META_AGENCIA_FEE_MENSAL: ' + (p.getProperty('META_AGENCIA_FEE_MENSAL') || '(vazio → default 0)'));
  Logger.log('META_TM_REAL_OVERRIDE:   ' + (p.getProperty('META_TM_REAL_OVERRIDE')   || '(vazio → TM dinâmico)'));
  // Limpa Script Property antiga (META_TM_REAL → renomeada pra _OVERRIDE em 08/06)
  var legacy = p.getProperty('META_TM_REAL');
  if (legacy) Logger.log('⚠ Property legada META_TM_REAL=' + legacy + ' (pode apagar — ignorada pelo código novo)');
}
