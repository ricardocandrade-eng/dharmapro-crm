// ============================================================
// DHARMA PRO — MÓDULO META ADS TRACKING v2.1
// Aba dedicada: "Leads Meta Ads"
// Atualizado em: 20/04/2026 | Adicionado: getPainelAdsData()
// ============================================================

var CFG_META = {
  ABA_LEADS_META:  'Leads Meta Ads',
  API_VERSION:     'v20.0',
  // Conta primária (layer de ações/contratos legados — pause/scale, resumo_trafego).
  AD_ACCOUNT_ID:   'act_971543562231015',
  // Contas LIDAS/AGREGADAS nos painéis (Painel Ads + Dashboard executivo).
  // Ordem: agência ativa (Vero 02) primeiro, depois a antiga (Vero 01).
  AD_ACCOUNT_IDS:  ['act_2839032026433564', 'act_971543562231015'],
  AD_ACCOUNT_NOMES: {
    'act_2839032026433564': 'Vero 02',
    'act_971543562231015':  'Vero 01'
  },
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

// Campanhas pausadas/legadas cujo utm_campaign não deve mais receber leads
// (a operação roda via "AG - Vero Fibra Amplo" na agência desde 17/05/2026).
// VENDAS fica DE FORA — é campanha ativa, mantida no dropdown manual.
var CAMPANHAS_PAUSADAS_META = [
  'A - JF Principal',
  'B - Órbita JF',
  'C - BH Metro',
  'D - Conversas JF + Órbita'
];

/** True se utm_campaign corresponde a uma campanha pausada/legada. */
function _campanhaPausadaMeta_(camp) {
  return CAMPANHAS_PAUSADAS_META.indexOf(String(camp || '').trim()) !== -1;
}


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
  // Origem do lead: 'webhook' (BotConversa/n8n, default), 'manual' (registro pela
  // UI) ou 'renata' (reservado p/ a IA quando entrar em produção). Gravado na
  // col O — usado pelo reconciliador Painel Ads ↔ CRM e pelo badge da tabela.
  var origem = String(payload.origem || 'webhook').trim().toLowerCase();
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

  // Col O: origem (M/N são preenchidas só na conversão por _registrarRastreabilidadeVenda_).
  try {
    _ensureHeaderOrigemMeta_(aba);
    aba.getRange(ultimaLinha, 15).setValue(origem);
  } catch (e) { Logger.log('gravar origem (linha ' + ultimaLinha + '): ' + e.message); }

  Logger.log('Lead Meta Ads registrado: ' + payload.nome + ' | ' + payload.cidade + ' | linha ' + ultimaLinha);

  // Alerta 5 — disparo-grupo (não-bloqueante; nunca falha o lead).
  try { _disparoAlertaLeadMeta_(ultimaLinha, payload.nome); }
  catch (e) { Logger.log('Alerta lead meta — erro: ' + e.message); }

  // Fase 4: validação proativa — lead novo atribuído a campanha pausada/legada
  // (ex: fluxo BotConversa antigo Vero! 1/2/3) é registrado p/ reatribuição.
  // Não-bloqueante; não altera o lead (direção de correção fica com o time).
  try {
    var campLead = String(payload.utm_campaign || '').trim();
    if (_campanhaPausadaMeta_(campLead)) {
      _logReconciliacaoMeta_('lead_campanha_pausada',
        'Lead novo (linha ' + ultimaLinha + ', ' + String(payload.nome || '') +
        ', tel ' + String(payload.telefone || '').replace(/\D/g, '') +
        ') atribuído à campanha pausada "' + campLead + '" — reatribuir para "AG - Vero Fibra Amplo".');
    }
  } catch (e) { Logger.log('Valida campanha pausada — erro: ' + e.message); }

  return ultimaLinha;
}

function registrarLeadManual(dados) {
  try {
    var payload = {
      nome:         dados.nome         || '',
      telefone:     dados.telefone     || '',
      cidade:       dados.cidade       || '',
      utm_source:   dados.utm_source   || 'meta_ads',
      utm_campaign: dados.utm_campaign || '',
      utm_medium:   dados.utm_medium   || 'cpc',
      utm_ad:       dados.utm_ad       || '',
      origem:       'manual'
    };
    var linha = registrarLeadMetaAds(payload);
    return { ok: true, linha: linha };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
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
  var convertidos = leads.filter(function(l) {
    var s = String(l.status_final || '').toLowerCase();
    return s === 'venda-fechada' || s === 'converteu';
  }).length;
  var desq = leads.filter(function(l) {
    var s = String(l.status_final || '').toLowerCase();
    return s === 'venda-perdida' || s === 'sem-viabilidade' || s === 'sem-interesse' || s === 'reprovado-cpf' || s === 'desqualificado';
  }).length;
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

    var raw = aba.getRange(2, 1, ult - 1, 15).getValues(); // A–O (inclui origem)
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
        origem:       String(r[14] || '').trim().toLowerCase() || 'webhook', // col O; legado vazio → webhook
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
 * Marca o lead Meta Ads como "Converteu" a partir de uma venda
 * (direção única Vendas → Leads). Match por telefone normalizado, janela de
 * 30 dias, idempotente (pula lead que já tem status_final). Registra contrato
 * e data da venda (cols M/N) pra rastreabilidade. Não lança erro — falha
 * silenciosa para não bloquear o save da venda.
 *
 * @param {string} telefone        Telefone da venda (qualquer formato)
 * @param {string} [idContrato]    ID do contrato/OS da venda
 * @param {Date|string} [dataVenda] Data da venda
 * @returns {number|null}          >0 = linha recém-marcada "Converteu";
 *                                 0  = existe lead com esse telefone mas não foi
 *                                      vinculado (já finalizado ou fora da janela);
 *                                 null = nenhum lead com esse telefone (miss real).
 */
function vincularVendaLeadMetaAds(telefone, idContrato, dataVenda) {
  var tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length > 11) tel = tel.slice(-11); // remove DDI 55
  if (!tel || tel.length < 8) return null;

  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) return null;

  var lastRow = aba.getLastRow();
  if (lastRow < 2) return null;

  var JANELA_DIAS = 30;
  var agora = new Date();
  var matched = false; // achou lead com o telefone (independente de status/janela)

  var dados = aba.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < dados.length; i++) {
    var leadTel = String(dados[i][2] || '').replace(/\D/g, '');
    if (leadTel.length > 11) leadTel = leadTel.slice(-11);
    if (leadTel !== tel) continue;
    matched = true;
    if (dados[i][8]) continue; // já tem status_final — tenta próximo match (lead duplicado)

    // Só vincula se o lead entrou nos últimos 30 dias
    var dataEntrada = dados[i][0];
    if (!(dataEntrada instanceof Date)) continue;
    var diasDesdeEntrada = (agora - dataEntrada) / (1000 * 60 * 60 * 24);
    if (diasDesdeEntrada > JANELA_DIAS) {
      Logger.log('vincularVendaLeadMetaAds: tel ' + tel + ' ignorado — lead com ' + diasDesdeEntrada.toFixed(0) + ' dias (limite: ' + JANELA_DIAS + ')');
      continue;
    }

    var linha = i + 2;
    aba.getRange(linha, 9).setValue('venda-fechada'); // col I: status_final (taxonomia Chatwoot)
    aba.getRange(linha, 11).setValue(new Date());     // col K: data_status
    _registrarRastreabilidadeVenda_(aba, linha, idContrato, dataVenda); // cols M/N
    Logger.log('vincularVendaLeadMetaAds: tel ' + tel + ' → linha ' + linha + ' = venda-fechada (contrato ' + (idContrato || '-') + ', ' + diasDesdeEntrada.toFixed(0) + ' dias)');
    return linha;
  }
  return matched ? 0 : null;
}

/**
 * Grava data_venda (col M=13) e id_contrato (col N=14) no lead pra
 * rastreabilidade. Cria os cabeçalhos M1/N1 se ainda não existirem. Não lança.
 */
function _registrarRastreabilidadeVenda_(aba, linha, idContrato, dataVenda) {
  try {
    if (!String(aba.getRange(1, 13).getValue() || '').trim()) {
      aba.getRange(1, 13, 1, 2).setValues([['data_venda', 'id_contrato']]);
    }
    var dv = dataVenda instanceof Date ? dataVenda : (dataVenda ? new Date(dataVenda) : new Date());
    if (isNaN(dv.getTime())) dv = new Date();
    aba.getRange(linha, 13).setValue(dv);
    aba.getRange(linha, 14).setValue(String(idContrato || ''));
  } catch (e) {
    Logger.log('_registrarRastreabilidadeVenda_ falhou: ' + e.message);
  }
}

/** Garante o cabeçalho O1 ('origem') na aba Leads Meta Ads. Idempotente. */
function _ensureHeaderOrigemMeta_(aba) {
  if (!String(aba.getRange(1, 15).getValue() || '').trim()) {
    aba.getRange(1, 15).setValue('origem');
  }
}

/**
 * Manutenção (rodar UMA VEZ no editor): preenche a col O ('origem') das linhas
 * legadas que estão vazias com 'webhook' (default histórico — leads vinham do
 * BotConversa/n8n antes da feature). Idempotente: só toca células vazias.
 * Leads manuais antigos não são distinguíveis com confiança, então caem como
 * 'webhook' por design. Daqui pra frente registrarLeadManual grava 'manual'.
 */
function backfillOrigemLeadsMeta() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada.');
  _ensureHeaderOrigemMeta_(aba);

  var ult = aba.getLastRow();
  if (ult < 2) { Logger.log('backfillOrigemLeadsMeta: nada a preencher.'); return { ok: true, preenchidas: 0 }; }

  var rng = aba.getRange(2, 15, ult - 1, 1); // col O, linhas de dados
  var vals = rng.getValues();
  var n = 0;
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i][0] || '').trim()) { vals[i][0] = 'webhook'; n++; }
  }
  if (n > 0) rng.setValues(vals);
  Logger.log('backfillOrigemLeadsMeta: ' + n + ' linha(s) preenchida(s) com "webhook".');
  return { ok: true, preenchidas: n };
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

  // Frontend é a fonte de verdade — remove qualquer validação herdada (idempotente).
  aba.getRange(linha, 9, 1, 3).clearDataValidations();

  aba.getRange(linha, 9).setValue(status  || ''); // col I: status_final
  aba.getRange(linha, 10).setValue(motivo || ''); // col J: motivo_desq
  aba.getRange(linha, 11).setValue(new Date());   // col K: data_status

  Logger.log('atualizarStatusLeadMetaAds: linha ' + linha + ' → ' + (status || 'limpo'));
  return { ok: true, linha: linha, status: status };
}


// ═══════════════════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO COM CHATWOOT — labels manuais viram Status do lead
// Chamado pelo doPost via n8n quando uma label terminal é aplicada no Chatwoot.
// ═══════════════════════════════════════════════════════════════════════════

