// ============================================================
// DHARMA PRO — MÓDULO META ADS TRACKING v2.1
// Aba dedicada: "Leads Meta Ads"
// Atualizado em: 20/04/2026 | Adicionado: getPainelAdsData()
// ============================================================

var CFG_META = {
  ABA_LEADS_META:  'Leads Meta Ads',
  API_VERSION:     'v20.0',
  AD_ACCOUNT_ID:   'act_971543562231015',
  // Armazene o token em: Extensões → Apps Script → Propriedades do projeto
  // Chave: META_ACCESS_TOKEN  Valor: <token do sistema Admin_API_Renata>
  CAMPANHAS: {
    'A — JF Principal': '120242673369540207',
    'B — Órbita JF':    '120242644568320207',
    'C — BH Metro':     '120242644568620207',
  },
  LIMITES: {
    CPL_MAX:         30,
    CTR_MIN:         0.5,
    FREQUENCIA_MAX:  4.0,
    CPA_META:        60,
    CPA_MAX:         120,
  }
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
  var ss  = _getSpreadsheet_();
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
  var ss   = _getSpreadsheet_();
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
 * Retorna todos os leads da aba "Leads Meta Ads" para a UI.
 * Chamado via google.script.run.getLeadsMetaAds()
 */
function getLeadsMetaAds() {
  try {
    var ss  = _getSpreadsheet_();
    var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
    if (!aba) return { leads: [], resumo: {}, erro: 'Aba "Leads Meta Ads" não encontrada.' };

    var ult = aba.getLastRow();
    if (ult < 2) return { leads: [], resumo: { total: 0, convertidos: 0, desq: 0, pendentes: 0, taxa_conv: '0' } };

    var raw = aba.getRange(2, 1, ult - 1, 12).getValues();
    var leads = [];

    var tz = Session.getScriptTimeZone();

    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r[0]) continue;
      leads.push({
        linha:        i + 2,
        data_entrada: r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'dd/MM/yyyy HH:mm') : String(r[0] || ''),
        nome:         String(r[1] || '').trim(),
        telefone:     String(r[2] || '').trim(),
        cidade:       String(r[3] || '').trim(),
        utm_source:   String(r[4] || '').trim(),
        utm_campaign: String(r[5] || '').trim(),
        utm_ad:       String(r[6] || '').trim(),
        utm_medium:   String(r[7] || '').trim(),
        status_final: String(r[8] || '').trim(),
        motivo_desq:  String(r[9] || '').trim(),
        data_status:  r[10] instanceof Date ? Utilities.formatDate(r[10], tz, 'dd/MM/yyyy HH:mm') : String(r[10] || ''),
        observacao:   String(r[11] || '').trim(),
      });
    }

    leads.reverse();

    var total       = leads.length;
    var convertidos = leads.filter(function(l) { return l.status_final === 'Converteu'; }).length;
    var desq        = leads.filter(function(l) { return l.status_final === 'Desqualificado'; }).length;
    var pendentes   = leads.filter(function(l) { return !l.status_final; }).length;
    var taxa_conv   = total > 0 ? ((convertidos / total) * 100).toFixed(1) : '0';

    return {
      leads: leads,
      resumo: { total: total, convertidos: convertidos, desq: desq, pendentes: pendentes, taxa_conv: taxa_conv }
    };
  } catch(e) {
    return { leads: [], resumo: {}, erro: e.message };
  }
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


// ═══════════════════════════════════════════════════════════════════════════
// CONVERSÃO — vínculo automático venda instalada ↔ Lead Meta Ads
// Atualizado em: 20/04/2026
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chamado por salvarVenda() quando Canal=META ADS e Status=Finalizada/Instalada.
 * Busca o lead pelo telefone e marca como "Converteu" se ainda estiver pendente.
 * Não lança erro — falha silenciosa para não bloquear o save da venda.
 *
 * @param {string} telefone  Telefone da venda (qualquer formato)
 * @returns {number|null}    Número da linha atualizada, ou null se não encontrado
 */
function vincularVendaLeadMetaAds(telefone) {
  var tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length > 11) tel = tel.slice(-11); // remove DDI 55
  if (!tel || tel.length < 8) return null;

  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) return null;

  var lastRow = aba.getLastRow();
  if (lastRow < 2) return null;

  var dados = aba.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < dados.length; i++) {
    var leadTel = String(dados[i][2] || '').replace(/\D/g, '');
    if (leadTel.length > 11) leadTel = leadTel.slice(-11);
    // Só atualiza se o telefone bate E ainda não tem status_final
    if (leadTel === tel && !dados[i][8]) {
      var linha = i + 2;
      aba.getRange(linha, 9).setValue('Converteu');  // col I: status_final
      aba.getRange(linha, 11).setValue(new Date());  // col K: data_status
      Logger.log('vincularVendaLeadMetaAds: tel ' + tel + ' → linha ' + linha + ' = Converteu (auto)');
      return linha;
    }
  }
  return null;
}


