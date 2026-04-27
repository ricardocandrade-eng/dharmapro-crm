// ============================================================
// DHARMA PRO — MÓDULO META ADS TRACKING v2.1
// Aba dedicada: "Leads Meta Ads"
// Atualizado em: 20/04/2026 | Adicionado: getPainelAdsData()
// ============================================================

var CFG_META = {
  ABA_LEADS_META:  'Leads Meta Ads',
  API_VERSION:     'v20.0',
  AD_ACCOUNT_ID:   'act_971543562231015',
  // Token: Extensões → Apps Script → Propriedades do projeto → META_ACCESS_TOKEN
  LIMITES: {
    CPL_MAX:         30,
    CTR_MIN:         0.5,
    FREQUENCIA_MAX:  4.0,
    CPA_META:        60,
    CPA_MAX:         120,
  },
  SCALE_FACTOR: 1.20  // +20% de budget por execução de scale
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
// getPainelAdsData() está definida abaixo, junto ao Bridge.
// ═══════════════════════════════════════════════════════════════════════════

function _getClaudeAdsBridgeData_() {
  var props = PropertiesService.getScriptProperties();
  var bridgeJson = props.getProperty('CLAUDE_ADS_BRIDGE_JSON');
  var bridgeUrl = props.getProperty('CLAUDE_ADS_BRIDGE_URL');

  try {
    if (bridgeJson) return JSON.parse(bridgeJson);

    if (bridgeUrl) {
      var resp = UrlFetchApp.fetch(bridgeUrl, { muteHttpExceptions: true });
      if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
        return JSON.parse(resp.getContentText());
      }
      throw new Error('Bridge URL retornou HTTP ' + resp.getResponseCode());
    }
  } catch (e) {
    return { erro_bridge: e.message };
  }

  return null;
}

function _getClaudeAdsActionDecisions_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('CLAUDE_ADS_ACTION_DECISIONS_JSON') || '{}';
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function _saveClaudeAdsActionDecisions_(map) {
  PropertiesService.getScriptProperties().setProperty(
    'CLAUDE_ADS_ACTION_DECISIONS_JSON',
    JSON.stringify(map || {})
  );
}

function _buildClaudeAdsActionDecisionSummary_(queue) {
  var counts = { approved: 0, rejected: 0, pending: 0 };
  (queue || []).forEach(function(item) {
    var status = item && item.approval_state && item.approval_state.status ? item.approval_state.status : 'pending';
    if (status === 'approved') counts.approved += 1;
    else if (status === 'rejected') counts.rejected += 1;
    else counts.pending += 1;
  });
  return counts;
}

function _mergeClaudeAdsActionDecisions_(bridge) {
  if (!bridge || !bridge.automacao || !bridge.automacao.fila_prioritaria) return bridge;

  var decisions = _getClaudeAdsActionDecisions_();
  var queue = bridge.automacao.fila_prioritaria.map(function(item) {
    var actionId = item && item.action_id ? String(item.action_id) : '';
    var saved = actionId && decisions[actionId] ? decisions[actionId] : null;
    return Object.assign({}, item, {
      approval_state: saved || {
        status: 'pending',
        decided_at: null,
        decided_by: null,
        note: null
      }
    });
  });

  bridge.automacao.fila_prioritaria = queue;
  bridge.automacao.approval_summary = _buildClaudeAdsActionDecisionSummary_(queue);
  return bridge;
}

function registrarClaudeAdsActionDecision(usuario, decisionPayload) {
  var actor = String(usuario || '').trim() || 'operador';
  var payload = decisionPayload || {};
  var actionId = String(payload.action_id || '').trim();
  var status = String(payload.status || '').trim().toLowerCase();
  var allowed = { approved: true, rejected: true, pending: true };

  if (!actionId) throw new Error('Informe um action_id valido.');
  if (!allowed[status]) throw new Error('Status de aprovacao invalido.');

  var decisions = _getClaudeAdsActionDecisions_();
  decisions[actionId] = {
    action_id: actionId,
    status: status,
    decided_at: new Date().toISOString(),
    decided_by: actor,
    note: payload.note ? String(payload.note) : '',
    action_type: payload.action_type ? String(payload.action_type) : '',
    campaign_key: payload.campaign_key ? String(payload.campaign_key) : '',
    meta_campaign_id: payload.meta_campaign_id ? String(payload.meta_campaign_id) : '',
    meta_adset_id: payload.meta_adset_id ? String(payload.meta_adset_id) : ''
  };
  _saveClaudeAdsActionDecisions_(decisions);

  return { ok: true, action_id: actionId, status: status, decided_by: actor };
}

