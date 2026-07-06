// ONE-SHOTS — Programa de Pontos PAP · Fase 1 (Motor de Crédito + Ledger).
// Spec: BRIEF_PROGRAMA_PONTOS_PAP_FASE1.md.
//
// Rodar no editor Apps Script, na ORDEM sugerida:
//   1) criarAbaPontosLedger()          — cria a aba com o header correto.
//   2) dryRunPontosPapJulho()          — preview dos contadores (não grava).
//   3) backfillPontosPapJulho()        — grava os créditos de julho (idempotente).
//   4) configurarTriggerPontosPapDiario() — trigger diário 09h30 (após cruzamento Vero 09h).
//
// Convenção do projeto: arquivos _*Setup.js NÃO vão no deploy versionado do
// Code.js — executar no editor e REMOVER no push seguinte. O entrypoint do
// trigger (`creditarPontosPAPDiario`) fica em ParceirosAPI.js (deployado).

// 1) Cria a aba `PAP Pontos Ledger` com HEADERS_LEDGER (idempotente — se já
//    existir, _papGetOrCreateSheet só devolve a aba).
function criarAbaPontosLedger() {
  var sh = _papGetOrCreateSheet(PAP_SHEET_LEDGER, HEADERS_LEDGER);
  Logger.log('Aba "' + PAP_SHEET_LEDGER + '" pronta. Linhas: ' + sh.getLastRow());
  return { ok: true, linhas: sh.getLastRow() };
}

// 2) Dry-run do backfill: só conta, não grava. Conferir creditadas/semParceiro/
//    ambiguos antes de gravar.
function dryRunPontosPapJulho() {
  var res = creditarPontosPAPVendas({ dryRun: true, origem: 'BACKFILL' });
  Logger.log('dryRunPontosPapJulho: ' + JSON.stringify(res));
  return res;
}

// 3) Backfill real (uma vez após deploy). Rodar 2× → a 2ª deve dar creditadas:0.
function backfillPontosPapJulho() {
  var res = creditarPontosPAPVendas({ origem: 'BACKFILL' });
  Logger.log('backfillPontosPapJulho: ' + JSON.stringify(res));
  return res;
}

// 4) Trigger diário 09h30 (após o cruzamento Vero das 09h). Idempotente.
function configurarTriggerPontosPapDiario() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'creditarPontosPAPDiario') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('creditarPontosPAPDiario')
    .timeBased()
    .atHour(9)
    .nearMinute(30)
    .everyDays(1)
    .create();
  Logger.log('Trigger diário criado: creditarPontosPAPDiario @ ~09h30');
}

function removerTriggerPontosPapDiario() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'creditarPontosPAPDiario') {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  Logger.log('Triggers removidos: ' + n);
}
