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

// ── REENGAJAMENTO AUTOMÁTICO (workflow n8n renata_reengajamento_auto) ─────────
// Endpoint consumido pelo workflow n8n que dispara `followup_24horas` em 2
// tentativas (25h e +3 dias) para leads pós-handoff sem venda + leads Meta Ads
// `sem-retorno`, excluindo `sem-viabilidade`. Histórico em waba_reengagement
// (PK chatwoot_contact_id) — `last_attempt_kind` é `reengaj_auto_1`/`_2`.

var CFG_REWABA_AUTO = {
  STATUS_REENGAJAR_META: ['sem-retorno'],   // status_final col I da aba "Leads Meta Ads"
  HORAS_MIN_1A_TENT:     25,                 // margem >24h da Meta
  DIAS_ENTRE_TENTATIVAS: 3,
  HARD_LIMIT:            50,                 // por execução (defesa de tier WABA)
  KIND_1:                'reengaj_auto_1',
  KIND_2:                'reengaj_auto_2',
  CACHE_KEY_META:        'crm_v3_rewaba_indice_meta',
  CACHE_KEY_PAP:         'crm_v3_rewaba_indice_pap',
  CACHE_TTL_INDICE:      600,                // 10min
  USER_TAG:              'n8n_workflow_reengajamento_auto',
};

// Índice de telefones de vendedores PAP (aba "3 - PAP" col U whatsapp).
// Usado como exclusão extra — nunca disparar template pra vendedor.
function _rwBuildIndicePAP_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CFG_REWABA_AUTO.CACHE_KEY_PAP);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* recomputa */ }
  }
  var ss = _getSpreadsheet_();
  var aba = ss.getSheetByName('3 - PAP');
  if (!aba) return {};
  var ult = aba.getLastRow();
  if (ult < 2) return {};
  // Col U = whatsapp do vendedor.
  var rng = aba.getRange(2, 21, ult - 1, 1).getValues();
  var idx = {};
  for (var i = 0; i < rng.length; i++) {
    var tel = _rwNormPhone_(rng[i][0]);
    if (tel) idx[tel] = true;
  }
  try { cache.put(CFG_REWABA_AUTO.CACHE_KEY_PAP, JSON.stringify(idx), CFG_REWABA_AUTO.CACHE_TTL_INDICE); }
  catch (e) { /* ignore */ }
  return idx;
}

// Índice telefone-normalizado → status_final da aba "Leads Meta Ads".
// Lê só linhas com status_final preenchido (defesa contra cache estourar).
function _rwBuildIndiceLeadsMeta_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CFG_REWABA_AUTO.CACHE_KEY_META);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* recomputa */ }
  }

  var ss = _getSpreadsheet_();
  var aba = ss.getSheetByName(CFG_META.ABA_LEADS_META); // 'Leads Meta Ads'
  if (!aba) return {};

  var ult = aba.getLastRow();
  if (ult < 2) return {};
  // Cols B (nome), C (telefone), I (status_final).
  var rng = aba.getRange(2, 2, ult - 1, 8).getValues(); // B..I (8 cols)
  var idx = {};
  for (var i = 0; i < rng.length; i++) {
    var tel = _rwNormPhone_(rng[i][1]);          // C
    var status = String(rng[i][7] || '').trim(); // I
    if (!tel || !status) continue;
    idx[tel] = { status_final: status, nome: String(rng[i][0] || '').trim() };
  }
  try { cache.put(CFG_REWABA_AUTO.CACHE_KEY_META, JSON.stringify(idx), CFG_REWABA_AUTO.CACHE_TTL_INDICE); }
  catch (e) { /* ignore */ }
  return idx;
}

/**
 * Lista candidatos elegíveis ao reengajamento automático.
 *
 * UNIVERSO RESTRITIVO (revisado 16/06/2026 após incidente — branch "pós-handoff
 * sem venda" removido por pegar PAP/colegas/números aleatórios indiscriminadamente):
 *   ÚNICA fonte de entrada = aba "Leads Meta Ads" com status_final='sem-retorno'.
 *   Telefone do candidato no Chatwoot precisa CASAR (após normalização) com lead
 *   nessa aba. Sem casamento → descarta.
 *
 * Filtros aplicados em camadas:
 *   1. exclusão por label Chatwoot `sem-viabilidade`
 *   2. exclusão por telefone presente em "3 - PAP" (vendedor)
 *   3. exclusão por telefone presente em "1 - Vendas" (já é cliente/lead em outro fluxo)
 *   4. cadência:
 *      - 1ª tentativa: !already_attempted && hours_since_inbound >= 25
 *      - 2ª tentativa: last_attempt_kind === 'reengaj_auto_1' && last_attempt_at <= now-3d
 *   5. casamento obrigatório com aba Leads Meta Ads + status_final='sem-retorno'
 *   6. hard limit 50 por execução
 *
 * Kill switch: Script Property `REENGAJAMENTO_AUTO_ATIVO` ('1' liga; ausente/'0' desliga).
 *
 * Kill switch: Script Property `REENGAJAMENTO_AUTO_ATIVO` ('1' liga; ausente/'0' desliga).
 *
 * @return {{ok, ativo, total, candidatos:[{chatwoot_contact_id, conversation_id,
 *           phone, name, nivel, plano, cidade, tentativa, contexto_template,
 *           ultima_msg_lead_at}]}}
 */
