// ════════════════════════════════════════════════════════════════════════════
//  FASE 4 — Migração de leads históricos de campanhas pausadas → AG.
//  One-shot: rodar UMA VEZ no editor Apps Script.
//  1) verificarLeadsParaMigrarFase4()  — DRY-RUN (só lista, não altera).
//  2) migrarLeadsHistoricosCampanhasPausadas() — faz backup da aba + re-tag.
//  Depois de validar, remover este arquivo no próximo push.
//  Usa CAMPANHAS_PAUSADAS_META + CFG_META de MetaAdsAPI.js (globais no GAS).
// ════════════════════════════════════════════════════════════════════════════

var _FASE4_DESTINO = 'AG - Vero Fibra Amplo';
var _FASE4_CORTE   = new Date('2026-05-17T00:00:00-03:00'); // início da agência (BRT)

/** DRY-RUN: lista os leads que SERIAM migrados, sem alterar nada. */
function verificarLeadsParaMigrarFase4() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) { Logger.log('Aba não encontrada.'); return; }
  var ult = aba.getLastRow();
  if (ult < 2) { Logger.log('Sem leads.'); return; }

  var camps = aba.getRange(2, 6, ult - 1, 1).getValues(); // F: utm_campaign
  var datas = aba.getRange(2, 1, ult - 1, 1).getValues();  // A: data_entrada
  var alvo = [];
  for (var i = 0; i < camps.length; i++) {
    var c = String(camps[i][0] || '').trim();
    if (!_campanhaPausadaMeta_(c)) continue;
    var d = datas[i][0];
    if (!(d instanceof Date) || d < _FASE4_CORTE) continue;
    alvo.push('linha ' + (i + 2) + ': "' + c + '" (' +
      Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy') + ') → "' + _FASE4_DESTINO + '"');
  }
  Logger.log('DRY-RUN Fase 4 — ' + alvo.length + ' lead(s) a migrar (pós 17/05):\n' + (alvo.join('\n') || '(nenhum)'));
  return { total: alvo.length, diff: alvo };
}

/** Faz backup da aba e re-atribui os leads pausados (pós 17/05) para AG. */
function migrarLeadsHistoricosCampanhasPausadas() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) { Logger.log('Aba não encontrada.'); return; }
  var ult = aba.getLastRow();
  if (ult < 2) { Logger.log('Sem leads.'); return; }

  // 1) Backup da aba inteira (cópia na mesma planilha).
  var bkpNome = 'Leads Meta Ads (bkp ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm') + ')';
  aba.copyTo(ss).setName(bkpNome);
  Logger.log('Backup criado: "' + bkpNome + '"');

  // 2) Re-tag da coluna F (utm_campaign).
  var rng   = aba.getRange(2, 6, ult - 1, 1); // F: utm_campaign
  var camps = rng.getValues();
  var datas = aba.getRange(2, 1, ult - 1, 1).getValues(); // A: data_entrada
  var n = 0, diff = [];
  for (var i = 0; i < camps.length; i++) {
    var c = String(camps[i][0] || '').trim();
    if (!_campanhaPausadaMeta_(c)) continue;
    var d = datas[i][0];
    if (!(d instanceof Date) || d < _FASE4_CORTE) continue;
    diff.push('linha ' + (i + 2) + ': "' + c + '" → "' + _FASE4_DESTINO + '"');
    camps[i][0] = _FASE4_DESTINO;
    n++;
  }
  if (n > 0) rng.setValues(camps);

  Logger.log('Fase 4: migrados ' + n + ' lead(s). Backup: "' + bkpNome + '".\n' + diff.join('\n'));
  return { migrados: n, backup: bkpNome, diff: diff };
}
