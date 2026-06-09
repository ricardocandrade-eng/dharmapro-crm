/**
 * _metaPainelSetup.js  (one-shot — rodar UMA VEZ no editor)
 *
 * Zera o fee da agência (contrato encerrado em 09/06/2026). TM segue dinâmico
 * (ticket médio das instaladas META ADS × fator estrela), override=0.
 *
 * Como rodar:
 *   Editor → função `metaPainelSetup` → ▶
 *   Log esperado: "OK — fee=0 / tm_override=0"
 */
function metaPainelSetup() {
  PropertiesService.getScriptProperties().setProperties({
    'META_AGENCIA_FEE_MENSAL': '0',
    'META_TM_REAL_OVERRIDE':   '0'
  });
  var p = PropertiesService.getScriptProperties();
  Logger.log('OK — fee=' + p.getProperty('META_AGENCIA_FEE_MENSAL')
           + ' / tm_override=' + p.getProperty('META_TM_REAL_OVERRIDE'));
}
