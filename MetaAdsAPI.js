// ============================================================
// DHARMA PRO — MÓDULO META ADS TRACKING v2.0
// Aba dedicada: "Leads Meta Ads"
// Abril/2026
// ============================================================

var CFG_META = {
  ABA_LEADS_META: 'Leads Meta Ads',
};


/**
 * Cria nova linha na aba "Leads Meta Ads".
 * Chamado pelo doPost (Code.js) quando a Renata envia um lead via n8n.
 *
 * Payload esperado:
 * {
 *   "nome":         "João Silva",
 *   "telefone":     "32999001122",
 *   "cidade":       "Juiz de Fora",
 *   "utm_source":   "meta_ads",
 *   "utm_campaign": "120208xxxxxxx",
 *   "utm_ad":       "120209xxxxxxx",
 *   "utm_medium":   "cpc"
 * }
 */
function registrarLeadMetaAds(payload) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);

  if (!aba) {
    throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada. Crie a aba primeiro.');
  }

  var agora = new Date();
  var novaLinha = [
    agora,                                    // A: data_entrada
    String(payload.nome      || '').trim(),   // B: nome
    String(payload.telefone  || '').replace(/\D/g, ''), // C: telefone
    String(payload.cidade    || '').trim(),   // D: cidade
    String(payload.utm_source   || 'meta_ads').trim(), // E: utm_source
    String(payload.utm_campaign || '').trim(), // F: utm_campaign
    String(payload.utm_ad       || '').trim(), // G: utm_ad
    String(payload.utm_medium   || 'cpc').trim(), // H: utm_medium
    '',  // I: status_final (time comercial preenche)
    '',  // J: motivo_desqualificacao
    '',  // K: data_status (auto via onEditMetaAds)
    '',  // L: observacao
  ];

  aba.appendRow(novaLinha);
  var ultimaLinha = aba.getLastRow();

  Logger.log('Lead Meta Ads registrado: ' + payload.nome + ' | ' + payload.cidade + ' | linha ' + ultimaLinha);
  return ultimaLinha;
}


/**
 * Trigger onEdit — grava timestamp automático quando
 * o time comercial preenche o status_final (col I) ou motivo (col J).
 *
 * Instalar: Extensões → Apps Script → Gatilhos → onEditMetaAds → Ao editar
 */
function onEditMetaAds(e) {
  if (!e || !e.range) return;

  var aba = e.range.getSheet();
  if (aba.getName() !== CFG_META.ABA_LEADS_META) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();

  // Colunas I (9) e J (10) — status_final e motivo_desqualificacao
  if ((col === 9 || col === 10) && row > 1) {
    aba.getRange(row, 11).setValue(new Date()); // col K: data_status
  }
}


/**
 * Exporta todos os leads Meta Ads com resumo de conversão.
 * Pode ser chamado via trigger diário ou manualmente.
 */
function exportarLeadsMetaAds() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var aba  = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  var rows = aba.getDataRange().getValues();

  var leads = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue; // linha vazia
    leads.push({
      data_entrada:  r[0],
      nome:          r[1],
      telefone:      r[2],
      cidade:        r[3],
      utm_source:    r[4],
      utm_campaign:  r[5],
      utm_ad:        r[6],
      utm_medium:    r[7],
      status_final:  r[8],
      motivo_desq:   r[9],
      data_status:   r[10],
      observacao:    r[11],
    });
  }

  var total       = leads.length;
  var convertidos = leads.filter(function(l) { return l.status_final === 'Converteu'; }).length;
  var desq        = leads.filter(function(l) { return l.status_final === 'Desqualificado'; }).length;
  var pendentes   = leads.filter(function(l) { return !l.status_final; }).length;
  var taxa_conv   = total > 0 ? ((convertidos / total) * 100).toFixed(1) : 0;

  Logger.log('Leads Meta Ads | Total: ' + total + ' | Convertidos: ' + convertidos + ' (' + taxa_conv + '%) | Desq: ' + desq + ' | Pendentes: ' + pendentes);
  return { resumo: { total: total, convertidos: convertidos, desq: desq, pendentes: pendentes, taxa_conv: taxa_conv }, leads: leads };
}


/**
 * Teste manual — selecione e execute no editor GAS para
 * simular um lead chegando da Renata e verificar se está funcionando.
 */
function testeRegistrarLead() {
  var leadTeste = {
    nome:         'Lead Teste Meta Ads',
    telefone:     '32999000000',
    cidade:       'Juiz de Fora',
    utm_source:   'meta_ads',
    utm_campaign: 'campanha_teste_001',
    utm_ad:       'anuncio_teste_001',
    utm_medium:   'cpc',
  };

  var linha = registrarLeadMetaAds(leadTeste);
  Logger.log('Teste OK — linha criada: ' + linha);
  Logger.log('Verifique a aba "Leads Meta Ads" na planilha.');
}
