// ──────────────────────────────────────────────────────────────────────────────
// _safraInspectSetup.js — 26/05/2026 — Fase 4 (espelho diário SAFRA)
// One-shot read-only. Pega o anexo mais recente do email Vero (reusa o helper
// existente do `CruzamentoAutoAPI.js`), converte pra Sheets temp, lista todas as
// abas, e pra cada aba que match "SAFRA" printa header + 5 primeiras linhas.
// Não escreve nada em produção (a temp é descartada no finally).
// Rodar: editor → _safraInspect → Executar. Cola o log aqui.
// Deletar após o uso + push de novo.
// ──────────────────────────────────────────────────────────────────────────────

function _safraInspect() {
  var thread = _buscarThreadVeroMaisRecente_();
  if (!thread) {
    Logger.log('Nenhum email Vero encontrado nos últimos 14 dias.');
    return;
  }
  Logger.log('Thread: ' + thread.getFirstMessageSubject() + ' | data: ' + thread.getLastMessageDate());

  var anexo = _baixarAnexoXlsxDoThread_(thread);
  if (!anexo) {
    Logger.log('Sem anexo .xlsx na thread.');
    return;
  }
  Logger.log('Anexo: ' + anexo.nome);

  var tempFileId = null;
  try {
    tempFileId = _xlsxParaSheetsTemp_(anexo.blob, anexo.nome);
    var wb = SpreadsheetApp.openById(tempFileId);
    var sheets = wb.getSheets();

    Logger.log('───');
    Logger.log('Total de abas: ' + sheets.length);
    sheets.forEach(function(sh) {
      Logger.log('  - "' + sh.getName() + '" (' + sh.getLastRow() + ' linhas × ' + sh.getLastColumn() + ' cols)');
    });
    Logger.log('───');

    // Acha aba SAFRA (qualquer aba com "SAFRA" no nome, case-insensitive)
    var safra = null;
    for (var i = 0; i < sheets.length; i++) {
      var nm = String(sheets[i].getName() || '').toUpperCase();
      if (nm.indexOf('SAFRA') > -1) { safra = sheets[i]; break; }
    }
    if (!safra) {
      Logger.log('⚠️ Nenhuma aba com "SAFRA" no nome encontrada.');
      return;
    }

    Logger.log('Aba SAFRA: "' + safra.getName() + '" — ' + safra.getLastRow() + ' linhas × ' + safra.getLastColumn() + ' cols');
    var lr = Math.min(safra.getLastRow(), 6); // header + 5 linhas
    var lc = safra.getLastColumn();
    if (lr < 1 || lc < 1) { Logger.log('Aba SAFRA vazia.'); return; }
    var vals = safra.getRange(1, 1, lr, lc).getValues();

    Logger.log('───');
    Logger.log('HEADER (linha 1):');
    var header = vals[0];
    for (var c = 0; c < header.length; c++) {
      Logger.log('  col ' + (c + 1) + ': ' + JSON.stringify(header[c]));
    }
    Logger.log('───');
    for (var r = 1; r < vals.length; r++) {
      var row = vals[r];
      Logger.log('LINHA ' + (r + 1) + ':');
      for (var c2 = 0; c2 < row.length; c2++) {
        var v = row[c2];
        var disp = (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy') : v;
        Logger.log('  ' + JSON.stringify(header[c2]) + ' = ' + JSON.stringify(disp));
      }
      Logger.log('  ───');
    }

    // Stats úteis: distribuição de colunas potencialmente relevantes
    Logger.log('AMOSTRAS de colunas suspeitas (contagens não-vazias):');
    var allRows = safra.getRange(2, 1, safra.getLastRow() - 1, lc).getValues();
    for (var c3 = 0; c3 < header.length; c3++) {
      var nome = String(header[c3] || '').trim();
      if (!nome) continue;
      var upNome = nome.toUpperCase();
      if (upNome.indexOf('AGING') < 0 && upNome.indexOf('DIA') < 0 &&
          upNome.indexOf('ATRASO') < 0 && upNome.indexOf('VENC') < 0 &&
          upNome.indexOf('STATUS') < 0 && upNome.indexOf('SUSP') < 0 &&
          upNome.indexOf('ADIMPL') < 0 && upNome.indexOf('CHURN') < 0 &&
          upNome.indexOf('CONTRATO') < 0 && upNome.indexOf('PAY') < 0) continue;
      var preenchidos = 0;
      var amostra = [];
      for (var r2 = 0; r2 < allRows.length; r2++) {
        var v2 = allRows[r2][c3];
        if (v2 !== '' && v2 !== null && v2 !== undefined) {
          preenchidos++;
          if (amostra.length < 5) amostra.push(v2);
        }
      }
      Logger.log('  "' + nome + '" — ' + preenchidos + '/' + allRows.length + ' preenchidos | amostras: ' + JSON.stringify(amostra));
    }
  } finally {
    if (tempFileId) {
      try { DriveApp.getFileById(tempFileId).setTrashed(true); }
      catch (e) { Logger.log('Falha ao apagar temp ' + tempFileId + ': ' + e.message); }
    }
  }
}