function listarCandidatosReengajamentoAuto() {
  var props = PropertiesService.getScriptProperties();
  var ativo = String(props.getProperty('REENGAJAMENTO_AUTO_ATIVO') || '0') === '1';
  if (!ativo) return { ok: true, ativo: false, total: 0, candidatos: [] };

  var rows = _sbFetch_(
    'GET',
    '/' + CFG_REWABA.VIEW +
    '?select=*' +
    '&order=last_inbound_at.desc' +
    '&limit=' + CFG_REWABA.HARD_LIMIT
  ) || [];

  var idxVendas = _rwBuildIndiceVendas_();
  var idxMeta   = _rwBuildIndiceLeadsMeta_();
  var idxPAP    = _rwBuildIndicePAP_();
  var nowMs     = Date.now();
  var limiarTent2Ms = nowMs - CFG_REWABA_AUTO.DIAS_ENTRE_TENTATIVAS * 86400000;

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (out.length >= CFG_REWABA_AUTO.HARD_LIMIT) break;
    var r = rows[i];

    // (1) Exclui sem-viabilidade.
    var labelsArr = Array.isArray(r.labels) ? r.labels : [];
    if (labelsArr.indexOf(CFG_REWABA.SEM_VIA_LABEL) !== -1) continue;

    var horas = Number(r.hours_since_inbound) || 0;
    if (horas < CFG_REWABA_AUTO.HORAS_MIN_1A_TENT) continue;

    // (2) Cadência: decide tentativa 1 ou 2 (ou descarta).
    var kindAtual = String(r.last_attempt_kind || '');
    var tentativa = 0;
    if (!r.already_attempted) {
      tentativa = 1;
    } else if (kindAtual === CFG_REWABA_AUTO.KIND_1) {
      var lastMs = r.last_attempt_at ? new Date(r.last_attempt_at).getTime() : 0;
      if (lastMs && lastMs <= limiarTent2Ms) tentativa = 2;
    }
    // Se já tentado por outro kind (template_waba/wa_pessoal/reengaj_auto_2): pula.
    if (!tentativa) continue;

    var phoneN = _rwNormPhone_(r.phone_e164);
    if (!phoneN) continue;

    // (3) Exclusões: vendedor PAP ou já cliente em "1 - Vendas".
    if (idxPAP[phoneN])    continue;
    if (idxVendas[phoneN]) continue;

    // (4) Universo ÚNICO: precisa ser sem-retorno Meta Ads.
    var meta = idxMeta[phoneN] || null;
    if (!meta) continue;
    if (CFG_REWABA_AUTO.STATUS_REENGAJAR_META.indexOf(meta.status_final) === -1) continue;

    // (5) Monta contexto_template (= {{2}} do followup_24horas).
    //     Sem venda no CRM por definição (acabou de ser excluído acima) — usa "internet" genérico.
    var ctxVar = 'internet';

    out.push({
      chatwoot_contact_id:      r.chatwoot_contact_id,
      chatwoot_conversation_id: r.chatwoot_conversation_id,
      phone:                    r.phone_e164,
      name:                     r.name || meta.nome || '',
      nivel:                    'lead-meta',
      plano:                    '',
      cidade:                   '',
      tentativa:                tentativa,
      contexto_template:        ctxVar,
      ultima_msg_lead_at:       r.last_inbound_at,
      horas_silencio:           Math.round(horas),
    });
  }

  return { ok: true, ativo: true, total: out.length, candidatos: out };
}

/**
 * Marca uma tentativa do workflow automático. Wrapper sobre o PATCH direto na
 * tabela waba_reengagement — kind é convencionado ('reengaj_auto_1' ou '_2'),
 * last_attempt_by fixo na tag do workflow.
 *
 * @param {number} chatwoot_contact_id
 * @param {1|2} tentativa
 * @return {{ok:true}}
 */
function marcarTentativaReengajamentoAuto(chatwoot_contact_id, tentativa) {
  if (!chatwoot_contact_id) throw new Error('chatwoot_contact_id obrigatório.');
  var t = Number(tentativa);
  if (t !== 1 && t !== 2) throw new Error('tentativa deve ser 1 ou 2.');
  var kind = (t === 1) ? CFG_REWABA_AUTO.KIND_1 : CFG_REWABA_AUTO.KIND_2;

  _sbFetch_(
    'PATCH',
    '/' + CFG_REWABA.TABLE +
    '?chatwoot_contact_id=eq.' + encodeURIComponent(chatwoot_contact_id),
    {
      already_attempted: true,
      last_attempt_at:   new Date().toISOString(),
      last_attempt_kind: kind,
      last_attempt_by:   CFG_REWABA_AUTO.USER_TAG,
    }
  );
  return { ok: true };
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