// Labels do Chatwoot que viram Status do lead. Match exato com o slug Chatwoot.
var STATUS_TERMINAIS_CHATWOOT = [
  'venda-fechada',
  'venda-perdida',
  'sem-viabilidade',
  'sem-interesse',
  'reprovado-cpf'
];

function _statusTerminalChatwoot_(s) {
  return STATUS_TERMINAIS_CHATWOOT.indexOf(String(s || '').trim().toLowerCase()) !== -1;
}

/**
 * Atualiza o Status do lead Meta Ads identificando-o por telefone.
 * Chamado pelo n8n quando uma label terminal é aplicada manualmente no Chatwoot.
 *
 * @param {{telefone:string, status:string}} payload
 * @returns {object} { ok, linha?, alterado?, motivo? }
 */
function atualizarStatusLeadMetaAdsPorTelefone(payload) {
  payload = payload || {};
  var tel = String(payload.telefone || '').replace(/\D/g, '');
  if (tel.length > 11) tel = tel.slice(-11); // remove DDI 55
  if (!tel || tel.length < 8) return { ok: false, motivo: 'telefone_invalido' };

  var status = String(payload.status || '').trim().toLowerCase();
  if (!_statusTerminalChatwoot_(status)) return { ok: false, motivo: 'label_nao_terminal' };

  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) return { ok: false, motivo: 'aba_nao_encontrada' };

  var ult = aba.getLastRow();
  if (ult < 2) return { ok: false, motivo: 'lead_nao_encontrado' };

  // Lê col C (telefone) + col I (status_final). Busca da última linha pra cima
  // — lead mais recente do telefone vence.
  var rng = aba.getRange(2, 3, ult - 1, 7).getValues(); // C..I
  var linhaAlvo = -1;
  for (var i = rng.length - 1; i >= 0; i--) {
    var celTel = String(rng[i][0] || '').replace(/\D/g, '');
    if (celTel.length > 11) celTel = celTel.slice(-11);
    if (celTel && celTel.slice(-8) === tel.slice(-8)) { linhaAlvo = i + 2; break; }
  }
  if (linhaAlvo < 0) return { ok: false, motivo: 'lead_nao_encontrado' };

  var statusAtual = String(aba.getRange(linhaAlvo, 9).getValue() || '').trim().toLowerCase();
  if (statusAtual === status) {
    return { ok: true, linha: linhaAlvo, alterado: false };
  }

  aba.getRange(linhaAlvo, 9, 1, 3).clearDataValidations();
  aba.getRange(linhaAlvo, 9).setValue(status);    // col I: status_final
  aba.getRange(linhaAlvo, 11).setValue(new Date()); // col K: data_status

  Logger.log('atualizarStatusLeadMetaAdsPorTelefone: tel=' + tel + ' linha=' + linhaAlvo + ' → ' + status);
  return { ok: true, linha: linhaAlvo, alterado: true, status: status };
}


/**
 * Atualiza a cidade de um lead na aba "Leads Meta Ads" (col D).
 * Chamado pela edição inline da coluna Cidade (sugestão por DDD confirmada/editada).
 *
 * @param {number} linha   Linha na planilha (>= 2)
 * @param {string} cidade  Cidade (string livre; '' limpa a célula)
 */
function atualizarCidadeLeadMetaAds(linha, cidade) {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada.');
  if (!linha || linha < 2) throw new Error('Linha inválida: ' + linha);
  if (linha > aba.getLastRow()) throw new Error('Linha ' + linha + ' não existe.');

  aba.getRange(linha, 4).setValue(String(cidade || '').trim()); // col D: cidade
  Logger.log('atualizarCidadeLeadMetaAds: linha ' + linha + ' → ' + (cidade || 'vazio'));
  return { ok: true, linha: linha, cidade: cidade };
}


/**
 * Remove TODAS as regras de validação de dados da aba "Leads Meta Ads".
 * O frontend (LeadsMetaAds.html) é a fonte única de verdade para opções.
 * Idempotente.
 */
function removerValidacoesLeadsMetaAds() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada.');
  aba.getRange(1, 1, aba.getMaxRows(), aba.getMaxColumns()).clearDataValidations();
  Logger.log('removerValidacoesLeadsMetaAds: validações limpas na aba inteira.');
  return { ok: true };
}


/**
 * Exclui um lead da aba "Leads Meta Ads".
 * Chamado pelo botão 🗑 da tela Leads Meta Ads.
 *
 * @param {number} linha  Linha na planilha (>= 2)
 */
function excluirLeadMetaAds(linha) {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) throw new Error('Aba "' + CFG_META.ABA_LEADS_META + '" não encontrada.');
  if (!linha || linha < 2) throw new Error('Linha inválida: ' + linha);
  if (linha > aba.getLastRow()) throw new Error('Linha ' + linha + ' não existe.');

  aba.deleteRow(linha);
  Logger.log('excluirLeadMetaAds: linha ' + linha + ' removida.');
  return { ok: true, linha: linha };
}


// ═══════════════════════════════════════════════════════════════════════════
// DROPDOWN DINÂMICO DE CAMPANHA (registro manual de Leads Meta Ads)
// Lê campanhas ACTIVE da Meta API (todas as contas), mapeia pro rótulo CRM
// via aba "Mapeamento Campanhas Meta", cacheia 15min. Zero manutenção no código.
// ═══════════════════════════════════════════════════════════════════════════

var ABA_MAPA_CAMPANHAS_META = 'Mapeamento Campanhas Meta';
var CACHE_KEY_DROPDOWN_CAMP = 'meta:dropdown_campanhas';

/**
 * Dropdown de Campanha para o registro manual. Itera as contas, pega campanhas
 * ACTIVE, mapeia pro rótulo CRM, agrupa rótulos únicos e anexa a sentinela
 * "Orgânico / Indicação". Cache 15min. Em falha da Meta API, retorna ok:false
 * com lista mínima (o frontend mostra o erro — não usa fallback silencioso).
 * @returns {{ok:boolean, campanhas:Array<{label:string, anuncios:string[]}>, erro?:string}}
 */
function getCampanhasAtivasParaDropdown() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY_DROPDOWN_CAMP);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  try {
    var contas = _getContasMetaAds_();
    var mapaPadroes = _getMapaCampanhasMeta_();
    var porLabel = {}; // label -> { anuncio: true }

    for (var i = 0; i < contas.length; i++) {
      var ativas = _listarCampanhasAtivas_(contas[i]); // lança em erro de API
      for (var j = 0; j < ativas.length; j++) {
        var m = _mapearCampanhaMetaParaCRM_(ativas[j], mapaPadroes);
        if (!porLabel[m.label]) porLabel[m.label] = {};
        m.anuncios.forEach(function(a) { porLabel[m.label][a] = true; });
      }
    }

    var campanhas = Object.keys(porLabel).map(function(label) {
      return { label: label, anuncios: Object.keys(porLabel[label]) };
    });
    // Sentinela sempre presente (não é campanha Meta).
    campanhas.push({ label: 'Orgânico / Indicação', anuncios: ['Indicação', 'Outro'] });

    var resultado = { ok: true, campanhas: campanhas };
    cache.put(CACHE_KEY_DROPDOWN_CAMP, JSON.stringify(resultado), 900); // 15 min
    return resultado;
  } catch (e) {
    Logger.log('getCampanhasAtivasParaDropdown falhou: ' + e.message);
    // NÃO cacheia o erro (retry imediato funciona). Lista mínima só como base;
    // o frontend sinaliza a falha em vez de usá-la silenciosamente.
    return {
      ok: false,
      erro: e.message,
      campanhas: [
        { label: 'AG - Vero Fibra Amplo',  anuncios: ['Indefinido'] },
        { label: 'Orgânico / Indicação',   anuncios: ['Indicação', 'Outro'] }
      ]
    };
  }
}

/**
 * Lê a aba "Mapeamento Campanhas Meta" (cria + popula seed na 1ª vez).
 * @returns {Array<{pattern:string, label:string, anuncios:string[]}>}
 */
function _getMapaCampanhasMeta_() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(ABA_MAPA_CAMPANHAS_META);
  if (!aba) {
    aba = ss.insertSheet(ABA_MAPA_CAMPANHAS_META);
    aba.getRange(1, 1, 1, 4).setValues([['meta_pattern', 'utm_label_crm', 'anuncios_default', 'observacao']]);
    aba.getRange(1, 1, 1, 4).setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.getRange(2, 1, 3, 4).setValues([
      ['P2',           'AG - Vero Fibra Amplo',       'P2 (cópia),P2 (Andromeda),Indefinido', 'Conta Vero 02, agência'],
      ['VENDAS',       'VENDAS - Teste Engajamento',  'Indefinido',                           'Histórico — quando voltar a ativar'],
      ['D - Conversas','D - Conversas JF + Órbita',   'D1 - Vero Mais 550MB + Chip 20GB',     'Histórico']
    ]);
  }
  var ult = aba.getLastRow();
  if (ult < 2) return [];
  var raw = aba.getRange(2, 1, ult - 1, 4).getValues();
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var pattern = String(raw[i][0] || '').trim();
    var label   = String(raw[i][1] || '').trim();
    if (!pattern || !label) continue; // linha vazia / sem rótulo é ignorada
    var anuncios = String(raw[i][2] || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (!anuncios.length) anuncios = ['Indefinido'];
    out.push({ pattern: pattern, label: label, anuncios: anuncios });
  }
  return out;
}

/**
 * Mapeia o nome de uma campanha Meta para o rótulo CRM + anúncios esperados.
 * `pattern` casa por "contém" (case-insensitive). Sem match → nome truncado
 * (30 chars) + ['Indefinido'].
 * @returns {{label:string, anuncios:string[]}}
 */