function listarClaudeAdsActionDecisions() {
  return {
    ok: true,
    decisions: _getClaudeAdsActionDecisions_()
  };
}

/**
 * Utilitário de manutenção — limpa todas as decisões de ação gravadas.
 * Execute UMA VEZ no editor Apps Script antes de reiniciar a operação.
 * Depois de executar pode apagar esta função se quiser.
 */
function limparDecisoesPainelAds() {
  PropertiesService.getScriptProperties().deleteProperty('CLAUDE_ADS_ACTION_DECISIONS_JSON');
  Logger.log('CLAUDE_ADS_ACTION_DECISIONS_JSON removido. Fila zerada.');
  return 'OK — decisões antigas apagadas.';
}

function _collectBridgeCampaigns_(bridge) {
  var all = [];
  var groups = bridge && bridge.acoes_prioritarias ? bridge.acoes_prioritarias : {};

  ['pause_top', 'scale_top', 'maintain_top', 'review_top'].forEach(function(key) {
    if (groups[key]) all.push(groups[key]);
  });

  return all.filter(Boolean);
}

function _buildPainelAdsCockpitData_(bridge, periodo) {
  bridge = _mergeClaudeAdsActionDecisions_(bridge);
  var campaigns = _collectBridgeCampaigns_(bridge);
  var totalGasto = 0;
  var totalLeads = 0;
  var totalVendas = 0;
  var campanhas = [];
  var alertas = [];

  for (var i = 0; i < campaigns.length; i++) {
    var item = campaigns[i];
    totalGasto += parseFloat(item.spend_brl || 0);
    totalLeads += parseFloat(item.leads || 0);
    totalVendas += parseFloat(item.sales || 0);

    var status = 'ok';
    if (bridge.acoes_prioritarias.pause_top && item.campaign_key === bridge.acoes_prioritarias.pause_top.campaign_key) status = 'erro';
    if (bridge.acoes_prioritarias.review_top && item.campaign_key === bridge.acoes_prioritarias.review_top.campaign_key) status = 'aviso';

    campanhas.push({
      id: item.campaign_key,
      nome: item.campaign_key,
      gasto: parseFloat(item.spend_brl || 0),
      leads: parseFloat(item.leads || 0),
      impressoes: 0,
      cliques: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      frequencia: 0,
      cpl: item.cpl_brl,
      status: status
    });
  }

  if (bridge.acoes_prioritarias.pause_top) {
    alertas.push({ tipo: 'erro', texto: 'PAUSAR: ' + bridge.acoes_prioritarias.pause_top.campaign_key + ' - ' + bridge.acoes_prioritarias.pause_top.explanation });
  }
  if (bridge.acoes_prioritarias.review_top) {
    alertas.push({ tipo: 'aviso', texto: 'REVISAR: ' + bridge.acoes_prioritarias.review_top.campaign_key + ' - ' + bridge.acoes_prioritarias.review_top.explanation });
  }
  if (bridge.inteligencia_comercial && bridge.inteligencia_comercial.pior_publico && bridge.inteligencia_comercial.pior_publico.key) {
    alertas.push({ tipo: 'aviso', texto: 'Publico fraco: ' + bridge.inteligencia_comercial.pior_publico.key + ' - desqualificacao ' + bridge.inteligencia_comercial.pior_publico.disqualification_rate_percent + '%' });
  }

  var cplMedio = totalLeads > 0 ? (totalGasto / totalLeads) : null;
  var cpaReal = totalVendas > 0 ? (totalGasto / totalVendas) : null;

  return {
    modo: 'cockpit_bridge',
    fonte: 'Claude Ads 2.0',
    periodo: {
      since: periodo || '7d',
      until: bridge.generated_at || '',
      label: periodo || '7d'
    },
    resumo: {
      gasto: totalGasto.toFixed(2),
      leads: totalLeads,
      impressoes: 0,
      cliques: 0,
      cpl: cplMedio !== null ? cplMedio.toFixed(2) : null,
      ctr: null,
      cpm: null,
      conversoes: totalVendas,
      taxaConv: totalLeads > 0 ? ((totalVendas / totalLeads) * 100).toFixed(1) : '0',
      cpaReal: cpaReal !== null ? cpaReal.toFixed(2) : null
    },
    campanhas: campanhas,
    alertas: alertas,
    dharma: {
      total: totalLeads,
      convertidos: totalVendas,
      pendentes: 0,
      taxa_conv: totalLeads > 0 ? ((totalVendas / totalLeads) * 100).toFixed(1) : '0'
    },
    cockpit: bridge
  };
}

