// ══════════════════════════════════════════════════════════════════════════
//  ONE-SHOT — Setup do trigger diario de Cruzamento Vero
//
//  Executar UMA VEZ no editor Apps Script:
//    1) configurarTriggerCruzamentoVeroDiario
//    2) (opcional) testarBuscarVeroAgora — para validar busca Gmail + parsing
//
//  Apos rodar, este arquivo pode ser apagado no proximo clasp push.
// ══════════════════════════════════════════════════════════════════════════

function configurarTriggerCruzamentoVeroDiario() {
  // Remove triggers antigos da mesma funcao (idempotente)
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'importarRelatorioVeroAutomatico') {
      ScriptApp.deleteTrigger(t);
      Logger.log('Trigger antigo removido.');
    }
  });

  ScriptApp.newTrigger('importarRelatorioVeroAutomatico')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .nearMinute(0)
    .inTimezone('America/Sao_Paulo')
    .create();

  Logger.log('OK — trigger diario criado para 09h BRT (importarRelatorioVeroAutomatico).');
}

function removerTriggerCruzamentoVeroDiario() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'importarRelatorioVeroAutomatico') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  Logger.log('Triggers removidos: ' + n);
}

function testarBuscarVeroAgora() {
  var res = buscarEImportarVero('manual_test');
  Logger.log('Resultado: ' + JSON.stringify(res, null, 2));
  return res;
}

// Forca o dialogo OAuth para o escopo gmail.readonly.
// Roda uma chamada GmailApp diretamente nesta funcao para que o
// analisador estatico do editor detecte a dependencia e dispare a
// reautorizacao quando o usuario clicar em Executar.
function forcarAutorizacaoGmail() {
  var n = GmailApp.search('in:inbox', 0, 1).length;
  Logger.log('OK — Gmail acessivel. Threads retornados na busca de teste: ' + n);
  return n;
}

function limparUltimoThreadProcessadoVero() {
  PropertiesService.getScriptProperties().deleteProperty('CRUZ_VERO_LAST_THREAD');
  Logger.log('CRUZ_VERO_LAST_THREAD removido. Proxima execucao processara o ultimo e-mail mesmo se for o mesmo thread.');
}
