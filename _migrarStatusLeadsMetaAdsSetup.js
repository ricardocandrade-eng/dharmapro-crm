// ============================================================
// ONE-SHOT — Migração da taxonomia de Status na aba "Leads Meta Ads"
// ============================================================
// Mapeia os Status antigos do CRM para as etiquetas do Chatwoot:
//   Converteu       → venda-fechada
//   Desqualificado  → venda-perdida (default) — refina via col J (motivo_desq)
//                     'Sem cobertura'     → sem-viabilidade
//                     'Sem interesse'     → sem-interesse
//                     'Base Vero'         → reprovado-cpf
//                     (outros / vazio)    → venda-perdida
//   Em negociação   → '' (Em aberto, sem desfecho)
//   Sem contato     → '' (Em aberto, sem desfecho)
//
// Idempotente: linhas já com a taxonomia nova são puladas.
// Como rodar: editor Apps Script → seleciona a função no dropdown →
//   primeiro `_migrarStatusLeadsMetaAdsDryRun` (só conta), depois
//   `_migrarStatusLeadsMetaAdsExecutar` (grava).
// Após validar, deletar este arquivo no próximo clasp push (está em
// `.claspignore`, mas é one-shot — não acumular lixo).
// ============================================================

var _MIG_LMA_NOVOS = {
  'venda-fechada':   true,
  'venda-perdida':   true,
  'sem-viabilidade': true,
  'sem-interesse':   true,
  'reprovado-cpf':   true
};

function _migrarStatusLeadsMetaAds_(modoDry) {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada.');
  var ult = aba.getLastRow();
  if (ult < 2) { Logger.log('Aba vazia.'); return { ok: true, alteradas: 0 }; }

  // I = status_final (col 9), J = motivo_desq (col 10).
  var rng    = aba.getRange(2, 9, ult - 1, 2);
  var values = rng.getValues();

  var counts = {
    'venda-fechada':   0,
    'venda-perdida':   0,
    'sem-viabilidade': 0,
    'sem-interesse':   0,
    'reprovado-cpf':   0,
    'em-aberto':       0,
    'ja-migrado':      0,
    'vazio':           0,
    'desconhecido':    0
  };

  var alteradas = 0;
  for (var i = 0; i < values.length; i++) {
    var statusAtual = String(values[i][0] || '').trim();
    var motivo      = String(values[i][1] || '').trim().toLowerCase();
    if (!statusAtual) { counts['vazio']++; continue; }

    var low = statusAtual.toLowerCase();
    if (_MIG_LMA_NOVOS[low]) { counts['ja-migrado']++; continue; }

    var novo = null;
    if (low === 'converteu') {
      novo = 'venda-fechada';
    } else if (low === 'desqualificado') {
      if      (motivo === 'sem cobertura') novo = 'sem-viabilidade';
      else if (motivo === 'sem interesse') novo = 'sem-interesse';
      else if (motivo === 'base vero')     novo = 'reprovado-cpf';
      else                                 novo = 'venda-perdida';
    } else if (low === 'em negociação' || low === 'em negociacao' || low === 'sem contato') {
      novo = ''; // volta a "Em aberto"
    } else {
      counts['desconhecido']++;
      Logger.log('Status desconhecido na linha ' + (i + 2) + ': "' + statusAtual + '" (motivo="' + motivo + '") — pulado.');
      continue;
    }

    if (novo === '') counts['em-aberto']++; else counts[novo]++;
    values[i][0] = novo;
    alteradas++;
  }

  Logger.log('Resumo da migração:');
  Object.keys(counts).forEach(function(k) { Logger.log('  ' + k + ': ' + counts[k]); });
  Logger.log('Total a alterar: ' + alteradas);

  if (modoDry) {
    Logger.log('DRY RUN — nada foi gravado. Rode `_migrarStatusLeadsMetaAdsExecutar` para gravar.');
    return { ok: true, dry: true, alteradas: alteradas, counts: counts };
  }

  if (alteradas > 0) {
    rng.clearDataValidations();
    rng.setValues(values);
    SpreadsheetApp.flush();
    Logger.log('OK — ' + alteradas + ' linhas atualizadas.');
  } else {
    Logger.log('Nada a fazer.');
  }
  return { ok: true, dry: false, alteradas: alteradas, counts: counts };
}

function _migrarStatusLeadsMetaAdsDryRun() {
  return _migrarStatusLeadsMetaAds_(true);
}

function _migrarStatusLeadsMetaAdsExecutar() {
  return _migrarStatusLeadsMetaAds_(false);
}