function getPainelAdsData(periodo) {
  var bridge = _getClaudeAdsBridgeData_();
  if (bridge && !bridge.erro_bridge && bridge.crm_mode === 'cockpit_ads') {
    return _buildPainelAdsCockpitData_(bridge, periodo);
  }
  if (bridge && bridge.erro_bridge) {
    return { erro: 'Falha ao ler o Claude Ads Bridge: ' + bridge.erro_bridge };
  }

  var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN');
  if (!token) {
    return { erro: 'Nem Claude Ads Bridge nem META_ACCESS_TOKEN estao configurados.' };
  }

  periodo = periodo || '7d';
  var tz = Session.getScriptTimeZone();
  var hoje = new Date();
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
    var totalGasto = 0, totalLeads = 0, totalImpr = 0, totalCliques = 0;
    var campanhasData = [];
    var alertas = [];
    var L = CFG_META.LIMITES;

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var gasto = parseFloat(row.spend || 0);
      var impr = parseInt(row.impressions || 0, 10);
      var cliques = parseInt(row.clicks || 0, 10);
      var ctr = parseFloat(row.ctr || 0);
      var cpm = parseFloat(row.cpm || 0);
      var cpc = parseFloat(row.cpc || 0);
      var freq = parseFloat(row.frequency || 0);

      var leadsAct = (row.actions || []).filter(function(a) {
        return a.action_type === 'lead' || a.action_type === 'onsite_conversion.messaging_conversation_started_7d';
      });
      var leads = leadsAct.length > 0 ? parseFloat(leadsAct[0].value || 0) : 0;

      totalGasto += gasto;
      totalLeads += leads;
      totalImpr += impr;
      totalCliques += cliques;

      var cpl = leads > 0 ? gasto / leads : null;
      var status = 'ok';

      if (cpl && cpl > L.CPL_MAX && gasto > 100) {
        alertas.push({ tipo: 'erro', texto: 'PAUSAR: ' + row.campaign_name + ' - CPL R$' + cpl.toFixed(2) + ' > R$' + L.CPL_MAX });
        status = 'erro';
      } else if (ctr < L.CTR_MIN && gasto > 20) {
        alertas.push({ tipo: 'erro', texto: 'PAUSAR: ' + row.campaign_name + ' - CTR ' + ctr.toFixed(2) + '% < ' + L.CTR_MIN + '%' });
        status = 'erro';
      } else if (freq > L.FREQUENCIA_MAX) {
        alertas.push({ tipo: 'aviso', texto: 'ATENCAO: ' + row.campaign_name + ' - Frequencia ' + freq.toFixed(1) + 'x (limite: ' + L.FREQUENCIA_MAX + 'x)' });
        status = 'aviso';
      }

      campanhasData.push({
        id: row.campaign_id,
        nome: row.campaign_name,
        gasto: gasto,
        leads: leads,
        impressoes: impr,
        cliques: cliques,
        ctr: ctr,
        cpm: cpm,
        cpc: cpc,
        frequencia: freq,
        cpl: cpl,
        status: status
      });
    }

    var dharmaResult = exportarLeadsMetaAds();
    var dharma = dharmaResult.resumo || {};
    var vendas = dharma.convertidos || 0;
    var totalLeadsDharma = dharma.total || 0;
    var cplMedio = totalLeads > 0 ? (totalGasto / totalLeads).toFixed(2) : null;
    var ctrMedio = totalImpr > 0 ? ((totalCliques / totalImpr) * 100).toFixed(2) : null;
    var cpmMedio = totalImpr > 0 ? ((totalGasto / totalImpr) * 1000).toFixed(2) : null;
    var taxaConv = totalLeadsDharma > 0 ? ((vendas / totalLeadsDharma) * 100).toFixed(1) : '0';
    var cpaReal = vendas > 0 ? (totalGasto / vendas).toFixed(2) : null;

    if (cpaReal && parseFloat(cpaReal) > L.CPA_MAX) {
      alertas.push({ tipo: 'erro', texto: 'CPA real R$' + cpaReal + ' acima do maximo R$' + L.CPA_MAX });
    } else if (cpaReal && parseFloat(cpaReal) > L.CPA_META) {
      alertas.push({ tipo: 'aviso', texto: 'CPA real R$' + cpaReal + ' acima da meta R$' + L.CPA_META });
    }

    return {
      periodo: { since: since, until: until, label: periodo },
      resumo: {
        gasto: totalGasto.toFixed(2),
        leads: totalLeads,
        impressoes: totalImpr,
        cliques: totalCliques,
        cpl: cplMedio,
        ctr: ctrMedio,
        cpm: cpmMedio,
        conversoes: vendas,
        taxaConv: taxaConv,
        cpaReal: cpaReal
      },
      campanhas: campanhasData,
      alertas: alertas,
      dharma: dharma
    };
  } catch (e) {
    return { erro: 'Erro inesperado: ' + e.message };
  }
}

