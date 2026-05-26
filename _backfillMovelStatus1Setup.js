// ─────────────────────────────────────────────────────────────────────────────
// ONE-SHOT — Backfill: Móvel Combo em "2- Aguardando Entrega" cuja Fibra mãe
// ainda está em "1- Conferencia/Ativação" deve voltar para status 1.
//
// Contexto: até 25/05/2026, `criarVendaMovelVinculada` nascia com status
// "2- Aguardando Entrega" por engano. Foi corrigido para "1- Conferencia/Ativação"
// (mesmo da Fibra). Este script ajusta o histórico — só Móveis vinculados a
// Fibras que HOJE seguem em status 1 (i.e., a mãe nem saiu da conferência,
// então o filho estar em "Aguardando Entrega" é claramente o bug).
//
// Conservador: edita apenas a célula STATUS via setValue (preserva tudo o mais).
// Idempotente: rodar de novo não muda nada (filtro só pega Móveis em status 2).
//
// Rodar UMA VEZ no editor:
//   1) `backfillMovelStatus1DryRun()`  — lista o que seria alterado
//   2) `backfillMovelStatus1Aplicar()` — aplica
//
// Depois deste deploy, remover o arquivo no próximo push.
// ─────────────────────────────────────────────────────────────────────────────

function backfillMovelStatus1DryRun() {
  return _backfillMovelStatus1Core_(false);
}

function backfillMovelStatus1Aplicar() {
  return _backfillMovelStatus1Core_(true);
}

function _backfillMovelStatus1Core_(aplicar) {
  var sheet = _getSheet();
  var c = CONFIG.COLUNAS;
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    Logger.log('Planilha vazia.');
    return { sucesso: true, candidatos: 0, alterados: 0 };
  }

  var rng = sheet.getRange(3, 1, lastRow - 2, CONFIG.TOTAL_COLUNAS).getValues();
  var vinculos = _getVinculosVendasMap_(); // { filhasPorMae, maePorFilha }

  var statusMaeAlvo = '1- Conferencia/Ativação';
  var statusFilhoErrado = '2- Aguardando Entrega';
  var statusFilhoNovo = '1- Conferencia/Ativação';

  var candidatos = [];
  for (var i = 0; i < rng.length; i++) {
    var linha = i + 3;
    var produto = String(rng[i][c.PRODUTO] || '');
    if (_normalizarTexto(produto).indexOf('MOVEL') === -1) continue;

    var statusFilho = String(rng[i][c.STATUS] || '').trim();
    if (statusFilho !== statusFilhoErrado) continue;

    var maeInfo = vinculos.maePorFilha && vinculos.maePorFilha[linha];
    if (!maeInfo || !maeInfo.vendaMaeLinha) continue;

    var maeLinha = maeInfo.vendaMaeLinha;
    if (maeLinha < 3 || maeLinha > lastRow) continue;

    var statusMae = String(rng[maeLinha - 3][c.STATUS] || '').trim();
    if (statusMae !== statusMaeAlvo) continue;

    candidatos.push({
      linha: linha,
      cliente: String(rng[i][c.CLIENTE] || ''),
      produto: produto,
      maeLinha: maeLinha,
      maeStatus: statusMae
    });
  }

  Logger.log('Candidatos: ' + candidatos.length);
  candidatos.forEach(function(x) {
    Logger.log(' • L' + x.linha + ' [' + x.produto + '] ' + x.cliente +
               ' (mãe L' + x.maeLinha + ' = ' + x.maeStatus + ')');
  });

  if (!aplicar) {
    return { sucesso: true, dryRun: true, candidatos: candidatos.length, detalhes: candidatos };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (le) {
    return { sucesso: false, mensagem: '⚠️ Sistema ocupado. Tente em instantes.' };
  }
  var alterados = 0;
  try {
    candidatos.forEach(function(x) {
      sheet.getRange(x.linha, c.STATUS + 1).setValue(statusFilhoNovo);
      alterados++;
    });
    SpreadsheetApp.flush();
    // Invalida caches (lista + funil) e refresca por linha alterada.
    try {
      _limparCacheSemLista();
      candidatos.forEach(function(x) { _atualizarVendaNoCache_(x.linha); });
    } catch (eCache) {
      Logger.log('Falha refresh cache (ignorada): ' + (eCache && eCache.message || eCache));
    }
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  Logger.log('Alterados: ' + alterados + '/' + candidatos.length);
  return { sucesso: true, aplicado: true, candidatos: candidatos.length, alterados: alterados };
}