/**
 * Atualiza status de um lead Meta Ads manualmente via UI.
 * Chamado pelo botão de ação na tela Leads Meta Ads.
 *
 * @param {number} linha    Linha na planilha (começa em 2)
 * @param {string} status   'Converteu' | 'Desqualificado' | 'Em negociação' | 'Sem contato' | ''
 * @param {string} motivo   Motivo de desqualificação (opcional)
 */
/**
 * Retorna apenas a contagem de leads pendentes (sem status_final).
 * Chamado no login para atualizar o badge do menu lateral.
 */
function contarLeadsMetaAdsPendentes() {
  try {
    var ss  = _getSpreadsheet_();
    var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
    if (!aba || aba.getLastRow() < 2) return 0;
    var col = aba.getRange(2, 9, aba.getLastRow() - 1, 1).getValues(); // col I: status_final
    var count = 0;
    for (var i = 0; i < col.length; i++) {
      if (!col[i][0]) count++;
    }
    return count;
  } catch(e) { return 0; }
}


function atualizarStatusLeadMetaAds(linha, status, motivo) {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada.');
  if (!linha || linha < 2) throw new Error('Linha inválida: ' + linha);

  aba.getRange(linha, 9).setValue(status  || ''); // col I: status_final
  aba.getRange(linha, 10).setValue(motivo || ''); // col J: motivo_desq
  aba.getRange(linha, 11).setValue(new Date());   // col K: data_status

  Logger.log('atualizarStatusLeadMetaAds: linha ' + linha + ' → ' + (status || 'limpo'));
  return { ok: true, linha: linha, status: status };
}


// ═══════════════════════════════════════════════════════════════════════════
// PAINEL ADS — dados para o dashboard unificado de tráfego pago
// Atualizado em: 20/04/2026
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Busca dados consolidados de Meta Ads + DharmaPro para o Painel Ads.
 *
 * @param {string} periodo  'hoje' | '7d' | '30d'  (default: '7d')
 * @returns {Object}  { periodo, resumo, campanhas, alertas, dharma }
 *
 * Pré-requisito: META_ACCESS_TOKEN configurado em
 *   Extensões → Apps Script → Propriedades do projeto
 */