// ── CAMADA DE EXECUÇÃO ────────────────────────────────────────────────────────

/**
 * Helper privado: faz POST de escrita na Meta Ads API.
 * Funciona tanto para campanhas (status) quanto para adsets (daily_budget).
 * @param {string} objectId - campaign_id ou adset_id
 * @param {Object} params   - campos a atualizar (sem access_token)
 */
function _metaCampanhaUpdate_(objectId, params) {
  var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN') || '';
  if (!token) throw new Error('META_ACCESS_TOKEN nao configurado em Script Properties.');
  var base = 'https://graph.facebook.com/' + CFG_META.API_VERSION + '/' + String(objectId);
  var payload = {};
  for (var k in params) payload[k] = params[k];
  payload.access_token = token;

  var resp = UrlFetchApp.fetch(base, {
    method:             'post',
    payload:            payload,
    muteHttpExceptions: true
  });
  var json = JSON.parse(resp.getContentText());
  if (json.error) throw new Error('[Meta API] ' + json.error.message + ' (code ' + json.error.code + ')');
  return json;
}

/**
 * Helper privado: busca budget diário e status atual de um adset via GET.
 * Retorna objeto com { daily_budget, status } ou null em caso de erro.
 * @param {string} adsetId
 */
function _metaAdsetGetBudget_(adsetId) {
  var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN') || '';
  if (!token || !adsetId) return null;
  var url = 'https://graph.facebook.com/' + CFG_META.API_VERSION + '/' + String(adsetId)
          + '?fields=daily_budget,status&access_token=' + encodeURIComponent(token);
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var json = JSON.parse(resp.getContentText());
    return json.error ? null : json;
  } catch (e) {
    Logger.log('_metaAdsetGetBudget_ erro: ' + e.message);
    return null;
  }
}

/**
 * Executa todas as ações aprovadas que ainda não foram executadas.
 * Exportado para google.script.run.
 *
 * Lógica por action_type:
 *   pause_campaign → PATCH campaign status=PAUSED
 *   scale_budget_guardrailed → GET budget atual do adset → PATCH +20%
 *   review / maintain / outros → sem chamada API; registra no_action_needed
 *
 * Idempotente: ignora ações já com executed_at.
 * Retorna: { executadas, erros, detalhes }
 */
