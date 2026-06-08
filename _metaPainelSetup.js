/**
 * _metaPainelSetup.js  (one-shot — rodar UMA VEZ no editor, depois Claude apaga)
 *
 * Configura as Script Properties do Cockpit Financeiro do Painel Ads:
 *  - META_AGENCIA_FEE_MENSAL = R$/mês do fee da agência (0 = sem agência)
 *  - META_TM_REAL            = TM franquia real do mês (ticket × fator estrela)
 *
 * Atualizar mensalmente conforme fechamento do extrato ou mudança de status
 * da agência. Pode ser editado direto na UI de Script Properties também, mas
 * a UI tem bug conhecido (não persiste) — fluxo via função é confiável.
 *
 * Como rodar:
 *   1. Editor Apps Script → dropdown "Selecionar função" → metaPainelSetup
 *   2. Clicar ▶ Executar
 *   3. Conferir log: "OK — fee=1500.00 / tm=267.69"
 *   4. Avisar Claude (delete o arquivo no próximo push)
 */
function metaPainelSetup() {
  var FEE_MENSAL = 1500;   // ← editar quando mudar (0 quando cortar agência)
  var TM_REAL    = 267.69; // ← editar a cada fechamento mensal (ticket × fator)

  PropertiesService.getScriptProperties().setProperties({
    'META_AGENCIA_FEE_MENSAL': String(FEE_MENSAL),
    'META_TM_REAL':            String(TM_REAL)
  });

  // Self-check — lê de volta e confirma
  var p = PropertiesService.getScriptProperties();
  Logger.log('OK — fee=' + p.getProperty('META_AGENCIA_FEE_MENSAL')
           + ' / tm=' + p.getProperty('META_TM_REAL'));

  // Invalida cache de qualquer chamador que tenha lido (defensivo — readers
  // são called fresh per request, mas garante consistência se mudar)
  try { CacheService.getScriptCache().remove('painel_ads_data'); } catch (e) {}
}

/** Diagnóstico (rodar no editor) — mostra valores atuais sem alterar. */
function metaPainelStatus() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('META_AGENCIA_FEE_MENSAL: ' + (p.getProperty('META_AGENCIA_FEE_MENSAL') || '(vazio → default 0)'));
  Logger.log('META_TM_REAL:            ' + (p.getProperty('META_TM_REAL')            || '(vazio → default 267.69)'));
}