function getPainelAdsData(periodo) {
  var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN')
              || 'EAAR9E1kNxBUBRKtt3asEeG1HLKh6vAEZBWn3etKiKEBjeQW6hH21o3KiAR1lhthKijyAenDvEzewfh6Jt57pfTyky0aU5n3AZBi0wGpJC7COdoOBn0U9TZBRF0F4hu24yG2D2V9IcPix6xc7ZB4beZAwmGeACKTrlYBhEzFMX9VW5XkKQEL8qNmfWhKZBFlN1A6wZDZD';
  if (!token) {
    return { erro: 'Token Meta Ads não configurado.' };
  }

  periodo = periodo || '7d';
  var tz    = Session.getScriptTimeZone();
  var hoje  = new Date();
  var until = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
  var since;

  if (periodo === 'hoje') {
    since = until;
  } else if (periodo === '7d') {
    var d7 = new Date(hoje); d7.setDate(d7.getDate() - 6);
    since = Utilities.formatDate(d7, tz, 'yyyy-MM-dd');
  } else {
    var d30 = new Date(hoje); d30.setDate(d30.getDate() - 29);
    since = Utilities.formatDate(d30, tz, 'yyyy-MM-dd');
  }

  // ── CHAMAR META ADS API ──────────────────────────────────────────────────
  var base = 'https://graph.facebook.com/' + CFG_META.API_VERSION + '/' + CFG_META.AD_ACCOUNT_ID + '/insights';
  var params = {
    access_token: token,
    fields: 'campaign_id,campaign_name,impressions,clicks,ctr,cpm,cpc,spend,actions,frequency',
    time_range: JSON.stringify({ since: since, until: until }),
    level: 'campaign',
    limit: '50'
  };

  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');

  try {
    var resp = UrlFetchApp.fetch(base + '?' + qs, { muteHttpExceptions: true });
    var json = JSON.parse(resp.getContentText());

    if (json.error) {
      return { erro: 'Meta Ads API: ' + json.error.message + ' (code ' + json.error.code + ')' };
    }

    var data = json.data || [];

    // ── PROCESSAR CAMPANHAS ──────────────────────────────────────────────
    var totalGasto = 0, totalLeads = 0, totalImpr = 0, totalCliques = 0;
    var campanhasData = [];
    var alertas = [];
    var L = CFG_META.LIMITES;

    for (var i = 0; i < data.length; i++) {
      var row    = data[i];
      var gasto  = parseFloat(row.spend       || 0);
      var impr   = parseInt(row.impressions   || 0);
      var cliques= parseInt(row.clicks        || 0);
      var ctr    = parseFloat(row.ctr         || 0);
      var cpm    = parseFloat(row.cpm         || 0);
      var cpc    = parseFloat(row.cpc         || 0);
      var freq   = parseFloat(row.frequency   || 0);

      var leadsAct = (row.actions || []).filter(function(a) {
        return a.action_type === 'lead' ||
               a.action_type === 'onsite_conversion.messaging_conversation_started_7d';
      });
      var leads = leadsAct.length > 0 ? parseFloat(leadsAct[0].value || 0) : 0;

      totalGasto   += gasto;
      totalLeads   += leads;
      totalImpr    += impr;
      totalCliques += cliques;

      var cpl    = leads > 0 ? gasto / leads : null;
      var status = 'ok';

      if (cpl && cpl > L.CPL_MAX && gasto > 100) {
        alertas.push({ tipo: 'erro',  texto: 'PAUSAR: ' + row.campaign_name + ' — CPL R$' + cpl.toFixed(2) + ' > R$' + L.CPL_MAX });
        status = 'erro';
      } else if (ctr < L.CTR_MIN && gasto > 20) {
        alertas.push({ tipo: 'erro',  texto: 'PAUSAR: ' + row.campaign_name + ' — CTR ' + ctr.toFixed(2) + '% < ' + L.CTR_MIN + '%' });
        status = 'erro';
      } else if (freq > L.FREQUENCIA_MAX) {
        alertas.push({ tipo: 'aviso', texto: 'ATENÇÃO: ' + row.campaign_name + ' — Frequência ' + freq.toFixed(1) + 'x (limite: ' + L.FREQUENCIA_MAX + 'x)' });
        status = 'aviso';
      }

      campanhasData.push({
        id:         row.campaign_id,
        nome:       row.campaign_name,
        gasto:      gasto,
        leads:      leads,
        impressoes: impr,
        cliques:    cliques,
        ctr:        ctr,
        cpm:        cpm,
        cpc:        cpc,
        frequencia: freq,
        cpl:        cpl,
        status:     status
      });
    }

    // ── BUSCAR CONVERSÕES NO DHARMAPRO ───────────────────────────────────
    var dharmaResult = exportarLeadsMetaAds();
    var dharma       = dharmaResult.resumo || {};
    var vendas       = dharma.convertidos  || 0;
    var totalLeadsDharma = dharma.total    || 0;

    // ── CALCULAR RESUMO ──────────────────────────────────────────────────
    var cplMedio  = totalLeads   > 0 ? (totalGasto / totalLeads).toFixed(2)        : null;
    var ctrMedio  = totalImpr    > 0 ? ((totalCliques / totalImpr) * 100).toFixed(2) : null;
    var cpmMedio  = totalImpr    > 0 ? ((totalGasto / totalImpr) * 1000).toFixed(2)  : null;
    var taxaConv  = totalLeadsDharma > 0 ? ((vendas / totalLeadsDharma) * 100).toFixed(1) : '0';
    var cpaReal   = vendas > 0 ? (totalGasto / vendas).toFixed(2) : null;

    // Alerta CPA
    if (cpaReal && parseFloat(cpaReal) > L.CPA_MAX) {
      alertas.push({ tipo: 'erro',  texto: 'CPA real R$' + cpaReal + ' acima do máximo R$' + L.CPA_MAX });
    } else if (cpaReal && parseFloat(cpaReal) > L.CPA_META) {
      alertas.push({ tipo: 'aviso', texto: 'CPA real R$' + cpaReal + ' acima da meta R$' + L.CPA_META });
    }

    return {
      periodo: { since: since, until: until, label: periodo },
      resumo: {
        gasto:       totalGasto.toFixed(2),
        leads:       totalLeads,
        impressoes:  totalImpr,
        cliques:     totalCliques,
        cpl:         cplMedio,
        ctr:         ctrMedio,
        cpm:         cpmMedio,
        conversoes:  vendas,
        taxaConv:    taxaConv,
        cpaReal:     cpaReal
      },
      campanhas: campanhasData,
      alertas:   alertas,
      dharma:    dharma
    };

  } catch(e) {
    return { erro: 'Erro inesperado: ' + e.message };
  }
}