function executarAcoesAprovadas() {
  var decisions = _getClaudeAdsActionDecisions_();
  var scaleFactor = CFG_META.SCALE_FACTOR || 1.20;
  var executadas = 0;
  var erros = [];
  var detalhes = [];

  for (var actionId in decisions) {
    var d = decisions[actionId];
    if (d.status !== 'approved') continue;
    if (d.executed_at) continue; // idempotente — não re-executa

    var actionType = String(d.action_type || '').toLowerCase();
    var campaignId = String(d.meta_campaign_id || '').trim();
    var adsetId    = String(d.meta_adset_id || '').trim();

    try {
      if (actionType === 'pause_campaign' || actionType === 'pause') {
        // Salva status anterior para rollback (assume ACTIVE se desconhecido)
        d.meta_status_before = 'ACTIVE';
        _metaCampanhaUpdate_(campaignId, { status: 'PAUSED' });
        d.execution_result = 'ok';

      } else if (actionType === 'scale_budget_guardrailed' || actionType === 'scale') {
        if (!adsetId) throw new Error('meta_adset_id nao informado para scale.');
        var adsetInfo = _metaAdsetGetBudget_(adsetId);
        var budgetAtual = adsetInfo && adsetInfo.daily_budget ? parseInt(adsetInfo.daily_budget) : 0;
        if (!budgetAtual) throw new Error('Nao foi possivel obter budget atual do adset ' + adsetId + '.');
        d.meta_budget_before = budgetAtual;
        var novoBudget = Math.round(budgetAtual * scaleFactor);
        _metaCampanhaUpdate_(adsetId, { daily_budget: String(novoBudget) });
        d.execution_result = 'ok';

      } else {
        // review / maintain / assistive — registra sem chamar API
        d.execution_result = 'no_action_needed';
      }

      d.executed_at = new Date().toISOString();
      d.executed_by = 'operador_dharmapro';
      executadas++;
      detalhes.push({ action_id: actionId, status: 'ok', action_type: actionType });

    } catch (e) {
      d.executed_at      = new Date().toISOString();
      d.executed_by      = 'operador_dharmapro';
      d.execution_result = 'erro: ' + e.message;
      erros.push({ action_id: actionId, erro: e.message });
      detalhes.push({ action_id: actionId, status: 'erro', erro: e.message });
      Logger.log('executarAcoesAprovadas erro [' + actionId + ']: ' + e.message);
    }

    decisions[actionId] = d;
  }

  _saveClaudeAdsActionDecisions_(decisions);
  Logger.log('executarAcoesAprovadas: ' + executadas + ' executadas, ' + erros.length + ' erros.');
  return { executadas: executadas, erros: erros, detalhes: detalhes };
}

/**
 * Reverte uma ação já executada (desfaz pausa ou scale de budget).
 * Exportado para google.script.run.
 *
 * Idempotente: lança erro se já revertida anteriormente.
 * @param {string} actionId
 */
function reverterAcaoExecutada(actionId) {
  if (!actionId) throw new Error('actionId obrigatorio.');
  var decisions = _getClaudeAdsActionDecisions_();
  var d = decisions[String(actionId)];
  if (!d) throw new Error('Decisao nao encontrada: ' + actionId);
  if (!d.executed_at) throw new Error('Acao ainda nao foi executada — nada a reverter.');
  if (d.reverted_at) throw new Error('Acao ja foi revertida em ' + d.reverted_at + '.');

  var actionType = String(d.action_type || '').toLowerCase();
  var campaignId = String(d.meta_campaign_id || '').trim();
  var adsetId    = String(d.meta_adset_id || '').trim();

  if (actionType === 'pause_campaign' || actionType === 'pause') {
    var statusAnterior = d.meta_status_before || 'ACTIVE';
    _metaCampanhaUpdate_(campaignId, { status: statusAnterior });

  } else if (actionType === 'scale_budget_guardrailed' || actionType === 'scale') {
    if (!adsetId) throw new Error('meta_adset_id nao informado para reverter scale.');
    if (!d.meta_budget_before) throw new Error('Budget original nao registrado — reversao impossivel. Ajuste manualmente no Gerenciador de Anuncios.');
    _metaCampanhaUpdate_(adsetId, { daily_budget: String(d.meta_budget_before) });

  }
  // review / maintain — sem chamada API; apenas marca como revertido

  d.reverted_at   = new Date().toISOString();
  d.revert_result = 'ok';
  decisions[String(actionId)] = d;
  _saveClaudeAdsActionDecisions_(decisions);

  Logger.log('reverterAcaoExecutada: ' + actionId + ' revertida com sucesso.');
  return { ok: true, action_id: actionId };
}
