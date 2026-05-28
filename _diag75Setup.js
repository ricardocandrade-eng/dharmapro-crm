// ══════════════════════════════════════════════════════════════════════════
//  ONE-SHOT — Diagnóstico de pontos corrompidos em 1-Vendas (Sub-fatia 7.5)
//
//  Contexto: na 1ª aplicação do backfill 7.5 sobre abril/26, a venda 3013549
//  (ANDRESSA) caiu em SEM_PREVISTO porque a célula PONTOS_MOVEL guardava o
//  valor -2.209.150.412.000 (Date object serializado como timestamp em ms).
//  Possivelmente outras vendas têm o mesmo lixo escondido — só não caíram
//  em conciliação ainda porque o extrato delas não rodou.
//
//  Este one-shot é READ-ONLY: só lista os suspeitos e categoriza por tipo
//  de problema. Não corrige nada. Após revisar a saída, o Ricardo decide
//  se quer um one-shot de fix em separado.
//
//  Padrão (memo feedback_one_shots_via_setup_file): rodar UMA VEZ no editor,
//  ler o Logger, depois deletar este arquivo no próximo push.
// ══════════════════════════════════════════════════════════════════════════

function _diag75() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  var last = sheet.getLastRow();
  var n = last - 2;
  var c = CONFIG.COLUNAS;

  var pv = sheet.getRange(3, c.PONTOS_VENDA + 1, n, 1).getValues();
  var pm = sheet.getRange(3, c.PONTOS_MOVEL + 1, n, 1).getValues();
  var contrato = sheet.getRange(3, c.CONTRATO + 1, n, 1).getValues();
  var cliente = sheet.getRange(3, c.CLIENTE + 1, n, 1).getValues();
  var produto = sheet.getRange(3, c.PRODUTO + 1, n, 1).getValues();
  var status = sheet.getRange(3, c.STATUS + 1, n, 1).getValues();

  var problemas = {
    pvNegativo: [],
    pmNegativo: [],
    pvAbsurdo: [],   // > 1000 pontos (planos top pagam ~300)
    pmAbsurdo: [],   // > 500 pontos
    pvDate: [],      // instanceof Date
    pmDate: []
  };

  for (var i = 0; i < n; i++) {
    var rawPV = pv[i][0];
    var rawPM = pm[i][0];
    var lin = i + 3;
    var ref = {
      linha: lin,
      contrato: String(contrato[i][0] || ''),
      cliente: String(cliente[i][0] || ''),
      produto: String(produto[i][0] || ''),
      status: String(status[i][0] || ''),
      pvRaw: rawPV,
      pmRaw: rawPM
    };

    if (rawPV instanceof Date) problemas.pvDate.push(ref);
    else if (typeof rawPV === 'number' && rawPV < 0) problemas.pvNegativo.push(ref);
    else if (typeof rawPV === 'number' && rawPV > 1000) problemas.pvAbsurdo.push(ref);

    if (rawPM instanceof Date) problemas.pmDate.push(ref);
    else if (typeof rawPM === 'number' && rawPM < 0) problemas.pmNegativo.push(ref);
    else if (typeof rawPM === 'number' && rawPM > 500) problemas.pmAbsurdo.push(ref);
  }

  var totalSuspeitas = problemas.pvNegativo.length + problemas.pmNegativo.length +
    problemas.pvAbsurdo.length + problemas.pmAbsurdo.length +
    problemas.pvDate.length + problemas.pmDate.length;

  Logger.log('═══ _diag75 — Vendas com PONTOS suspeitos em 1-Vendas ═══');
  Logger.log('Total varrido: ' + n + ' linhas');
  Logger.log('Total suspeitas: ' + totalSuspeitas);
  Logger.log('---');

  function imprimir(label, lista) {
    Logger.log('[' + label + '] ' + lista.length + ' venda(s)');
    lista.forEach(function(r) {
      Logger.log('  L.' + r.linha + ' | ' + r.contrato + ' | ' + r.cliente +
        ' | ' + r.produto + ' | st=' + r.status +
        ' | PV=' + JSON.stringify(r.pvRaw) + ' | PM=' + JSON.stringify(r.pmRaw));
    });
  }

  imprimir('PV negativo', problemas.pvNegativo);
  imprimir('PM negativo', problemas.pmNegativo);
  imprimir('PV Date object', problemas.pvDate);
  imprimir('PM Date object', problemas.pmDate);
  imprimir('PV absurdo (>1000)', problemas.pvAbsurdo);
  imprimir('PM absurdo (>500)', problemas.pmAbsurdo);

  return {
    total: n,
    suspeitas: totalSuspeitas,
    detalhes: problemas
  };
}

// Limpa células corrompidas (zera). Roda APÓS revisar _diag75.
// Aceita um array de linhas {linha, campo:'PV'|'PM'} pra ser preciso.
// Default: limpa TUDO que _diag75 encontrou.
function _diag75LimparCorrompidas(alvos) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  var c = CONFIG.COLUNAS;

  if (!alvos) {
    var d = _diag75();
    alvos = [];
    d.detalhes.pvNegativo.forEach(function(r){ alvos.push({linha:r.linha,campo:'PV'}); });
    d.detalhes.pvDate.forEach(function(r){ alvos.push({linha:r.linha,campo:'PV'}); });
    d.detalhes.pvAbsurdo.forEach(function(r){ alvos.push({linha:r.linha,campo:'PV'}); });
    d.detalhes.pmNegativo.forEach(function(r){ alvos.push({linha:r.linha,campo:'PM'}); });
    d.detalhes.pmDate.forEach(function(r){ alvos.push({linha:r.linha,campo:'PM'}); });
    d.detalhes.pmAbsurdo.forEach(function(r){ alvos.push({linha:r.linha,campo:'PM'}); });
  }

  var fixed = 0;
  alvos.forEach(function(a) {
    var col = a.campo === 'PV' ? c.PONTOS_VENDA + 1 : c.PONTOS_MOVEL + 1;
    sheet.getRange(a.linha, col).clearContent();
    fixed++;
  });
  Logger.log('_diag75LimparCorrompidas: ' + fixed + ' célula(s) zerada(s)');
  try { _limparCacheListaV3(); } catch (e) {}
  return { ok: true, fixed: fixed };
}
