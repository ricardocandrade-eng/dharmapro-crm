// dharmapro-crm | ReengajamentoWABAAPI.js | 28/05/2026
// Backend GAS — Módulo "Reengajamento WABA" (aba sob menu Tráfego)
//
// Funções públicas (chamadas via google.script.run pelo ReengajamentoWABA.html):
//   - listarReengajamentoWaba(filtros)
//   - marcarTentativaReengajamento(contactId, kind)
//   - getOpcoesFiltrosReengajamento()
//
// Dependências:
//   - _sbFetch_/_sbHeaders_/_sbKey_ (DisparosAPI.js) — cliente Supabase REST.
//   - CONFIG.COLUNAS, CONFIG.SHEET_NAME, CONFIG.SPREADSHEET_ID (Code.js).
//   - View `vw_waba_reengagement` (já filtra janela > 24h em runtime).
//   - Tabela `waba_reengagement` (PATCH para marcar tentativa).
//
// Dispatchers usados pela UI (chamados separadamente do botão):
//   - criarCampanhaDisparo() em DisparosAPI.js   → template WABA via disparo-massa
//   - criarCampanha()        em DispPessoalAPI.js → outro número via wa-pessoal

var CFG_REWABA = {
  VIEW:        'vw_waba_reengagement',
  TABLE:       'waba_reengagement',
  CACHE_KEY:   'crm_v3_rewaba_indice_vendas',
  CACHE_TTL:   300,    // 5 min, alinhado com CONFIG.CACHE_TTL
  HARD_LIMIT:  2000,   // tampa da view (defesa; tela pagina em cima)
  SEM_VIA_LABEL: 'sem-viabilidade',  // slug da label Chatwoot — fonte da verdade
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Normalização BR igual à do módulo wa-pessoal (DispPessoalAPI._normalizePhoneBR_).
// Saída: "DDD + 8 dígitos" (10 caracteres) — chave de join entre Chatwoot e CRM.
function _rwNormPhone_(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.length >= 12 && d.substr(0, 2) === '55') d = d.substr(2);
  if (d.length === 11 && d.charAt(2) === '9')    d = d.substr(0, 2) + d.substr(3);
  return d;
}

// Constrói índice telefone → {status, cidade, produto, ...} a partir da aba "1 - Vendas".
// 1 leitura por TTL. Cliente com 2 linhas (combo Fibra+Móvel) → fica com a mais nova
// (último loop sobrescreve), o que casa com a UX de "estado mais recente do cliente".
function _rwBuildIndiceVendas_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CFG_REWABA.CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* cache corrompido — recomputa */ }
  }

  var sh = SpreadsheetApp
    .openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.SHEET_NAME);
  var ult = sh.getLastRow();
  if (ult < 3) return {};

  var c    = CONFIG.COLUNAS;
  var rng  = sh.getRange(3, 1, ult - 2, CONFIG.TOTAL_COLUNAS).getValues();
  var idx  = {};

  for (var i = 0; i < rng.length; i++) {
    var row     = rng[i];
    var whats   = _rwNormPhone_(row[c.WHATS]);
    var tel     = _rwNormPhone_(row[c.TEL]);
    if (!whats && !tel) continue;

    var info = {
      status_lead: String(row[c.STATUS]      || '').trim(),
      pre_status:  String(row[c.PRE_STATUS]  || '').trim(),
      cidade:      String(row[c.CIDADE]      || '').trim(),
      produto:     String(row[c.PRODUTO]     || '').trim(),
      plano:       String(row[c.PLANO]       || '').trim(),
      viabilidade: String(row[c.VIABILIDADE] || '').trim(),
      cliente:     String(row[c.CLIENTE]     || '').trim(),
      linha_sheet: 3 + i,
    };
    if (whats)               idx[whats] = info;
    if (tel && tel !== whats) idx[tel]   = info;
  }

  // Cache pode estourar 100KB — silencia falha (pior caso: recomputa toda chamada).
  try {
    cache.put(CFG_REWABA.CACHE_KEY, JSON.stringify(idx), CFG_REWABA.CACHE_TTL);
  } catch (e) { /* ignore */ }

  return idx;
}

// Mata o cache do índice (chamado quando uma venda muda — opcional, TTL 5min é tolerável).
function _rwLimparCacheIndice_() {
  try { CacheService.getScriptCache().remove(CFG_REWABA.CACHE_KEY); } catch (e) {}
}

// ── HTML SERVER ───────────────────────────────────────────────────────────────

function getReengajamentoWabaHtml() {
  return HtmlService.createHtmlOutputFromFile('ReengajamentoWABA').getContent();
}