function _mapearCampanhaMetaParaCRM_(metaName, mapaPadroes) {
  var nome = String(metaName || '').trim();
  var nomeLow = nome.toLowerCase();
  for (var i = 0; i < (mapaPadroes || []).length; i++) {
    if (nomeLow.indexOf(mapaPadroes[i].pattern.toLowerCase()) !== -1) {
      return { label: mapaPadroes[i].label, anuncios: mapaPadroes[i].anuncios.slice() };
    }
  }
  var label = nome.length > 30 ? nome.slice(0, 30) : nome;
  return { label: label || '(sem nome)', anuncios: ['Indefinido'] };
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
  var since, until;

  if (periodo === 'hoje') {
    until = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
    since = until;
  } else if (periodo === '3d') {
    // Alinhado com workflow_relatorio_07h: since = hoje-3, until = ontem
    var ontem3d = new Date(hoje); ontem3d.setDate(ontem3d.getDate() - 1);
    until = Utilities.formatDate(ontem3d, tz, 'yyyy-MM-dd');
    var d3 = new Date(hoje); d3.setDate(d3.getDate() - 3);
    since = Utilities.formatDate(d3, tz, 'yyyy-MM-dd');
  } else if (periodo === '7d') {
    until = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
    var d7 = new Date(hoje); d7.setDate(d7.getDate() - 6);
    since = Utilities.formatDate(d7, tz, 'yyyy-MM-dd');
  } else {
    until = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
    var d30 = new Date(hoje); d30.setDate(d30.getDate() - 29);
    since = Utilities.formatDate(d30, tz, 'yyyy-MM-dd');
  }

  var contas = _getContasMetaAds_();
  var L = CFG_META.LIMITES;

  try {
    var totalGasto = 0, totalLeads = 0, totalImpr = 0, totalCliques = 0;
    var campanhasData = [];
    var alertas = [];
    var contasComErro = [];

    for (var ac = 0; ac < contas.length; ac++) {
      var conta = contas[ac];
      var nomeConta = _nomeContaMeta_(conta);
      var params = {
        access_token: token,
        fields: 'campaign_id,campaign_name,impressions,clicks,ctr,cpm,cpc,spend,actions,frequency',
        time_range: JSON.stringify({ since: since, until: until }),
        level: 'campaign',
        limit: '100'
      };
      var qs = Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      var url = 'https://graph.facebook.com/' + CFG_META.API_VERSION + '/' + conta + '/insights?' + qs;

      var data, statusMap;
      try {
        var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var json = JSON.parse(resp.getContentText());
        if (json.error) { contasComErro.push(nomeConta + ': ' + json.error.message); continue; }
        data = json.data || [];
        statusMap = _mapaStatusCampanhas_(conta);
      } catch (eConta) {
        contasComErro.push(nomeConta + ': ' + eConta.message);
        continue;
      }

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
        var efStatus = statusMap[row.campaign_id] || '';
        var pausada = !!efStatus && efStatus !== 'ACTIVE';
        var status = pausada ? 'pausada' : 'ok';

        // Campanha pausada não gera alerta de pausa/atenção — já está parada.
        if (!pausada) {
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
        }

        campanhasData.push({
          id: row.campaign_id,
          nome: row.campaign_name,
          conta: nomeConta,
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
    }

    // Se TODAS as contas falharam, propaga erro; senão segue com o que veio.
    if (campanhasData.length === 0 && contasComErro.length >= contas.length) {
      return { erro: 'Meta Ads API: ' + contasComErro.join(' | ') };
    }

    // Ordena: ativas primeiro, depois pausadas; cada grupo por gasto desc.
    campanhasData.sort(function(a, b) {
      var pa = a.status === 'pausada' ? 1 : 0;
      var pb = b.status === 'pausada' ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (b.gasto || 0) - (a.gasto || 0);
    });

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

    // Gera fila de decisão a partir das campanhas com alertas de pausa
    var filaPrioritaria = [];
    var decisoesExistentes = _getClaudeAdsActionDecisions_();

    for (var fi = 0; fi < campanhasData.length; fi++) {
      var camp = campanhasData[fi];
      if (camp.status === 'pausada') continue; // já pausada — não entra na fila de pausa
      var acaoId = 'pause_' + camp.id;
      var rationale, humanCheck;

      if (camp.cpl && camp.cpl > L.CPL_MAX && camp.gasto > 100) {
        rationale = 'CPL de R$' + camp.cpl.toFixed(2) + ' está acima do limite de R$' + L.CPL_MAX + ' com R$' + camp.gasto.toFixed(2) + ' gastos. Custo por lead inviável.';
        humanCheck = 'Verifique se houve queda de qualidade no público ou no criativo nos últimos dias antes de pausar.';
      } else if (camp.ctr < L.CTR_MIN && camp.gasto > 20) {
        rationale = 'CTR de ' + camp.ctr.toFixed(2) + '% abaixo do mínimo de ' + L.CTR_MIN + '% com R$' + camp.gasto.toFixed(2) + ' gastos. O anúncio não está sendo clicado.';
        humanCheck = 'Verifique se o criativo está saturado ou se o público alvo está muito amplo.';
      } else if (camp.frequencia > L.FREQUENCIA_MAX) {
        rationale = 'Frequência de ' + camp.frequencia.toFixed(1) + 'x indica saturação de público (limite: ' + L.FREQUENCIA_MAX + 'x). A mesma pessoa já viu o anúncio muitas vezes.';
        humanCheck = 'Considere pausar e renovar o criativo antes que o CPL suba por saturação.';
      } else {
        continue;
      }

      var decSalva = decisoesExistentes[acaoId] || null;
      filaPrioritaria.push({
        action_id:        acaoId,
        action_type:      'pause_campaign',
        campaign_key:     camp.nome,
        meta_campaign_id: camp.id,
        rationale:        rationale,
        human_check:      humanCheck,
        execution_mode:   'approval_required',
        approval_state:   decSalva || { status: 'pending', decided_at: null, decided_by: null, note: null }
      });
    }

    var temErro = alertas.some(function(a) { return a.tipo === 'erro'; });
    var statusGeral = alertas.length === 0 ? 'OPERAÇÃO NORMAL' : (temErro ? 'ATENÇÃO CRÍTICA' : 'MONITORAMENTO');

    return {
      modo: 'cockpit_bridge',
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
      alertas_operacionais: _alertasOperacionaisLeads_(),
      contas: contas.map(function(c) { return _nomeContaMeta_(c); }),
      dharma: dharma,
      cockpit: {
        operador: {
          status_geral: statusGeral,
          leitura_rapida: alertas.map(function(a) { return a.texto; }),
          o_que_fazer_primeiro: {}
        },
        automacao: {
          total_acoes:      filaPrioritaria.length,
          dry_run_default:  true,
          fila_prioritaria: filaPrioritaria,
          approval_summary: _buildClaudeAdsActionDecisionSummary_(filaPrioritaria)
        },
        experimentos: { total: 0, prioritarios: [] }
      }
    };
  } catch (e) {
    return { erro: 'Erro inesperado: ' + e.message };
  }
}


/**
 * Dashboard executivo Meta Ads: Gasto · Leads · Vendas · CPA em 3 janelas
 * (Hoje · Esta semana=7d incl. hoje · Este mês=MTD). Gasto agrega todas as
 * contas (CFG_META.AD_ACCOUNT_IDS); Leads/Vendas vêm da aba "Leads Meta Ads"
 * (CRM). CPA = gasto/vendas por janela. Inclui série diária de gasto (30d)
 * pro gráfico spend×dia.
 */
function getDashboardMetaAdsExecutivo() {
  try {
    var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN');
    if (!token) return { ok: false, erro: 'META_ACCESS_TOKEN não configurado.' };

    var tz   = Session.getScriptTimeZone();
    var hoje = new Date();
    var hojeKey = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
    var d30 = new Date(hoje); d30.setDate(d30.getDate() - 29);
    var sinceKey = Utilities.formatDate(d30, tz, 'yyyy-MM-dd');
    var d7 = new Date(hoje); d7.setDate(d7.getDate() - 6);
    var seteKey = Utilities.formatDate(d7, tz, 'yyyy-MM-dd');
    var mesKey  = Utilities.formatDate(hoje, tz, 'yyyy-MM') + '-01';

    // 1) Gasto diário por conta (time_increment=1) → mapa data→gasto agregado.
    var contas = _getContasMetaAds_();
    var gastoPorDia = {};
    var contasComErro = [];
    for (var ac = 0; ac < contas.length; ac++) {
      var conta = contas[ac];
      var params = {
        access_token:   token,
        fields:         'spend',
        time_range:     JSON.stringify({ since: sinceKey, until: hojeKey }),
        time_increment: '1',
        level:          'account',
        limit:          '60'
      };
      var qs = Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      var url = 'https://graph.facebook.com/' + CFG_META.API_VERSION + '/' + conta + '/insights?' + qs;
      try {
        var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        var json = JSON.parse(resp.getContentText());
        if (json.error) { contasComErro.push(_nomeContaMeta_(conta) + ': ' + json.error.message); continue; }
        (json.data || []).forEach(function(rowDia) {
          var dk = rowDia.date_start;
          if (dk) gastoPorDia[dk] = (gastoPorDia[dk] || 0) + parseFloat(rowDia.spend || 0);
        });
      } catch (eC) {
        contasComErro.push(_nomeContaMeta_(conta) + ': ' + eC.message);
      }
    }

    var serieDia = Object.keys(gastoPorDia).sort().map(function(k) {
      return { data: k, gasto: gastoPorDia[k] };
    });
    function somaGastoDesde(desdeKey) {
      var t = 0;
      for (var k in gastoPorDia) { if (k >= desdeKey) t += gastoPorDia[k]; }
      return t;
    }
    var gastoHoje   = gastoPorDia[hojeKey] || 0;
    var gastoSemana = somaGastoDesde(seteKey);
    var gastoMes    = somaGastoDesde(mesKey);

    // 2) Leads & Vendas do CRM por janela.
    var crm = _crmLeadsVendasPorJanela_(tz, hojeKey, seteKey, mesKey);
    function cpa(g, v) { return v > 0 ? g / v : null; }

    return {
      ok: true,
      gerado_em: new Date().toISOString(),
      contas: contas.map(function(c) { return _nomeContaMeta_(c); }),
      contas_com_erro: contasComErro,
      janelas: {
        hoje:   { gasto: gastoHoje,   leads: crm.hoje.leads,   vendas: crm.hoje.vendas,   cpa: cpa(gastoHoje, crm.hoje.vendas) },
        semana: { gasto: gastoSemana, leads: crm.semana.leads, vendas: crm.semana.vendas, cpa: cpa(gastoSemana, crm.semana.vendas) },
        mes:    { gasto: gastoMes,    leads: crm.mes.leads,    vendas: crm.mes.vendas,    cpa: cpa(gastoMes, crm.mes.vendas) }
      },
      serie_dia: serieDia
    };
  } catch (e) {
    return { ok: false, erro: 'Erro inesperado: ' + e.message };
  }
}

/**
 * Conta leads (por data_entrada, col A) e vendas (status_final='Converteu',
 * por data_status col K com fallback à entrada) na aba "Leads Meta Ads", em
 * 3 janelas: hoje, semana (>= seteKey), mês (>= mesKey). Compara yyyy-MM-dd.
 */
function _crmLeadsVendasPorJanela_(tz, hojeKey, seteKey, mesKey) {
  var z = { hoje: { leads: 0, vendas: 0 }, semana: { leads: 0, vendas: 0 }, mes: { leads: 0, vendas: 0 } };
  try {
    var ss  = _getSpreadsheet_();
    var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
    if (!aba) return z;
    var ult = aba.getLastRow();
    if (ult < 2) return z;
    var raw = aba.getRange(2, 1, ult - 1, 12).getValues();
    function keyOf(v) {
      if (!v) return '';
      var d = v instanceof Date ? v : new Date(v);
      return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    }
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r[0]) continue;
      var kEntrada = keyOf(r[0]);  // col A: data_entrada
      if (kEntrada) {
        if (kEntrada === hojeKey) z.hoje.leads++;
        if (kEntrada >= seteKey)  z.semana.leads++;
        if (kEntrada >= mesKey)   z.mes.leads++;
      }
      if (String(r[8] || '').trim() === 'Converteu') {  // col I: status_final
        var kStatus = keyOf(r[10]) || kEntrada;          // col K: data_status
        if (kStatus === hojeKey) z.hoje.vendas++;
        if (kStatus >= seteKey)  z.semana.vendas++;
        if (kStatus >= mesKey)   z.mes.vendas++;
      }
    }
    return z;
  } catch (e) {
    Logger.log('_crmLeadsVendasPorJanela_ falhou: ' + e.message);
    return z;
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


// ═══════════════════════════════════════════════════════════════════════════
// SETUP — executar uma vez para registrar a chave da Claude API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute UMA VEZ no editor Apps Script para salvar a chave da Claude API.
 * Após executar, pode apagar a chave do código — ela fica salva nas Properties.
 *
 * Como executar: Extensões → Apps Script → selecione esta função → ▶ Executar
 */
function configurarClaudeApiKey() {
  var CHAVE = 'COLE_SUA_CHAVE_AQUI'; // substitua antes de executar

  if (!CHAVE || CHAVE === 'COLE_SUA_CHAVE_AQUI') {
    Logger.log('ERRO: Substitua COLE_SUA_CHAVE_AQUI pela chave real antes de executar.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', CHAVE);
  Logger.log('CLAUDE_API_KEY salva com sucesso. Pode apagar a chave do código agora.');
}


// ═══════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICO AO VIVO — Meta + CRM + Claude API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Busca métricas reais da Meta + leads do CRM, envia à Claude API e
 * retorna um diagnóstico em texto corrido escrito como gestor de tráfego.
 * Exportado para google.script.run.diagnosticarAgora()
 */
function diagnosticarAgora() {
  try {
    var props     = PropertiesService.getScriptProperties();
    var token     = props.getProperty('META_ACCESS_TOKEN');
    var claudeKey = props.getProperty('CLAUDE_API_KEY');

    if (!claudeKey) return { ok: false, erro: 'CLAUDE_API_KEY não configurada. Vá em Extensões → Apps Script → Propriedades do projeto e adicione a chave.' };
    if (!token)     return { ok: false, erro: 'META_ACCESS_TOKEN não configurado em Propriedades do projeto.' };

    var insights  = _fetchMetaInsightsParaDiag_(token);
    var leadsData = _fetchLeadsCrmParaDiag_();
    var prompt    = _buildDiagnosisPrompt_(insights, leadsData);
    var texto     = _callClaudeApiDiag_(claudeKey, prompt);

    return {
      ok: true,
      diagnostico_texto: texto,
      metricas_raw: insights,
      gerado_em: new Date().toISOString()
    };
  } catch (e) {
    Logger.log('diagnosticarAgora erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

function _fetchMetaInsightsParaDiag_(token) {
  var tz    = Session.getScriptTimeZone();
  var hoje  = new Date();
  var until = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
  var d7    = new Date(hoje); d7.setDate(d7.getDate() - 6);
  var since = Utilities.formatDate(d7, tz, 'yyyy-MM-dd');

  var base   = 'https://graph.facebook.com/' + CFG_META.API_VERSION + '/' + CFG_META.AD_ACCOUNT_ID + '/insights';
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

  var resp = UrlFetchApp.fetch(base + '?' + qs, { muteHttpExceptions: true });
  var json = JSON.parse(resp.getContentText());
  if (json.error) throw new Error('Meta API: ' + json.error.message);

  var resultado = [];
  var data = json.data || [];

  for (var i = 0; i < data.length; i++) {
    var row     = data[i];
    var gasto   = parseFloat(row.spend || 0);
    var impr    = parseInt(row.impressions || 0, 10);
    var cliques = parseInt(row.clicks || 0, 10);
    var ctr     = parseFloat(row.ctr || 0);
    var cpm     = parseFloat(row.cpm || 0);
    var freq    = parseFloat(row.frequency || 0);

    var leadsAct = (row.actions || []).filter(function(a) {
      return a.action_type === 'lead' || a.action_type === 'onsite_conversion.messaging_conversation_started_7d';
    });
    var leads = leadsAct.length > 0 ? parseFloat(leadsAct[0].value || 0) : 0;
    var cpl   = leads > 0 ? gasto / leads : null;

    resultado.push({
      campaign_id:   row.campaign_id,
      campaign_name: row.campaign_name,
      gasto:         gasto,
      impressoes:    impr,
      cliques:       cliques,
      leads:         leads,
      ctr:           ctr,
      cpm:           cpm,
      freq:          freq,
      cpl:           cpl
    });
  }

  return { desde: since, ate: until, campanhas: resultado };
}

function _fetchLeadsCrmParaDiag_() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba || aba.getLastRow() < 2) return { por_campanha: {} };

  var raw = aba.getRange(2, 1, aba.getLastRow() - 1, 12).getValues();
  var por_campanha = {};

  for (var i = 0; i < raw.length; i++) {
    var r        = raw[i];
    if (!r[0]) continue;
    var campanha = String(r[5] || 'sem_campanha').trim(); // col F: utm_campaign
    var status   = String(r[8] || '').trim();             // col I: status_final
    var motivo   = String(r[9] || '').trim();             // col J: motivo_desq

    if (!por_campanha[campanha]) {
      por_campanha[campanha] = { total: 0, convertidos: 0, desqualificados: 0, pendentes: 0, motivos: {} };
    }
    por_campanha[campanha].total++;
    if (status === 'Converteu') {
      por_campanha[campanha].convertidos++;
    } else if (status === 'Desqualificado') {
      por_campanha[campanha].desqualificados++;
      if (motivo) {
        por_campanha[campanha].motivos[motivo] = (por_campanha[campanha].motivos[motivo] || 0) + 1;
      }
    } else {
      por_campanha[campanha].pendentes++;
    }
  }

  return { por_campanha: por_campanha };
}

function _buildDiagnosisPrompt_(insights, leadsData) {
  var ctx = [
    'Você é Claude Ads, um gestor de tráfego pago sênior especializado em provedores de internet/fibra óptica.',
    'Analise os dados abaixo e escreva um diagnóstico real da operação de Meta Ads da Mobile Digital,',
    'uma revenda oficial Vero Internet com base em Juiz de Fora (MG).',
    '',
    'CONTEXTO DO NEGÓCIO:',
    '- Ticket médio de venda (franquia): R$313/venda instalada',
    '- CPA máximo aceitável: R$120. CPA meta de excelência: R$80.',
    '- CPL máximo: R$30 — pausar se ultrapassar com mais de R$100 gastos',
    '- CTR mínimo: 0,5% — pausar se abaixo com mais de R$20 gastos',
    '- Frequência máxima: 4,0× — indica saturação de público',
    '- Regra de escala: +20% por semana quando CPA < R$80 por 5 dias consecutivos',
    '- Abril é estruturalmente o mês de menor volume do ano — não é problema, é sazonalidade',
    '- Analise SOMENTE as campanhas listadas nos DADOS REAIS abaixo. Não cite campanhas que não aparecem nos dados (podem estar pausadas).',
    '- Plano prioritário: Oferta Verão 800MB + Globoplay + Max + Chip 60GB por R$149,90/mês',
    '- Benchmarks saudáveis do setor: CPL R$12–18, CTR 1,0–1,5%, CPA R$60–80',
    ''
  ].join('\n');

  var metaTxt = 'DADOS REAIS DA META (últimos 7 dias — ' + insights.desde + ' a ' + insights.ate + '):\n';
  // Só campanhas com gasto no período — pausadas/sem veiculação ficam de fora
  // pra a IA não narrar campanha parada como se estivesse ativa.
  var camps   = (insights.campanhas || []).filter(function(c) { return parseFloat(c.gasto || 0) > 0; });
  if (camps.length === 0) {
    metaTxt += '(Nenhuma campanha com gasto no período)\n';
  } else {
    for (var i = 0; i < camps.length; i++) {
      var c = camps[i];
      metaTxt += '\n' + c.campaign_name + ':\n';
      metaTxt += '  Gasto: R$' + c.gasto.toFixed(2);
      metaTxt += ' | Impressões: ' + c.impressoes;
      metaTxt += ' | Cliques: ' + c.cliques;
      metaTxt += ' | CTR: ' + c.ctr.toFixed(2) + '%';
      metaTxt += ' | CPM: R$' + c.cpm.toFixed(2);
      metaTxt += ' | Frequência: ' + c.freq.toFixed(1) + 'x\n';
      metaTxt += '  Leads (Meta): ' + c.leads;
      metaTxt += ' | CPL: ' + (c.cpl !== null ? 'R$' + c.cpl.toFixed(2) : 'N/A (sem leads)') + '\n';
    }
  }

  var crmTxt = '\nDADOS DO CRM — Leads Meta Ads (aba "Leads Meta Ads", acumulado):\n';
  var pCamp  = leadsData.por_campanha || {};
  var keys   = Object.keys(pCamp);
  if (keys.length === 0) {
    crmTxt += '(Nenhum lead registrado no CRM ainda)\n';
  } else {
    for (var j = 0; j < keys.length; j++) {
      var camp  = keys[j];
      var d     = pCamp[camp];
      var taxaC = d.total > 0 ? ((d.convertidos / d.total) * 100).toFixed(1) : '0';
      var taxaD = d.total > 0 ? ((d.desqualificados / d.total) * 100).toFixed(1) : '0';
      crmTxt += '\nCampanha "' + camp + '":\n';
      crmTxt += '  Total: ' + d.total;
      crmTxt += ' | Convertidos: ' + d.convertidos + ' (' + taxaC + '%)';
      crmTxt += ' | Desqualificados: ' + d.desqualificados + ' (' + taxaD + '%)';
      crmTxt += ' | Pendentes: ' + d.pendentes + '\n';
      var mKeys = Object.keys(d.motivos);
      if (mKeys.length > 0) {
        mKeys.sort(function(a, b) { return d.motivos[b] - d.motivos[a]; });
        var top3 = mKeys.slice(0, 3).map(function(m) { return m + ' (' + d.motivos[m] + ')'; });
        crmTxt += '  Top motivos desq: ' + top3.join(', ') + '\n';
      }
    }
  }

  var instrucao = [
    '\n---',
    'Escreva um diagnóstico direto, sem markdown, sem títulos com hashtag, sem listas com traço.',
    'Use parágrafos separados por linha em branco. Tom direto de gestor de tráfego sênior que está',
    'olhando para esses números agora. Inclua: o que está funcionando e por quê; o que está com',
    'problema e qual a causa provável; o que fazer concretamente nos próximos 7 dias campanha por campanha.',
    'Se o contexto de abril/sazonalidade for relevante, mencione. Máximo 700 palavras. Em português.'
  ].join('\n');

  return ctx + metaTxt + crmTxt + instrucao;
}

function _callClaudeApiDiag_(key, prompt, maxTokens) {
  var url     = 'https://api.anthropic.com/v1/messages';
  var bodyObj = {
    model: 'claude-sonnet-4-6',
    max_tokens: parseInt(maxTokens, 10) > 0 ? parseInt(maxTokens, 10) : 1500,
    messages: [{ role: 'user', content: prompt }]
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(bodyObj),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  var json = JSON.parse(resp.getContentText());

  if (code !== 200) {
    var errMsg = json && json.error ? json.error.message : 'HTTP ' + code;
    throw new Error('Claude API: ' + errMsg);
  }
  if (!json.content || !json.content[0] || !json.content[0].text) {
    throw new Error('Claude API retornou resposta inesperada.');
  }

  return json.content[0].text;
}


// ═══════════════════════════════════════════════════════════════════════════
// RELATÓRIO DIÁRIO DO DIAGNÓSTICO ADS
// Snapshot rolling de 7 dias gravado todo dia às 07h em "Diagnostico Ads Diario"
// ═══════════════════════════════════════════════════════════════════════════

var ABA_RELATORIO_ADS = 'Diagnostico Ads Diario';

/**
 * Entrypoint do trigger diário e da chamada manual no editor.
 * Reusa o pipeline do botão Diagnosticar (Meta + CRM) e gera um resumo curto
 * (~500 chars) via Claude API, persistindo na aba "Diagnostico Ads Diario".
 */
function gerarRelatorioDiarioAds() {
  try {
    var props     = PropertiesService.getScriptProperties();
    var token     = props.getProperty('META_ACCESS_TOKEN');
    var claudeKey = props.getProperty('CLAUDE_API_KEY');
    if (!token)     throw new Error('META_ACCESS_TOKEN não configurado.');
    if (!claudeKey) throw new Error('CLAUDE_API_KEY não configurada.');

    var insights  = _fetchMetaInsightsParaDiag_(token);
    var leadsData = _fetchLeadsCrmParaDiag_();
    var prompt    = _buildDiagnosisPromptResumo_(insights, leadsData);
    var resumo    = _callClaudeApiDiag_(claudeKey, prompt, 350);
    var agg       = _calcularAgregadosDiarios_(insights, leadsData);

    var tz   = Session.getScriptTimeZone();
    var hoje = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    _gravarRelatorioDiarioAds_(hoje, agg, resumo, insights.campanhas || []);
    Logger.log('gerarRelatorioDiarioAds ok — ' + hoje);
    return { ok: true, data: hoje };
  } catch (e) {
    Logger.log('gerarRelatorioDiarioAds erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}


/**
 * Variante curta do _buildDiagnosisPrompt_: pede um parágrafo único de até
 * ~500 caracteres em português, sem markdown.
 */
function _buildDiagnosisPromptResumo_(insights, leadsData) {
  var ctx = [
    'Você é Claude Ads, gestor de tráfego sênior da Mobile Digital (revenda Vero Internet em Juiz de Fora/MG).',
    '',
    'CONTEXTO:',
    '- Ticket médio: R$313/venda. CPA máximo: R$120. CPA meta: R$80.',
    '- CPL máximo: R$30. CTR mínimo: 0,5%. Frequência máxima: 4,0×.',
    '- Abril é mês estruturalmente fraco — sazonalidade.',
    '- Cite SOMENTE as campanhas listadas em META abaixo. Não mencione campanhas ausentes dos dados (podem estar pausadas).',
    ''
  ].join('\n');

  var metaTxt = 'META (últimos 7 dias — ' + insights.desde + ' a ' + insights.ate + '):\n';
  var camps   = (insights.campanhas || []).filter(function(c) { return parseFloat(c.gasto || 0) > 0; });
  if (camps.length === 0) {
    metaTxt += '(sem campanhas ativas no período)\n';
  } else {
    for (var i = 0; i < camps.length; i++) {
      var c = camps[i];
      metaTxt += c.campaign_name + ': R$' + c.gasto.toFixed(2) +
                 ' | ' + c.leads + ' leads | CPL ' +
                 (c.cpl !== null ? 'R$' + c.cpl.toFixed(2) : 'N/A') +
                 ' | CTR ' + c.ctr.toFixed(2) + '% | freq ' + c.freq.toFixed(1) + 'x\n';
    }
  }

  var crmTxt = '\nCRM (acumulado por campanha):\n';
  var pCamp  = leadsData.por_campanha || {};
  var keys   = Object.keys(pCamp);
  if (keys.length === 0) {
    crmTxt += '(sem leads registrados)\n';
  } else {
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j], d = pCamp[k];
      var taxa = d.total > 0 ? ((d.convertidos / d.total) * 100).toFixed(1) : '0';
      crmTxt += k + ': ' + d.total + ' leads, ' + d.convertidos + ' conv (' + taxa + '%), ' +
                d.desqualificados + ' desq, ' + d.pendentes + ' pend\n';
    }
  }

  var instrucao = [
    '\n---',
    'Escreva UM parágrafo único, em português, MÁXIMO 500 CARACTERES,',
    'sem markdown, sem hashtags, sem listas. Foque em: estado atual,',
    'principal alavanca de melhoria e alerta urgente (se houver).'
  ].join('\n');

  return ctx + metaTxt + crmTxt + instrucao;
}


/**
 * Helper puro: agrega totais sobre insights.campanhas + leadsData.por_campanha.
 * Sem I/O — fácil de testar.
 */
function _calcularAgregadosDiarios_(insights, leadsData) {
  var camps = (insights && insights.campanhas) || [];
  var gasto = 0, leadsMeta = 0, impr = 0, cliques = 0;
  var ctrPond = 0, cpmPond = 0;

  for (var i = 0; i < camps.length; i++) {
    var c = camps[i];
    gasto     += parseFloat(c.gasto     || 0);
    leadsMeta += parseFloat(c.leads     || 0);
    impr      += parseInt  (c.impressoes|| 0, 10);
    cliques   += parseInt  (c.cliques   || 0, 10);
    ctrPond   += parseFloat(c.ctr || 0) * parseInt(c.impressoes || 0, 10);
    cpmPond   += parseFloat(c.cpm || 0) * parseInt(c.impressoes || 0, 10);
  }

  var ctrMedio = impr > 0 ? ctrPond / impr : 0;
  var cpmMedio = impr > 0 ? cpmPond / impr : 0;
  var cplMedio = leadsMeta > 0 ? gasto / leadsMeta : 0;

  var pCamp = (leadsData && leadsData.por_campanha) || {};
  var leadsCrm = 0, conv = 0;
  Object.keys(pCamp).forEach(function(k) {
    leadsCrm += parseInt(pCamp[k].total       || 0, 10);
    conv     += parseInt(pCamp[k].convertidos || 0, 10);
  });

  var cpaReal       = conv > 0 ? gasto / conv : 0;
  var taxaConversao = leadsCrm > 0 ? conv / leadsCrm : 0;

  return {
    gasto_7d:        gasto,
    leads_meta_7d:   leadsMeta,
    leads_crm_total: leadsCrm,
    cpl_medio:       cplMedio,
    ctr_medio:       ctrMedio,
    cpm_medio:       cpmMedio,
    impressoes_7d:   impr,
    cliques_7d:      cliques,
    conversoes_crm:  conv,
    cpa_real:        cpaReal,
    taxa_conversao:  taxaConversao
  };
}


/**
 * Persiste a linha do dia em "Diagnostico Ads Diario".
 * Idempotente: se já existir linha com data == dataHoje, atualiza em vez de duplicar.
 * Cria a aba com cabeçalhos na primeira execução.
 */
function _gravarRelatorioDiarioAds_(dataHoje, agg, resumo, campanhas) {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(ABA_RELATORIO_ADS);
  if (!aba) {
    aba = ss.insertSheet(ABA_RELATORIO_ADS);
    aba.getRange(1, 1, 1, 15).setValues([[
      'data', 'gasto_7d', 'leads_meta_7d', 'leads_crm_total', 'cpl_medio',
      'ctr_medio', 'cpm_medio', 'impressoes_7d', 'cliques_7d', 'conversoes_crm',
      'cpa_real', 'taxa_conversao', 'resumo_curto', 'campanhas_json', 'gerado_em'
    ]]);
    aba.getRange(1, 1, 1, 15).setFontWeight('bold');
    aba.setFrozenRows(1);
  }

  var resumoTrunc = String(resumo || '').substring(0, 500);
  var campJson    = JSON.stringify(campanhas || []);
  var geradoEm    = new Date().toISOString();

  var linha = [
    dataHoje,
    agg.gasto_7d, agg.leads_meta_7d, agg.leads_crm_total, agg.cpl_medio,
    agg.ctr_medio, agg.cpm_medio, agg.impressoes_7d, agg.cliques_7d, agg.conversoes_crm,
    agg.cpa_real, agg.taxa_conversao, resumoTrunc, campJson, geradoEm
  ];

  var ult = aba.getLastRow();
  if (ult >= 2) {
    var datas = aba.getRange(2, 1, ult - 1, 1).getValues();
    for (var i = 0; i < datas.length; i++) {
      var existente = datas[i][0];
      var asStr;
      if (existente instanceof Date) {
        asStr = Utilities.formatDate(existente, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        asStr = String(existente || '').trim();
      }
      if (asStr === dataHoje) {
        aba.getRange(i + 2, 1, 1, 15).setValues([linha]);
        return;
      }
    }
  }
  aba.appendRow(linha);
}


/**
 * Lê as últimas N linhas da aba "Diagnostico Ads Diario" e retorna como JSON
 * para o Dashboard. Padrão idêntico a getIndicacoes().
 */
function getRelatorioAdsHistorico(dias) {
  try {
    var n = parseInt(dias, 10);
    if (!n || n < 1) n = 30;
    if (n > 365) n = 365;

    var ss  = _getSpreadsheet_();
    var aba = ss.getSheetByName(ABA_RELATORIO_ADS);
    if (!aba || aba.getLastRow() < 2) return { ok: true, rows: [] };

    var ult   = aba.getLastRow();
    var total = ult - 1;
    var take  = Math.min(total, n);
    var raw   = aba.getRange(ult - take + 1, 1, take, 15).getValues();

    var tz = Session.getScriptTimeZone();
    var rows = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r[0]) continue;
      var dataStr;
      if (r[0] instanceof Date) {
        dataStr = Utilities.formatDate(r[0], tz, 'yyyy-MM-dd');
      } else {
        dataStr = String(r[0]).trim();
      }
      rows.push({
        data:            dataStr,
        gasto_7d:        parseFloat(r[1])  || 0,
        leads_meta_7d:   parseFloat(r[2])  || 0,
        leads_crm_total: parseFloat(r[3])  || 0,
        cpl_medio:       parseFloat(r[4])  || 0,
        ctr_medio:       parseFloat(r[5])  || 0,
        cpm_medio:       parseFloat(r[6])  || 0,
        impressoes_7d:   parseInt  (r[7], 10) || 0,
        cliques_7d:      parseInt  (r[8], 10) || 0,
        conversoes_crm:  parseInt  (r[9], 10) || 0,
        cpa_real:        parseFloat(r[10]) || 0,
        taxa_conversao:  parseFloat(r[11]) || 0,
        resumo_curto:    String(r[12] || ''),
        gerado_em:       String(r[14] || '')
      });
    }
    return { ok: true, rows: rows };
  } catch (e) {
    Logger.log('getRelatorioAdsHistorico erro: ' + e.message);
    return { ok: false, erro: e.message, rows: [] };
  }
}


/**
 * Setup manual do trigger diário (07h00). Rodar uma vez no editor Apps Script.
 * Espelha configurarTriggerWarmup() em Code.js.
 */
function configurarTriggerRelatorioDiarioAds() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'gerarRelatorioDiarioAds') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('gerarRelatorioDiarioAds')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .create();
  Logger.log('Trigger diário criado: gerarRelatorioDiarioAds @ 07h');
}

function removerTriggerRelatorioDiarioAds() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'gerarRelatorioDiarioAds') {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  Logger.log('Triggers removidos: ' + n);
}


// ════════════════════════════════════════════════════════════════════════════
//  RECONCILIAÇÃO VENDAS ↔ LEADS META ADS (Fase 3 — direção única Vendas → Leads)
//  Trigger: venda META ADS vira status 2/3 → marca lead "Converteu" (hook no
//  salvarVenda). Cron noturno cruza os dois lados e lista inconsistências.
//  NUNCA cria venda a partir do lead (vendedor cadastra manualmente).
// ════════════════════════════════════════════════════════════════════════════

var ABA_RECONCILIACAO_META = 'Reconciliação Pendente';

/** Aba de inconsistências; cria com cabeçalho na primeira vez. */
function _getAbaReconciliacaoMeta_() {
  var ss  = _getSpreadsheet_();
  var aba = ss.getSheetByName(ABA_RECONCILIACAO_META);
  if (!aba) {
    aba = ss.insertSheet(ABA_RECONCILIACAO_META);
    aba.getRange(1, 1, 1, 4).setValues([['detectado_em', 'tipo', 'descricao', 'resolvido']]);
    aba.getRange(1, 1, 1, 4).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

/** Append de uma inconsistência (fire-and-forget). */
function _logReconciliacaoMeta_(tipo, descricao) {
  try {
    _getAbaReconciliacaoMeta_().appendRow([new Date(), tipo, descricao, '']);
  } catch (e) {
    Logger.log('_logReconciliacaoMeta_ falhou: ' + e.message);
  }
}

/** Normaliza telefone BR para os últimos 11 dígitos (sem DDI). '' se < 8 dígitos. */
function _normTel11_(s) {
  var t = String(s || '').replace(/\D/g, '');
  if (t.length > 11) t = t.slice(-11);
  return t.length >= 8 ? t : '';
}

/**
 * Hook pós-save do salvarVenda (Code.js). Se a venda na linha for META ADS,
 * marca o lead correspondente como "Converteu" (Vendas → Leads). Sem match,
 * registra em "Reconciliação Pendente". Não lança — não bloqueia o save.
 * @param {number} linha  Linha da venda em "1 - Vendas"
 */
function _reconciliarVendaMetaAdsAposSave_(linha) {
  try {
    var c = CONFIG.COLUNAS;
    var sheet = _getSheet();
    var row = sheet.getRange(linha, 1, 1, c.TEL + 1).getValues()[0];
    var canal = String(row[c.CANAL] || '').trim().toUpperCase();
    if (canal !== 'META ADS') return;

    var telefone = String(row[c.WHATS] || '').trim() || String(row[c.TEL] || '').trim();
    var contrato = String(row[c.CONTRATO] || '').trim();
    var dataVenda = row[c.DATA_ATIV] || new Date();

    var res = vincularVendaLeadMetaAds(telefone, contrato, dataVenda);
    if (res === null) { // null = nenhum lead com esse telefone (0 = existe, já finalizado)
      _logReconciliacaoMeta_('venda_sem_lead',
        'Venda META ADS (linha ' + linha + ', ' + String(row[c.CLIENTE] || '') +
        ', contrato ' + (contrato || '-') + ', tel ' + (telefone || '-') +
        ') sem lead correspondente em Leads Meta Ads.');
    }
  } catch (e) {
    Logger.log('_reconciliarVendaMetaAdsAposSave_ falhou: ' + e.message);
  }
}

/**
 * Cron diário (23h): cruza vendas META ADS em status 2/3 com leads "Converteu".
 * (1) Vendas sem lead refletido → tenta vincular; se falhar, registra. (2) Leads
 * "Converteu" sem venda META ADS correspondente → registra. Reescreve a aba
 * "Reconciliação Pendente" com o retrato atual. Alvo do trigger noturno.
 */
function reconciliarMetaAdsNoturno() {
  try {
    var c = CONFIG.COLUNAS;
    var sheet = _getSheet();
    var ultV = sheet.getLastRow();
    var ss = _getSpreadsheet_();
    var abaLeads = ss.getSheetByName(CFG_META.ABA_LEADS_META);

    // Vendas META ADS em status 2/3, indexadas por telefone normalizado.
    var vendasMetaTel = {};
    if (ultV >= 2) {
      var vrows = sheet.getRange(2, 1, ultV - 1, c.TEL + 1).getValues();
      for (var i = 0; i < vrows.length; i++) {
        if (String(vrows[i][c.CANAL] || '').trim().toUpperCase() !== 'META ADS') continue;
        var st = String(vrows[i][c.STATUS] || '').trim();
        if (st !== '2- Aguardando Instalação' && st !== '3 - Finalizada/Instalada') continue;
        var tel = _normTel11_(String(vrows[i][c.WHATS] || '') || String(vrows[i][c.TEL] || ''));
        if (tel) vendasMetaTel[tel] = {
          linha:     i + 2,
          cliente:   String(vrows[i][c.CLIENTE]  || ''),
          contrato:  String(vrows[i][c.CONTRATO] || ''),
          dataVenda: vrows[i][c.DATA_ATIV]
        };
      }
    }

    // Leads "venda-fechada" (compat: também aceita "Converteu" legado pré-migração),
    // indexados por telefone normalizado.
    var leadsConvTel = {};
    if (abaLeads && abaLeads.getLastRow() >= 2) {
      var lrows = abaLeads.getRange(2, 1, abaLeads.getLastRow() - 1, 12).getValues();
      for (var j = 0; j < lrows.length; j++) {
        var st = String(lrows[j][8] || '').trim().toLowerCase();
        if (st !== 'venda-fechada' && st !== 'converteu') continue;
        var ltel = _normTel11_(String(lrows[j][2] || ''));
        if (ltel) leadsConvTel[ltel] = j + 2;
      }
    }

    var inconsist = [];

    // (1) Venda META 2/3 sem lead venda-fechada → tenta vincular (catch-up); senão registra.
    Object.keys(vendasMetaTel).forEach(function(tel) {
      if (leadsConvTel[tel]) return;
      var v = vendasMetaTel[tel];
      var linkado = vincularVendaLeadMetaAds(tel, v.contrato, v.dataVenda);
      if (linkado === null) { // null = miss real; 0 = lead existe mas já finalizado
        inconsist.push(['venda_sem_lead',
          'Venda META ADS L' + v.linha + ' (' + v.cliente + ', contrato ' + (v.contrato || '-') +
          ', tel ' + tel + ') sem lead correspondente.']);
      }
    });

    // (2) Lead "venda-fechada" sem venda META ADS em status 2/3.
    Object.keys(leadsConvTel).forEach(function(tel) {
      if (!vendasMetaTel[tel]) {
        inconsist.push(['lead_sem_venda',
          'Lead "venda-fechada" (linha ' + leadsConvTel[tel] + ', tel ' + tel +
          ') sem venda META ADS em status 2/3.']);
      }
    });

    // Reescreve a aba com o retrato atual (limpa as linhas anteriores).
    var abaR = _getAbaReconciliacaoMeta_();
    if (abaR.getLastRow() > 1) abaR.getRange(2, 1, abaR.getLastRow() - 1, 4).clearContent();
    if (inconsist.length) {
      var agora = new Date();
      var out = inconsist.map(function(it) { return [agora, it[0], it[1], '']; });
      abaR.getRange(2, 1, out.length, 4).setValues(out);
    }
    Logger.log('reconciliarMetaAdsNoturno: ' + inconsist.length + ' inconsistência(s).');
    return { ok: true, inconsistencias: inconsist.length };
  } catch (e) {
    Logger.log('reconciliarMetaAdsNoturno erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

/** Instala o trigger noturno (23h). Rodar UMA VEZ no editor. Idempotente. */
function configurarTriggerReconciliacaoMetaAds() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'reconciliarMetaAdsNoturno') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('reconciliarMetaAdsNoturno')
    .timeBased()
    .atHour(23)
    .everyDays(1)
    .create();
  Logger.log('Trigger diário criado: reconciliarMetaAdsNoturno @ 23h');
}

function removerTriggerReconciliacaoMetaAds() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'reconciliarMetaAdsNoturno') {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  Logger.log('Triggers removidos: ' + n);
}

// ════════════════════════════════════════════════════════════════════════════
//  RECONCILIADOR PAINEL ADS (Meta Insights) ↔ aba CRM "Leads Meta Ads"
//  Explica a divergência de CONTAGEM entre os leads que a Meta reporta (o número
//  do Painel Ads) e os leads na aba CRM (o número do Dashboard). São métricas
//  diferentes por design: a Meta conta conversões atribuídas (com lag), o CRM
//  conta linhas registradas (webhook automático + cadastros manuais).
//
//  A Meta só expõe CONTAGEM agregada por campanha (não o telefone de cada lead),
//  então o cruzamento é por contagem, não linha-a-linha. As 4 categorias:
//   • lead_manual_legitimo           — lead manual atribuído a uma campanha Meta
//                                       real (operador registrou à mão um lead que
//                                       o webhook não pegou). Surplus CRM esperado.
//   • lead_manual_sem_conversao_meta — lead manual Orgânico/Indicação (fora da
//                                       Meta). Surplus CRM que não vem de anúncio.
//   • webhook_sem_conversao_meta     — leads webhook além do que a Meta reportou
//                                       (lag de atribuição; normal dentro de 72h).
//   • conversao_meta_sem_lead_crm    — conversões Meta sem lead webhook no CRM
//                                       (webhook pode ter falhado, ou atribuição
//                                       atrasada — toleramos até 72h).
//  É só DIAGNÓSTICO (não muta dados). Alvo do banner da página Leads Meta Ads.
// ════════════════════════════════════════════════════════════════════════════

var JANELA_RECONC_META_H = 72; // tolerância de atribuição da Meta

/** ISO 'yyyy-MM-dd' menos N dias, no fuso dado. */
function _isoMenosDias_(iso, n, tz) {
  var p = String(iso).split('-');
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  d.setDate(d.getDate() - n);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

/**
 * Conta leads reportados pela Meta numa janela [since, until] (inclusive),
 * agregando as contas (mesma lógica de leads do Painel Ads: por campanha,
 * 'lead' OU messaging conversation). Retorna número, ou null se não há token
 * ou todas as contas falharam (banner degrada sem alarme falso).
 */
function _contarLeadsMetaApiJanela_(sinceISO, untilISO) {
  var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN');
  if (!token) return null;
  var contas = _getContasMetaAds_();
  var total = 0, algumOk = false;
  for (var i = 0; i < contas.length; i++) {
    try {
      var json = _metaApiGet_('/' + contas[i] + '/insights', {
        fields: 'actions',
        time_range: { since: sinceISO, until: untilISO },
        level: 'campaign',
        limit: 200
      });
      (json.data || []).forEach(function(row) {
        var la = (row.actions || []).filter(function(a) {
          return a.action_type === 'lead' ||
                 a.action_type === 'onsite_conversion.messaging_conversation_started_7d';
        });
        if (la.length > 0) total += parseFloat(la[0].value || 0);
      });
      algumOk = true;
    } catch (e) { Logger.log('_contarLeadsMetaApiJanela_ ' + contas[i] + ': ' + e.message); }
  }
  return algumOk ? Math.round(total) : null;
}

/** True se a campanha é a sentinela orgânica/indicação (não-Meta). */
function _campanhaOrganicaMeta_(camp) {
  return /org[aâ]nico|indica/i.test(String(camp || ''));
}

/**
 * Conta leads do CRM numa janela [since, until] (por data_entrada, col A),
 * quebrando por origem (col O). 'renata' conta como auto-rastreado (webhook).
 * Leads manuais ainda se separam em campanha-Meta vs orgânico/indicação.
 * @returns {{total,webhook,manual,manual_campanha,manual_organico}}
 */
function _contarLeadsCrmPorOrigemJanela_(sinceISO, untilISO, tz) {
  var z = { total: 0, webhook: 0, manual: 0, manual_campanha: 0, manual_organico: 0 };
  var aba = _getSpreadsheet_().getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba || aba.getLastRow() < 2) return z;
  var raw = aba.getRange(2, 1, aba.getLastRow() - 1, 15).getValues();
  for (var i = 0; i < raw.length; i++) {
    var r = raw[i];
    if (!r[0]) continue;
    var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(d.getTime())) continue;
    var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    if (key < sinceISO || key > untilISO) continue;
    z.total++;
    var origem = String(r[14] || '').trim().toLowerCase() || 'webhook';
    if (origem === 'manual') {
      z.manual++;
      if (_campanhaOrganicaMeta_(r[5])) z.manual_organico++;
      else z.manual_campanha++;
    } else {
      z.webhook++; // webhook ou renata (auto-rastreado)
    }
  }
  return z;
}

/**
 * Diagnóstico do dia cruzando Painel Ads (Meta) ↔ aba CRM. Cache 600s.
 * Exportado p/ google.script.run (banner da página Leads Meta Ads).
 * @param {string} [diaISO] 'yyyy-MM-dd'; default = hoje (America/Sao_Paulo).
 */
function getDiagnosticoReconciliacaoMeta(diaISO) {
  try {
    var tz = 'America/Sao_Paulo';
    var hoje = diaISO || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

    var cache = CacheService.getScriptCache();
    var ck = 'meta:reconc:' + hoje;
    var hit = cache.get(ck);
    if (hit) { try { return JSON.parse(hit); } catch (e) {} }

    var metaDia = _contarLeadsMetaApiJanela_(hoje, hoje); // null se sem token
    var crmDia  = _contarLeadsCrmPorOrigemJanela_(hoje, hoje, tz);

    var temMeta = (metaDia !== null);
    var cat = {
      lead_manual_legitimo:           crmDia.manual_campanha,
      lead_manual_sem_conversao_meta: crmDia.manual_organico,
      webhook_sem_conversao_meta:     temMeta ? Math.max(0, crmDia.webhook - metaDia) : null,
      conversao_meta_sem_lead_crm:    temMeta ? Math.max(0, metaDia - crmDia.webhook) : null
    };

    // Severidade: gap Meta→CRM no dia é normal (lag de atribuição). Só vira
    // 'aviso' se o gap PERSISTE na janela de 72h — aí é provável falha de webhook.
    var severidade = 'ok';
    if (temMeta && cat.conversao_meta_sem_lead_crm > 0) {
      var since72 = _isoMenosDias_(hoje, Math.floor(JANELA_RECONC_META_H / 24), tz);
      var meta72  = _contarLeadsMetaApiJanela_(since72, hoje);
      var crm72   = _contarLeadsCrmPorOrigemJanela_(since72, hoje, tz);
      var gap72   = (meta72 === null) ? 0 : Math.max(0, meta72 - crm72.webhook);
      if (gap72 > 0) severidade = 'aviso';
    }

    var divergencia = temMeta ? (crmDia.total - metaDia) : null;

    // Resumo curto p/ o banner.
    var resumo;
    if (!temMeta) {
      resumo = 'CRM hoje: ' + crmDia.total + ' lead(s) (' + crmDia.webhook +
        ' webhook + ' + crmDia.manual + ' manual). Meta indisponível (sem token) — comparação só com o CRM.';
    } else {
      var partes = [];
      if (cat.conversao_meta_sem_lead_crm > 0) {
        partes.push(cat.conversao_meta_sem_lead_crm + ' conversão(ões) Meta sem lead no CRM' +
          (severidade === 'aviso' ? ' (>72h — verificar webhook)' : ' (dentro das 72h de atribuição)'));
      }
      if (cat.webhook_sem_conversao_meta > 0) {
        partes.push(cat.webhook_sem_conversao_meta + ' webhook ainda não atribuído pela Meta');
      }
      if (cat.lead_manual_legitimo > 0)           partes.push(cat.lead_manual_legitimo + ' manual de campanha');
      if (cat.lead_manual_sem_conversao_meta > 0) partes.push(cat.lead_manual_sem_conversao_meta + ' manual orgânico/indicação');
      var diffTxt = divergencia === 0 ? 'igual' : (divergencia > 0 ? '+' + divergencia + ' no CRM' : divergencia + ' no CRM');
      resumo = 'Painel Ads ' + metaDia + ' · CRM ' + crmDia.total + ' (' + diffTxt + ')' +
        (partes.length ? ' — ' + partes.join('; ') + '.' : ' — sem divergência a explicar.');
    }

    var out = {
      ok: true,
      dia: hoje,
      meta_leads: metaDia,
      crm_total: crmDia.total,
      crm_webhook: crmDia.webhook,
      crm_manual: crmDia.manual,
      divergencia: divergencia,
      categorias: cat,
      janela_tolerancia_h: JANELA_RECONC_META_H,
      severidade: severidade,
      resumo: resumo,
      gerado_em: new Date().toISOString()
    };
    cache.put(ck, JSON.stringify(out), 600); // 10 min
    return out;
  } catch (e) {
    Logger.log('getDiagnosticoReconciliacaoMeta erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  ALERTA TRÁFEGO PAGO (spec 04 — disparo-grupo)
//  Snapshot diário consolidado da conta Meta Ads + leads/vendas CRM.
//  Consumido pelo workflow n8n (schedule 8h/14h/20h) que envia DM pro Ricardo.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Wrapper genérico sobre Meta Graph API. Levanta exceção em erro.
 * @param {string} path - ex: '/act_xxx/insights' ou '/act_xxx/adsets'
 * @param {object} params - query params (será serializado)
 * @returns {object} JSON parsed
 */
function _metaApiGet_(path, params) {
  var token = PropertiesService.getScriptProperties().getProperty('META_ACCESS_TOKEN');
  if (!token) throw new Error('META_ACCESS_TOKEN ausente em Script Properties');
  var p = Object.assign({ access_token: token }, params || {});
  var qs = Object.keys(p).map(function(k) {
    var v = p[k];
    if (typeof v === 'object') v = JSON.stringify(v);
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }).join('&');
  var url = 'https://graph.facebook.com/' + CFG_META.API_VERSION + path + '?' + qs;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var json = JSON.parse(resp.getContentText());
  if (json.error) {
    throw new Error('Meta API: ' + json.error.message + ' (code ' + json.error.code + ')');
  }
  return json;
}

/**
 * Soma daily_budget de todos os ad sets ATIVOS da conta.
 * Meta retorna daily_budget em CENTAVOS — dividir por 100.
 * @returns {number} Total em reais
 */
function _somarBudgetAdSetsAtivos_(accountId) {
  var json = _metaApiGet_('/' + (accountId || CFG_META.AD_ACCOUNT_ID) + '/adsets', {
    fields: 'daily_budget,status,effective_status',
    limit: 200
  });
  var data = json.data || [];
  var total = 0;
  for (var i = 0; i < data.length; i++) {
    var a = data[i];
    if (a.status === 'ACTIVE' && a.effective_status === 'ACTIVE' && a.daily_budget) {
      total += parseFloat(a.daily_budget) / 100;
    }
  }
  return total;
}

/**
 * Lista nomes de campanhas ATIVAS da conta.
 * @param {string} [accountId]  conta (default: primária)
 * @returns {string[]}
 */
function _listarCampanhasAtivas_(accountId) {
  var json = _metaApiGet_('/' + (accountId || CFG_META.AD_ACCOUNT_ID) + '/campaigns', {
    fields: 'name,status,effective_status',
    limit: 100
  });
  var data = json.data || [];
  return data
    .filter(function(c) { return c.status === 'ACTIVE' && c.effective_status === 'ACTIVE'; })
    .map(function(c) { return c.name; });
}

/**
 * Mapa campaign_id → effective_status de TODAS as campanhas da conta.
 * Usado pelo Painel Ads pra distinguir campanha ativa de pausada — o endpoint
 * de insights não retorna status. Defensivo: retorna {} em qualquer falha pra
 * não derrubar o painel inteiro (campanhas ficam sem marca de pausada).
 * @returns {Object<string,string>}
 */
/**
 * Lista de contas Meta lidas/agregadas pelos painéis. Fallback p/ conta primária.
 * @returns {string[]}
 */
function _getContasMetaAds_() {
  var ids = CFG_META.AD_ACCOUNT_IDS;
  return (ids && ids.length) ? ids.slice() : [CFG_META.AD_ACCOUNT_ID];
}

/** Nome curto da conta p/ exibição (ex: 'Vero 02'); fallback ao próprio id. */
function _nomeContaMeta_(accountId) {
  return (CFG_META.AD_ACCOUNT_NOMES && CFG_META.AD_ACCOUNT_NOMES[accountId]) || accountId;
}

/**
 * Alertas operacionais a partir da aba "Leads Meta Ads" (lado CRM).
 * Hoje: leads sem triagem (sem status_final) há mais de 24h.
 * @returns {string[]}
 */
function _alertasOperacionaisLeads_() {
  try {
    var ss  = _getSpreadsheet_();
    var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META);
    if (!aba) return [];
    var ult = aba.getLastRow();
    if (ult < 2) return [];
    var raw = aba.getRange(2, 1, ult - 1, 12).getValues();
    var agora = new Date();
    var parados = 0;
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      if (!r[0]) continue;
      if (String(r[8] || '').trim()) continue;  // col I: já tem status_final
      var dt = r[0] instanceof Date ? r[0] : new Date(r[0]);
      if (!dt || isNaN(dt.getTime())) continue;
      if ((agora - dt) / 36e5 >= 24) parados++;
    }
    var out = [];
    if (parados > 0) {
      out.push(parados + ' lead' + (parados > 1 ? 's' : '') + ' sem triagem há +24h — atualize o status em Leads Meta Ads.');
    }
    return out;
  } catch (e) {
    Logger.log('_alertasOperacionaisLeads_ falhou: ' + e.message);
    return [];
  }
}

function _mapaStatusCampanhas_(accountId) {
  try {
    var json = _metaApiGet_('/' + (accountId || CFG_META.AD_ACCOUNT_ID) + '/campaigns', {
      fields: 'id,effective_status',
      limit: 200
    });
    var data = json.data || [];
    var mapa = {};
    for (var i = 0; i < data.length; i++) {
      if (data[i].id) mapa[data[i].id] = data[i].effective_status || '';
    }
    return mapa;
  } catch (e) {
    Logger.log('_mapaStatusCampanhas_ falhou: ' + e.message);
    return {};
  }
}

/**
 * Conta leads e vendas convertidas hoje a partir da aba "Leads Meta Ads".
 * - leads_hoje: linhas onde data_entrada (col A) é hoje em America/Sao_Paulo
 * - vendas_hoje: linhas onde status_final (col I) === 'Converteu' E
 *                data_status (col K) é hoje
 * @returns {{leads_hoje:number, vendas_hoje:number}}
 */
function _contarLeadsEVendasHoje_() {
  var aba = _getSpreadsheet_().getSheetByName(CFG_META.ABA_LEADS_META);
  if (!aba) return { leads_hoje: 0, vendas_hoje: 0 };
  var ultRow = aba.getLastRow();
  if (ultRow < 2) return { leads_hoje: 0, vendas_hoje: 0 };
  // A=data_entrada, I=status_final, K=data_status (cols 1, 9, 11)
  var rows = aba.getRange(2, 1, ultRow - 1, 11).getValues();
  var tz = 'America/Sao_Paulo';
  var hojeKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var leads = 0;
  var vendas = 0;
  for (var i = 0; i < rows.length; i++) {
    var dataEntrada = rows[i][0];
    var statusFinal = String(rows[i][8] || '').trim();
    var dataStatus  = rows[i][10];

    if (dataEntrada instanceof Date) {
      if (Utilities.formatDate(dataEntrada, tz, 'yyyy-MM-dd') === hojeKey) leads++;
    }
    if (statusFinal === 'Converteu' && dataStatus instanceof Date) {
      if (Utilities.formatDate(dataStatus, tz, 'yyyy-MM-dd') === hojeKey) vendas++;
    }
  }
  return { leads_hoje: leads, vendas_hoje: vendas };
}

/**
 * Snapshot consolidado do tráfego pago do DIA ATUAL (timezone America/Sao_Paulo).
 *
 * Consome:
 *  - Meta Insights API: spend/impressions/reach/clicks/ctr/cpc/cpm (level=account)
 *  - Meta Ad Sets API:  soma daily_budget dos ad sets ativos
 *  - Meta Campaigns API: nomes de campanhas ativas
 *  - Aba CRM "Leads Meta Ads": leads e vendas convertidas hoje
 *
 * @returns {object} shape definido em spec 04 (ver disparo-grupo/specs/04_alerta_trafego_pago.md)
 */
function getResumoTrafegoHoje() {
  var tz = 'America/Sao_Paulo';
  var agora = new Date();
  var hojeISO = Utilities.formatDate(agora, tz, 'yyyy-MM-dd');
  var contas = _getContasMetaAds_();

  // 1. Insights consolidados (level=account, hoje) — agregado das contas.
  //    CTR/CPC recalculados sobre os totais; reach somado (overcount leve entre
  //    contas, aceitável p/ alerta diário).
  var spend = 0, impr = 0, reach = 0, cliques = 0, previsto = 0;
  var campanhasAtivas = [];
  for (var ci = 0; ci < contas.length; ci++) {
    var conta = contas[ci];
    try {
      var insightsJson = _metaApiGet_('/' + conta + '/insights', {
        fields: 'spend,impressions,reach,clicks',
        time_range: { since: hojeISO, until: hojeISO },
        level: 'account',
        limit: 1
      });
      var ins = (insightsJson.data && insightsJson.data[0]) || {};
      spend   += parseFloat(ins.spend || 0);
      impr    += parseInt(ins.impressions || 0, 10);
      reach   += parseInt(ins.reach || 0, 10);
      cliques += parseInt(ins.clicks || 0, 10);
    } catch (e) { Logger.log('resumo insights ' + conta + ': ' + e.message); }

    // 2. Previsto = soma de daily_budget dos ad sets ativos (por conta).
    try { previsto += _somarBudgetAdSetsAtivos_(conta); }
    catch (e) { Logger.log('_somarBudgetAdSetsAtivos_ ' + conta + ': ' + e.message); }

    // 4. Campanhas ativas (nomes) — junta das contas.
    try {
      _listarCampanhasAtivas_(conta).forEach(function(nm) { campanhasAtivas.push(nm); });
    } catch (e) { Logger.log('_listarCampanhasAtivas_ ' + conta + ': ' + e.message); }
  }
  var ctr = impr > 0 ? (cliques / impr) * 100 : 0;
  var cpc = cliques > 0 ? spend / cliques : 0;

  // 3. Leads e vendas hoje (CRM — independe de conta).
  var lv = _contarLeadsEVendasHoje_();

  return {
    ok: true,
    snapshot_em: Utilities.formatDate(agora, tz, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    investimento: {
      gasto_hoje:   spend,
      previsto_dia: previsto
    },
    entrega: {
      impressoes: impr,
      alcance:    reach,
      cliques:    cliques,
      ctr_pct:    ctr,
      cpc:        cpc
    },
    resultado: {
      leads_hoje: lv.leads_hoje,
      cpl:        lv.leads_hoje > 0 ? (spend / lv.leads_hoje) : 0
    },
    vendas: {
      convertidas_hoje: lv.vendas_hoje
    },
    meta: {
      campanhas_ativas: campanhasAtivas,
      contas:           contas.map(function(c) { return _nomeContaMeta_(c); }),
      fonte_leads:      'Leads Meta Ads (CRM)',
      fonte_metricas:   'Meta Insights API ' + CFG_META.API_VERSION
    }
  };
}

/**
 * Dispara o resumo de tráfego (alerta 7) AGORA no WhatsApp do Ricardo (DM),
 * sob demanda — mesmo conteúdo do alerta automático (8/14/20h), via Flow 1
 * do disparo-grupo. Rodar no editor ou usar como gatilho manual.
 * @returns {{ok:boolean, mensagem:string}}
 */
function enviarResumoTrafegoAgora() {
  var r = getResumoTrafegoHoje();
  var inv = r.investimento || {}, ent = r.entrega || {}, res = r.resultado || {},
      ven = r.vendas || {}, meta = r.meta || {};

  function brl(n) { return 'R$ ' + Number(n || 0).toFixed(2).replace('.', ','); }
  function num(n) { return String(Math.round(Number(n || 0))); }
  function pct(n) { return Number(n || 0).toFixed(2).replace('.', ',') + '%'; }

  var campanhas = (meta.campanhas_ativas || []).map(function(nm) {
    nm = String(nm || '');
    return nm.length > 45 ? nm.slice(0, 45) + '…' : nm;
  });

  var hora = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM HH:mm');
  var msg = '📊 *Tráfego Pago — Resumo* (' + hora + ')\n' +
    '💰 Gasto hoje: ' + brl(inv.gasto_hoje) +
      (inv.previsto_dia > 0 ? ' / previsto ' + brl(inv.previsto_dia) : '') + '\n' +
    '👁 Impr: ' + num(ent.impressoes) + ' · Alcance: ' + num(ent.alcance) +
      ' · Cliques: ' + num(ent.cliques) + '\n' +
    '📈 CTR: ' + pct(ent.ctr_pct) + ' · CPC: ' + brl(ent.cpc) + '\n' +
    '🎯 Leads hoje: ' + num(res.leads_hoje) + ' · CPL: ' + brl(res.cpl) + '\n' +
    '✅ Vendas hoje: ' + num(ven.convertidas_hoje) + '\n' +
    '📣 Campanhas ativas (' + campanhas.length + '): ' + (campanhas.join(' · ') || '—') + '\n' +
    '🏦 Contas: ' + ((meta.contas || []).join(' + ') || '—');

  var ok = enviarParaGrupoWhatsApp(msg, 'ricardo');
  Logger.log('enviarResumoTrafegoAgora: ' + (ok ? 'ENVIADO' : 'FALHOU') + '\n' + msg);
  return { ok: ok, mensagem: msg };
}

/**
 * Smoke test — roda no editor pra ver o resumo no Logger.
 */
function _smokeResumoTrafego() {
  try {
    var r = getResumoTrafegoHoje();
    Logger.log('=== Resumo Tráfego Hoje ===');
    Logger.log('Gasto: R$ ' + r.investimento.gasto_hoje.toFixed(2) + ' / Previsto: R$ ' + r.investimento.previsto_dia.toFixed(2));
    Logger.log('Impr: ' + r.entrega.impressoes + ' · Alcance: ' + r.entrega.alcance + ' · Cliques: ' + r.entrega.cliques);
    Logger.log('CTR: ' + r.entrega.ctr_pct.toFixed(2) + '% · CPC: R$ ' + r.entrega.cpc.toFixed(2));
    Logger.log('Leads: ' + r.resultado.leads_hoje + ' · CPL: R$ ' + r.resultado.cpl.toFixed(2));
    Logger.log('Vendas hoje: ' + r.vendas.convertidas_hoje);
    Logger.log('Campanhas ativas (' + r.meta.campanhas_ativas.length + '): ' + r.meta.campanhas_ativas.join(' · '));
  } catch (e) {
    Logger.log('ERRO: ' + e.message);
  }
}
