/**
 * ONE-SHOT — grava N8N_API_KEY em Script Properties (29/05/2026).
 *
 * Necessário pra AlertasOpAPI.js consultar status live dos workflows
 * do disparo-grupo via REST API do n8n. Self-test confirma listagem
 * de workflows logo após gravar.
 *
 * Como rodar:
 *   1. Editor Apps Script → seleciona `_setN8nApiKey` no dropdown
 *   2. Executar ▶
 *   3. Conferir Log: deve mostrar "len=207" e quantidade de workflows
 *   4. Avisar — eu deleto este arquivo no próximo push.
 *
 * UI de Script Properties tem bug crônico (ver
 * feedback_gas_script_properties_ui_broken) — por isso via função.
 */
function _setN8nApiKey() {
  var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMzZlNDMzMi1iOGRiLTRhZWUtYjUwMS1iMTA5OGFhMjJhMDMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzc5NjQ5NjAxfQ.6KTNmgxOgh0bVfE2OAPLYOBDwP_ONj1tuqdIN3BeQJM';

  PropertiesService.getScriptProperties().setProperty('N8N_API_KEY', key);
  Logger.log('N8N_API_KEY gravada. len=' + key.length);

  // Self-test
  try {
    var resp = UrlFetchApp.fetch(
      'https://n8n.ofertasverointernet.com.br/api/v1/workflows?active=true',
      { method: 'get', headers: { 'X-N8N-API-KEY': key }, muteHttpExceptions: true }
    );
    var code = resp.getResponseCode();
    if (code === 200) {
      var data = JSON.parse(resp.getContentText());
      var qtd = (data.data || []).length;
      Logger.log('Self-test OK — ' + qtd + ' workflows ativos.');
      return { ok: true, workflowsAtivos: qtd };
    }
    Logger.log('Self-test FALHOU — HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
    return { ok: false, http: code };
  } catch (e) {
    Logger.log('Self-test erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}
