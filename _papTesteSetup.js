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