// ── ENDPOINTS PÚBLICOS (google.script.run) ────────────────────────────────────

/**
 * Lista contatos com janela WABA fechada, joinando com a aba "1 - Vendas" do CRM
 * por telefone normalizado (DDD+8 dígitos).
 *
 * @param {Object} filtros
 *   - status_lead:    string[]   — só linhas cuja STATUS está aqui (vazio = qualquer)
 *   - cidade:         string[]   — multi-select
 *   - labels:         string[]   — any-match contra r.labels (Chatwoot)
 *   - horas_min:      number     — faixa mín (ex: 24)
 *   - horas_max:      number     — faixa máx (ex: 48). Omitir = sem teto
 *   - tentado:        'sim'|'nao'|'qualquer' — default 'nao'
 *   - incluir_sem_viabilidade: boolean — default false. Exclui contatos com label
 *                                         Chatwoot `sem-viabilidade` (regra do produto)
 *   - busca:          string     — match em name/phone/cliente/última msg (case-insensitive)
 *   - page:           number     — default 1
 *   - per_page:       number     — default 50
 *
 * @return {{ok, total, page, per_page, rows, atualizado_em}}
 */
function listarReengajamentoWaba(filtros) {
  filtros = filtros || {};
  var tentadoMode = filtros.tentado || 'nao';
  var excluirSemViab = (filtros.incluir_sem_viabilidade !== true);

  var rows = _sbFetch_(
    'GET',
    '/' + CFG_REWABA.VIEW +
    '?select=*' +
    '&order=last_inbound_at.desc' +
    '&limit=' + CFG_REWABA.HARD_LIMIT
  ) || [];

  var idx = _rwBuildIndiceVendas_();
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var r       = rows[i];
    var phoneN  = _rwNormPhone_(r.phone_e164);
    var venda   = idx[phoneN] || null;

    // — Filtro: sem viabilidade (default exclui) —
    // Fonte: label Chatwoot `sem-viabilidade`. Não usamos a coluna VIABILIDADE do CRM
    // porque muito contato Chatwoot ainda não virou venda (sem linha no CRM pra olhar).
    var labelsArr = Array.isArray(r.labels) ? r.labels : [];
    if (excluirSemViab && labelsArr.indexOf(CFG_REWABA.SEM_VIA_LABEL) !== -1) {
      continue;
    }

    // — Filtro: status_lead (se enviado) —
    if (filtros.status_lead && filtros.status_lead.length) {
      var sl = venda ? venda.status_lead : '';
      if (filtros.status_lead.indexOf(sl) === -1) continue;
    }

    // — Filtro: cidade —
    if (filtros.cidade && filtros.cidade.length) {
      var cid = venda ? venda.cidade : '';
      if (filtros.cidade.indexOf(cid) === -1) continue;
    }

    // — Filtro: labels Chatwoot (any-match) —
    if (filtros.labels && filtros.labels.length) {
      var match = false;
      for (var k = 0; k < filtros.labels.length; k++) {
        if (labelsArr.indexOf(filtros.labels[k]) !== -1) { match = true; break; }
      }
      if (!match) continue;
    }

    // — Filtro: faixa de horas —
    var h = Number(r.hours_since_inbound) || 0;
    if (filtros.horas_min != null && h < Number(filtros.horas_min)) continue;
    if (filtros.horas_max != null && h > Number(filtros.horas_max)) continue;

    // — Filtro: já tentado —
    if (tentadoMode === 'sim' && !r.already_attempted) continue;
    if (tentadoMode === 'nao' &&  r.already_attempted) continue;

    // — Filtro: busca livre —
    if (filtros.busca) {
      var q = String(filtros.busca).toLowerCase();
      var ultMsg = (Array.isArray(r.last_messages) && r.last_messages.length)
        ? r.last_messages[r.last_messages.length - 1] : {};
      var hay = ((r.name || '') + ' ' +
                 (r.phone_e164 || '') + ' ' +
                 (venda && venda.cliente || '') + ' ' +
                 (ultMsg.text || '')).toLowerCase();
      if (hay.indexOf(q) === -1) continue;
    }

    out.push({
      chatwoot_contact_id:      r.chatwoot_contact_id,
      chatwoot_conversation_id: r.chatwoot_conversation_id,
      phone:                    r.phone_e164,
      name:                     r.name || (venda && venda.cliente) || '',
      hours_since_inbound:      h,
      last_inbound_at:          r.last_inbound_at,
      labels_chatwoot:          labelsArr,
      last_messages:            Array.isArray(r.last_messages) ? r.last_messages : [],
      status_lead:              venda ? venda.status_lead : '',
      pre_status:               venda ? venda.pre_status  : '',
      cidade:                   venda ? venda.cidade      : '',
      produto:                  venda ? venda.produto     : '',
      plano:                    venda ? venda.plano       : '',
      tem_venda_crm:            !!venda,
      already_attempted:        !!r.already_attempted,
      last_attempt_at:          r.last_attempt_at,
      last_attempt_kind:        r.last_attempt_kind,
      last_attempt_by:          r.last_attempt_by,
    });
  }

  var page    = Number(filtros.page)     > 0 ? Number(filtros.page)     : 1;
  var perPage = Number(filtros.per_page) > 0 ? Number(filtros.per_page) : 50;
  var slice   = out.slice((page - 1) * perPage, page * perPage);

  return {
    ok:            true,
    total:         out.length,
    page:          page,
    per_page:      perPage,
    rows:          slice,
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * Marca uma tentativa de reengajamento. Chamado pelo frontend imediatamente
 * após sucesso de criarCampanhaDisparo() (WABA) ou criarCampanha() (wa-pessoal).
 *
 * @param {number} chatwoot_contact_id
 * @param {'template_waba'|'wa_pessoal'} kind
 * @return {{ok: true}}
 */
function marcarTentativaReengajamento(chatwoot_contact_id, kind) {
  if (!chatwoot_contact_id) throw new Error('chatwoot_contact_id obrigatório.');
  if (kind !== 'template_waba' && kind !== 'wa_pessoal') {
    throw new Error('kind inválido: use "template_waba" ou "wa_pessoal".');
  }

  var operador = '';
  try { operador = Session.getActiveUser().getEmail() || ''; } catch (e) {}

  _sbFetch_(
    'PATCH',
    '/' + CFG_REWABA.TABLE +
    '?chatwoot_contact_id=eq.' + encodeURIComponent(chatwoot_contact_id),
    {
      already_attempted: true,
      last_attempt_at:   new Date().toISOString(),
      last_attempt_kind: kind,
      last_attempt_by:   operador || 'desconhecido',
    }
  );

  return { ok: true };
}

/**
 * Bulk version — marca várias tentativas em uma única roundtrip ao Supabase.
 * Usa filtro IN. Para 50+ contatos é muito mais barato que N PATCHes.
 */
function marcarTentativaReengajamentoBulk(contactIds, kind) {
  if (!Array.isArray(contactIds) || !contactIds.length) {
    throw new Error('contactIds obrigatório (array não-vazio).');
  }
  if (kind !== 'template_waba' && kind !== 'wa_pessoal') {
    throw new Error('kind inválido: use "template_waba" ou "wa_pessoal".');
  }

  var operador = '';
  try { operador = Session.getActiveUser().getEmail() || ''; } catch (e) {}

  var ids = contactIds.map(function(x) { return Number(x); }).filter(Boolean);
  if (!ids.length) throw new Error('Nenhum ID válido em contactIds.');

  _sbFetch_(
    'PATCH',
    '/' + CFG_REWABA.TABLE +
    '?chatwoot_contact_id=in.(' + ids.join(',') + ')',
    {
      already_attempted: true,
      last_attempt_at:   new Date().toISOString(),
      last_attempt_kind: kind,
      last_attempt_by:   operador || 'desconhecido',
    }
  );

  return { ok: true, marcados: ids.length };
}

/**
 * Opções pros multi-selects da barra de filtros.
 * Labels vêm da própria view; cidades e status_lead vêm do índice de vendas.
 */
function getOpcoesFiltrosReengajamento() {
  var rowsLabels = _sbFetch_(
    'GET',
    '/' + CFG_REWABA.VIEW + '?select=labels&limit=' + CFG_REWABA.HARD_LIMIT
  ) || [];

  var labelsSet = {};
  for (var i = 0; i < rowsLabels.length; i++) {
    var ls = rowsLabels[i].labels;
    if (Array.isArray(ls)) {
      for (var j = 0; j < ls.length; j++) labelsSet[ls[j]] = true;
    }
  }

  var idx        = _rwBuildIndiceVendas_();
  var cidadesSet = {};
  var statusSet  = {};
  var keys = Object.keys(idx);
  for (var k = 0; k < keys.length; k++) {
    var info = idx[keys[k]];
    if (info.cidade)      cidadesSet[info.cidade]     = true;
    if (info.status_lead) statusSet[info.status_lead] = true;
  }

  return {
    labels:      Object.keys(labelsSet).sort(),
    cidades:     Object.keys(cidadesSet).sort(),
    status_lead: Object.keys(statusSet).sort(),
  };
}
