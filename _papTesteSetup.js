/**
 * ONE-SHOT — smoke test da migração PAP→Evolution (27/05/2026).
 *
 * Roda no editor Apps Script: chama `_papEnviarMensagemDireta` direto, que
 * dispara via Evolution na instância Ricardo_Andrade (chip 5532991534154).
 *
 * Destino: DM Ricardo (5532988015161). Mesmo número que recebe os alertas
 * de tráfego do `disparo-grupo` Flow 1 (apelido "ricardo"), então se o teste
 * chegar lá, sabe-se que o caminho PAP→Evolution funciona ponta a ponta
 * com a feature flag PAP_CANAL_NOTIFICACAO default (EVOLUTION).
 *
 * Como rodar:
 *   1. Abrir o editor Apps Script (script.google.com)
 *   2. Selecionar `_papTesteEnvio` no dropdown "Executar"
 *   3. Clicar Executar e olhar o Log
 *   4. Conferir o WhatsApp do 988015161
 *
 * Após validar, deletar este arquivo no próximo push.
 */
function _papTesteEnvio() {
  var alvo = '32988015161';
  var msg  = '🧪 [Teste DharmaPro] Smoke test PAP → Evolution\n' +
             'Disparado via _papEnviarMensagemDireta (chip 5532991534154 → Ricardo_Andrade).\n' +
             'Pode ignorar — só validando o caminho novo de notificações PAP.';
  var res  = _papEnviarMensagemDireta(alvo, msg);
  Logger.log('_papTesteEnvio → ' + JSON.stringify(res));
  return res;
}

/**
 * Variante: testa explicitamente via `_papEnviarMensagemEvolution_` (helper
 * de baixo nível, sem passar pela feature flag). Útil se `_papTesteEnvio`
 * retornar `{sucesso:true, mensagem:'Canal de notificação desligado (kill switch).'}`
 * — ou seja, alguém setou `PAP_CANAL_NOTIFICACAO=OFF` em Script Properties.
 */
function _papTesteEnvioForcado() {
  var alvo = '32988015161';
  var msg  = '🧪 [Teste DharmaPro] Bypass kill switch — disparo via _papEnviarMensagemEvolution_ direto.';
  var res  = _papEnviarMensagemEvolution_(alvo, msg);
  Logger.log('_papTesteEnvioForcado → ' + JSON.stringify(res));
  return res;
}

/**
 * DIAGNÓSTICO — chama a Evolution direto pra ver o estado da instância
 * `Ricardo_Andrade`. Útil quando `_papTesteEnvio` volta com `SessionError`
 * ou outro erro de baixo nível, antes de tentar reparar.
 *
 * Endpoints checados:
 *   - GET /instance/fetchInstances?instanceName=Ricardo_Andrade — lista a
 *     instância com `instance.status`, `qrcode`, etc.
 *   - GET /instance/connectionState/Ricardo_Andrade — `state: open|connecting|close`.
 *
 * `state === 'open'` = chip pareado e enviando. Qualquer outro = precisa
 * de QR code novo (ou via WA Campanha no CRM, ou via Evolution manager).
 */
function _papDiagEvolution() {
  var p = PropertiesService.getScriptProperties();
  var url = (p.getProperty('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  var key = p.getProperty('EVOLUTION_API_KEY');
  if (!url || !key) {
    Logger.log('_papDiagEvolution: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes.');
    return { ok: false, mensagem: 'Properties ausentes.' };
  }
  var headers = { 'apikey': key };
  var resultado = { url: url, instance: 'Ricardo_Andrade' };

  try {
    var r1 = UrlFetchApp.fetch(url + '/instance/connectionState/Ricardo_Andrade',
      { method: 'get', headers: headers, muteHttpExceptions: true });
    resultado.connectionState = {
      http: r1.getResponseCode(),
      body: r1.getContentText().slice(0, 500)
    };
  } catch(e) { resultado.connectionState = { erro: e.message }; }

  try {
    var r2 = UrlFetchApp.fetch(url + '/instance/fetchInstances?instanceName=Ricardo_Andrade',
      { method: 'get', headers: headers, muteHttpExceptions: true });
    resultado.fetchInstances = {
      http: r2.getResponseCode(),
      body: r2.getContentText().slice(0, 1000)
    };
  } catch(e) { resultado.fetchInstances = { erro: e.message }; }

  Logger.log('_papDiagEvolution →\n' + JSON.stringify(resultado, null, 2));
  return resultado;
}
