/**
 * FeedbackPainelAdsAPI.js
 *
 * Captura observações do operador (Ricardo) direto no Painel Ads, com snapshot
 * automático do estado atual da tela. Cada feedback fica disponível pro Claude
 * via endpoint público `?action=feedback_painel_ads` — usado pelo slash command
 * `/diag-meta-ads` no início de cada sessão.
 *
 * Aba: "Feedback Painel Ads" (auto-criada por _ensureAbaFeedbackPainelAds_).
 * Colunas A-F: timestamp · usuario · contexto_json · observacao · lido_em · lido_por.
 */

var CFG_FEEDBACK_PAINEL = {
  ABA: 'Feedback Painel Ads',
  COLS: 6
};

/** Cria a aba se não existir (idempotente). */
function _ensureAbaFeedbackPainelAds_() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_FEEDBACK_PAINEL.ABA);
  if (aba) return aba;
  aba = ss.insertSheet(CFG_FEEDBACK_PAINEL.ABA);
  aba.getRange(1, 1, 1, CFG_FEEDBACK_PAINEL.COLS).setValues([[
    'timestamp', 'usuario', 'contexto_json', 'observacao', 'lido_em', 'lido_por'
  ]]).setFontWeight('bold').setBackground('#1a1d24').setFontColor('#e8ecf3');
  aba.setColumnWidth(1, 160);
  aba.setColumnWidth(2, 120);
  aba.setColumnWidth(3, 380);
  aba.setColumnWidth(4, 600);
  aba.setColumnWidth(5, 160);
  aba.setColumnWidth(6, 120);
  aba.setFrozenRows(1);
  return aba;
}

/**
 * Salva uma observação do operador. Chamado via google.script.run pelo Painel Ads.
 *
 * @param {string} usuario         Login do operador (AppState.get('usuario'))
 * @param {object} contexto        Snapshot do painel: periodo, resumo, financeiro, alertas
 * @param {string} observacao      Texto livre que o operador digitou
 * @returns {{ok:boolean, linha:number, erro?:string}}
 */
function salvarFeedbackPainelAds(usuario, contexto, observacao) {
  try {
    var obs = String(observacao || '').trim();
    if (!obs) return { ok: false, erro: 'observacao_vazia' };
    if (obs.length > 4000) obs = obs.slice(0, 4000);

    var aba = _ensureAbaFeedbackPainelAds_();
    var ctxJson = '';
    try { ctxJson = JSON.stringify(contexto || {}); } catch (eCtx) { ctxJson = '{}'; }
    if (ctxJson.length > 8000) ctxJson = ctxJson.slice(0, 8000) + '…';

    aba.appendRow([
      new Date(),
      String(usuario || 'anônimo').slice(0, 80),
      ctxJson,
      obs,
      '',
      ''
    ]);
    return { ok: true, linha: aba.getLastRow() };
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e) };
  }
}

/**
 * Lista os últimos N feedbacks do operador. Chamado pela UI do Painel Ads
 * (mostra histórico recente abaixo do campo de observação) e pelo Claude
 * via endpoint público.
 *
 * @param {number} limite  default 5, máx 50
 * @returns {{ok:boolean, total:number, feedbacks:Array}}
 */
function listarFeedbacksPainelAds(limite) {
  try {
    var aba = _ensureAbaFeedbackPainelAds_();
    var ult = aba.getLastRow();
    if (ult < 2) return { ok: true, total: 0, feedbacks: [] };
    var n = Math.max(1, Math.min(50, parseInt(limite || 5, 10)));
    var inicio = Math.max(2, ult - n * 3 + 1); // pega janela maior pra ordenar desc
    var raw = aba.getRange(inicio, 1, ult - inicio + 1, CFG_FEEDBACK_PAINEL.COLS).getValues();
    var tz = Session.getScriptTimeZone();
    var arr = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r[0]) continue;
      var ts = r[0] instanceof Date ? r[0] : null;
      var ctx = {};
      try { ctx = r[2] ? JSON.parse(r[2]) : {}; } catch (eP) { ctx = {}; }
      arr.push({
        linha:        inicio + i,
        timestamp:    ts ? ts.toISOString() : String(r[0] || ''),
        timestamp_br: ts ? Utilities.formatDate(ts, tz, 'dd/MM HH:mm') : '',
        usuario:      String(r[1] || ''),
        contexto:     ctx,
        observacao:   String(r[3] || ''),
        lido_em:      r[4] instanceof Date ? r[4].toISOString() : String(r[4] || ''),
        lido_por:     String(r[5] || '')
      });
    }
    arr.sort(function (a, b) { return b.linha - a.linha; });
    return { ok: true, total: arr.length, feedbacks: arr.slice(0, n) };
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e), feedbacks: [] };
  }
}

/**
 * Marca feedbacks como lidos pelo Claude (uso interno do slash command).
 * Não obrigatório — só serve pra UI mostrar quais já foram processados.
 */
function marcarFeedbacksPainelAdsComoLidos(linhas, lidoPor) {
  try {
    var aba = _ensureAbaFeedbackPainelAds_();
    var agora = new Date();
    var arr = Array.isArray(linhas) ? linhas : [];
    for (var i = 0; i < arr.length; i++) {
      var ln = parseInt(arr[i], 10);
      if (ln > 1) {
        aba.getRange(ln, 5, 1, 2).setValues([[agora, String(lidoPor || 'claude')]]);
      }
    }
    return { ok: true, marcados: arr.length };
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e) };
  }
}

/**
 * Endpoint público `?action=feedback_painel_ads&limit=N` (sem secret — feedback é
 * do próprio Ricardo, sem PII de cliente). Chamado pelo slash command
 * `/diag-meta-ads` no início das sessões pra puxar observações recentes.
 */
function _serveActionFeedbackPainelAds_(params) {
  try {
    var limit = parseInt((params && params.limit) || '10', 10);
    return Object.assign({ gerado_em: _agoraISOBrt_() }, listarFeedbacksPainelAds(limit));
  } catch (e) {
    return { ok: false, erro: e && e.message || String(e) };
  }
}
