// dharmapro-crm | _systemUserTokenSetup.js | one-shot
// Grava SYSTEM_USER_TOKEN nas Script Properties via prompt (sem expor o token no código).
// Uso: abrir editor Apps Script, selecionar `_setSystemUserToken` no dropdown e Executar.
// Apagar este arquivo após confirmar que o token foi gravado.

function _setSystemUserToken() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Configurar SYSTEM_USER_TOKEN',
    'Cole aqui o token WABA (mesmo usado pelo n8n disparo-massa).\nO valor é gravado em Script Properties e nunca aparece no código.',
    ui.ButtonSet.OK_CANCEL
  );

  if (resp.getSelectedButton() !== ui.Button.OK) {
    Logger.log('Cancelado pelo usuário.');
    return;
  }

  var token = (resp.getResponseText() || '').trim();
  if (!token) {
    ui.alert('Token vazio. Nada foi gravado.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('SYSTEM_USER_TOKEN', token);
  ui.alert('OK — SYSTEM_USER_TOKEN gravado (' + token.length + ' caracteres).');
  Logger.log('SYSTEM_USER_TOKEN gravado. Comprimento: ' + token.length + ' chars.');
}

function _checkSystemUserToken() {
  var token = PropertiesService.getScriptProperties().getProperty('SYSTEM_USER_TOKEN');
  if (!token) {
    Logger.log('SYSTEM_USER_TOKEN NÃO está configurado.');
    return;
  }
  Logger.log('SYSTEM_USER_TOKEN existe. Comprimento: ' + token.length + ' chars. Primeiros 8: ' + token.substring(0, 8) + '...');
}
