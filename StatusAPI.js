// dharmapro-crm | StatusAPI.js | 08/07/2026
// Backend do painel "Status dos Serviços" (downdetector) da página Configurações.
//
// getStatusServicos(forcar) → { ok, gerado_em, duracao_ms, servicos: [...] }
// Retorna SÓ o grupo "global" (infra checável do servidor via UrlFetchApp).
// O grupo "estação" (VPN / NG / Adapter / PinG / Extensão Chrome) é resolvido
// no frontend via a extensão Chrome (reusa _healthSendMsg em JS.html) — esses
// serviços ficam atrás da VPN da Vero e são inalcançáveis dos servidores do Google.
//
// IMPORTANTE: cada probe é try/catch individual — um host totalmente fora NÃO
// pode derrubar o painel inteiro (é justamente o que queremos detectar). Por isso
// NÃO usamos UrlFetchApp.fetchAll (que lança pro batch todo em falha de conexão).
//
// Reusa constantes/chaves já existentes no projeto:
//   _getTabela() / CONFIG.TABELA_JSON_FILE_ID   (Code.js)
//   CFG_DISPAROS.SUPABASE_URL / SUPABASE_SERVICE_ROLE (DisparosAPI.js)
//   CFG_META.AD_ACCOUNT_IDS / _metaApiGet_ / META_ACCESS_TOKEN (MetaAdsAPI.js)
//   CLAUDE_API_KEY (MetaAdsAPI.js)
//   CFG_ALERTAS_OP.N8N_BASE_URL / N8N_API_KEY (AlertasOpAPI.js)
//   CFG_WA_PESSOAL.* / _waSheet_ / _waLerLinhas_ / _waColIdx_ / _evolutionConfig_ (DispPessoalAPI.js)

var CFG_STATUS = {
  CACHE_KEY: 'crm_v3_status_servicos_v1',
  CACHE_TTL: 60,                                   // 60s — alinhado ao auto-refresh do frontend
  CHATWOOT_DEFAULT: 'https://app.chatwoot.com',    // sobrescreve via Script Property CHATWOOT_BASE_URL
  VEROHUB_HOST: 'https://hub.veronet.com.br/',
  CLAUDE_MODEL_PING: 'claude-haiku-4-5-20251001'   // ping mais barato possível (max_tokens:1)
};

// ── PROBES HTTP genéricos ────────────────────────────────────────────────────────
// Retornam { ok:true, code, text } quando o host respondeu (mesmo 4xx/5xx),
// ou { ok:false, erro } quando nem conectou (DNS/refused/timeout).
function _statusGet_(url, headers) {
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers || {},
      muteHttpExceptions: true,
      followRedirects: true
    });
    return { ok: true, code: resp.getResponseCode(), text: resp.getContentText() };
  } catch (e) {
    return { ok: false, erro: String(e && e.message || e) };
  }
}

function _statusPost_(url, headers, payload) {
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers || {},
      payload: payload,
      muteHttpExceptions: true
    });
    return { ok: true, code: resp.getResponseCode(), text: resp.getContentText() };
  } catch (e) {
    return { ok: false, erro: String(e && e.message || e) };
  }
}

function _st_(id, nome, status, detalhe, extra) {
  return { id: id, nome: nome, grupo: 'global', status: status, detalhe: detalhe || '', extra: extra || null };
}

// Formata número BR (JID/owner/phone_display) para "+55 32 99153-4154".
function _statusFmtFone_(raw) {
  var d = String(raw || '').replace(/@.*$/, '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length > 11 && d.slice(0, 2) === '55') d = d.slice(2); // tira DDI
  if (d.length < 10) return '+55 ' + d;                        // fallback defensivo
  var ddd = d.slice(0, 2), rest = d.slice(2), meio, fim;
  if (rest.length >= 9) { meio = rest.slice(0, 5); fim = rest.slice(5, 9); }
  else { meio = rest.slice(0, 4); fim = rest.slice(4, 8); }
  return '+55 ' + ddd + ' ' + meio + '-' + fim;
}

// Resolve o número (owner) de uma instância Evolution conectada via fetchInstances.
// Usado quando o phone_display do sheet está vazio (chip conectado mas nunca carimbado).
function _statusEvoOwner_(evoUrl, evoKey, inst) {
  try {
    var r = _statusGet_(evoUrl + '/instance/fetchInstances?instanceName=' + encodeURIComponent(inst), { 'apikey': evoKey });
    if (!r.ok || r.code < 200 || r.code >= 300) return '';
    var j = JSON.parse(r.text);
    var arr = Array.isArray(j) ? j : [j];
    for (var i = 0; i < arr.length; i++) {
      var o = arr[i] || {};
      var owner = (o.instance && (o.instance.owner || o.instance.wuid)) || o.owner || o.wuid || '';
      if (owner) return _statusFmtFone_(owner);
    }
  } catch (e) {}
  return '';
}

// ── FUNÇÃO PÚBLICA ───────────────────────────────────────────────────────────────
/**
 * Status dos serviços de infra (grupo global). Cache 60s; forcar=true ignora.
 * Nunca lança — cada serviço é probeado isoladamente.
 */
function getStatusServicos(forcar) {
  var cache = CacheService.getScriptCache();
  if (!forcar) {
    try {
      var hit = cache.get(CFG_STATUS.CACHE_KEY);
      if (hit) return JSON.parse(hit);
    } catch (e) {}
  }

  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var servicos = [];

  // ---- Supabase (base da Renata + WABA) ----
  var supabaseUp = false;
  var sbKey = props.getProperty('SUPABASE_SERVICE_ROLE');
  (function () {
    if (!sbKey) { servicos.push(_st_('supabase', 'Supabase', 'unknown', 'SUPABASE_SERVICE_ROLE não configurado')); return; }
    var r = _statusGet_(CFG_DISPAROS.SUPABASE_URL + '/v_metricas_gerais?select=total_conversas&limit=1',
      { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey });
    if (!r.ok) { servicos.push(_st_('supabase', 'Supabase', 'down', 'Sem resposta — ' + r.erro)); return; }
    if (r.code >= 200 && r.code < 300) { supabaseUp = true; servicos.push(_st_('supabase', 'Supabase', 'ok', 'Views respondendo (HTTP ' + r.code + ')')); }
    else if (r.code === 401 || r.code === 403) servicos.push(_st_('supabase', 'Supabase', 'down', 'Chave rejeitada (HTTP ' + r.code + ')'));
    else servicos.push(_st_('supabase', 'Supabase', 'warn', 'HTTP ' + r.code));
  })();

  // ---- n8n (REST) — usado também pela Renata ----
  var n8nHostUp = false;
  var n8nWorkflows = [];
  (function () {
    var n8nKey = props.getProperty('N8N_API_KEY');
    if (!n8nKey) { servicos.push(_st_('n8n', 'n8n', 'unknown', 'N8N_API_KEY não configurado (_setN8nApiKey)')); return; }
    var r = _statusGet_(CFG_ALERTAS_OP.N8N_BASE_URL + '/workflows?active=true', { 'X-N8N-API-KEY': n8nKey });
    if (!r.ok) { servicos.push(_st_('n8n', 'n8n', 'down', 'Sem resposta — ' + r.erro)); return; }
    n8nHostUp = true; // conectou (qualquer HTTP) → host no ar
    if (r.code >= 200 && r.code < 300) {
      try { n8nWorkflows = (JSON.parse(r.text).data) || []; } catch (e) { n8nWorkflows = []; }
      servicos.push(_st_('n8n', 'n8n', 'ok', n8nWorkflows.length + ' workflows ativos'));
    } else if (r.code === 401 || r.code === 403) {
      servicos.push(_st_('n8n', 'n8n', 'down', 'API key rejeitada (HTTP ' + r.code + ')'));
    } else {
      servicos.push(_st_('n8n', 'n8n', 'warn', 'HTTP ' + r.code));
    }
  })();

  // ---- Renata IA (composta: n8n workflow Renata ativo + Supabase respondendo) ----
  (function () {
    if (!supabaseUp && !n8nHostUp) { servicos.push(_st_('renata', 'Renata IA', 'down', 'n8n e Supabase fora')); return; }
    if (!supabaseUp) { servicos.push(_st_('renata', 'Renata IA', 'warn', 'Supabase (base da Renata) sem resposta')); return; }
    if (!n8nHostUp) { servicos.push(_st_('renata', 'Renata IA', 'warn', 'n8n (workflows da Renata) sem resposta')); return; }
    var renata = n8nWorkflows.filter(function (w) { return /renata/i.test(String(w && w.name || '')) && w.active; });
    if (renata.length) servicos.push(_st_('renata', 'Renata IA', 'ok', renata.length + ' workflow(s) Renata ativo(s)'));
    else servicos.push(_st_('renata', 'Renata IA', 'warn', 'Nenhum workflow "Renata" ativo no n8n'));
  })();

  // ---- WABA / WhatsApp oficial (qualidade + risco de suspensão) ----
  (function () {
    if (!sbKey) { servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'unknown', 'Supabase não configurado')); return; }
    var r = _statusGet_(CFG_DISPAROS.SUPABASE_URL + '/v_waba_health_current?select=current_quality&limit=1',
      { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey });
    if (!r.ok) { servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'down', 'Sem resposta — ' + r.erro)); return; }
    if (r.code < 200 || r.code >= 300) { servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'warn', 'HTTP ' + r.code)); return; }
    var q = '';
    try { var arr = JSON.parse(r.text); q = String((arr[0] && arr[0].current_quality) || '').toUpperCase(); } catch (e) {}
    if (q === 'GREEN') servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'ok', 'Qualidade GREEN'));
    else if (q === 'YELLOW') servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'warn', 'Qualidade YELLOW — atenção'));
    else if (q === 'RED') servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'down', 'Qualidade RED — risco de suspensão'));
    else servicos.push(_st_('waba', 'WhatsApp Oficial (WABA)', 'unknown', 'Qualidade indisponível' + (q ? ' (' + q + ')' : '')));
  })();

  // ---- Meta Ads (faturamento/status das contas de anúncio) ----
  (function () {
    var metaToken = props.getProperty('META_ACCESS_TOKEN');
    if (!metaToken) { servicos.push(_st_('metaads', 'Meta Ads (faturamento)', 'unknown', 'META_ACCESS_TOKEN não configurado')); return; }
    var contas = (typeof CFG_META !== 'undefined' && CFG_META.AD_ACCOUNT_IDS) || [];
    contas.forEach(function (acc, i) {
      var nome = 'Meta Ads';
      try {
        var j = _metaApiGet_('/' + acc, { fields: 'account_status,disable_reason,name' });
        if (j && j.name) nome = 'Meta Ads · ' + j.name;
        var s = _statusContaMeta_(j);
        servicos.push(_st_('metaads_' + i, nome, s.status, s.detalhe, { conta: acc }));
      } catch (e) {
        servicos.push(_st_('metaads_' + i, nome + ' (' + acc + ')', 'down', 'Erro ao consultar — ' + String(e && e.message || e), { conta: acc }));
      }
    });
  })();

  // ---- Claude API (créditos/faturamento da chave) ----
  (function () {
    var key = props.getProperty('CLAUDE_API_KEY');
    if (!key) { servicos.push(_st_('claude', 'Claude API', 'unknown', 'CLAUDE_API_KEY não configurada')); return; }
    var r = _statusPost_('https://api.anthropic.com/v1/messages',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      JSON.stringify({ model: CFG_STATUS.CLAUDE_MODEL_PING, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }));
    if (!r.ok) { servicos.push(_st_('claude', 'Claude API', 'down', 'Sem resposta — ' + r.erro)); return; }
    if (r.code === 200) servicos.push(_st_('claude', 'Claude API', 'ok', 'Respondendo (HTTP 200)'));
    else if (r.code === 429) servicos.push(_st_('claude', 'Claude API', 'warn', 'HTTP 429 — limite/sem créditos'));
    else if (r.code === 402) servicos.push(_st_('claude', 'Claude API', 'down', 'HTTP 402 — faturamento pendente'));
    else if (r.code === 401 || r.code === 403) servicos.push(_st_('claude', 'Claude API', 'down', 'HTTP ' + r.code + ' — chave inválida'));
    else servicos.push(_st_('claude', 'Claude API', 'warn', 'HTTP ' + r.code));
  })();

  // ---- WA Campanha (números Evolution conectados) + reachability do host Evolution ----
  var evoHostUp = false;
  (function () {
    var evoUrl = props.getProperty('EVOLUTION_API_URL');
    var evoKey = props.getProperty('EVOLUTION_API_KEY');
    if (!evoUrl || !evoKey) { servicos.push(_st_('wacampanha', 'WA Campanha (chips)', 'unknown', 'Evolution API não configurada')); return; }
    evoUrl = evoUrl.replace(/\/+$/, '');

    // reachability do host (pro card VPS)
    var reach = _statusGet_(evoUrl, { 'apikey': evoKey });
    evoHostUp = reach.ok;

    // lista de instâncias cadastradas
    var instancias = [];
    try {
      var sh = _waSheet_(CFG_WA_PESSOAL.ABA_INSTANCIAS);
      var d = _waLerLinhas_(sh);
      var idxInst = _waColIdx_(d.header, 'instance_id');
      var idxAlias = _waColIdx_(d.header, 'alias');
      var idxFone = _waColIdx_(d.header, 'phone_display');
      d.linhas.forEach(function (row) {
        var inst = idxInst >= 0 ? String(row[idxInst] || '').trim() : '';
        if (inst) instancias.push({
          instance: inst,
          alias: idxAlias >= 0 ? String(row[idxAlias] || '').trim() : '',
          foneRaw: idxFone >= 0 ? String(row[idxFone] || '').trim() : ''
        });
      });
    } catch (e) {
      servicos.push(_st_('wacampanha', 'WA Campanha (chips)', 'warn', 'Aba WA Instâncias indisponível — ' + String(e && e.message || e)));
      return;
    }

    if (!instancias.length) { servicos.push(_st_('wacampanha', 'WA Campanha (chips)', 'unknown', 'Nenhum chip cadastrado')); return; }

    var conectados = 0, total = instancias.length, nomes = [];
    instancias.forEach(function (it) {
      var r = _statusGet_(evoUrl + '/instance/connectionState/' + encodeURIComponent(it.instance), { 'apikey': evoKey });
      var state = '';
      if (r.ok && r.code >= 200 && r.code < 300) {
        try { var j = JSON.parse(r.text); state = String((j.instance && j.instance.state) || j.state || '').toLowerCase(); } catch (e) {}
      }
      if (r.ok) evoHostUp = true; // conectou ao host
      if (state === 'open') {
        conectados++;
        var fone = it.foneRaw ? _statusFmtFone_(it.foneRaw) : _statusEvoOwner_(evoUrl, evoKey, it.instance);
        nomes.push((it.alias || it.instance) + ' ✓' + (fone ? ' ' + fone : ''));
      } else {
        nomes.push((it.alias || it.instance) + ' ✗');
      }
    });

    var det = conectados + '/' + total + ' conectados · ' + nomes.join(' · ');
    if (conectados === total) servicos.push(_st_('wacampanha', 'WA Campanha (chips)', 'ok', det));
    else if (conectados > 0) servicos.push(_st_('wacampanha', 'WA Campanha (chips)', 'warn', det));
    else servicos.push(_st_('wacampanha', 'WA Campanha (chips)', 'down', det));
  })();

  // ---- Alertas Operacionais (chip que dispara alertas de grupo + notificações PAP) ----
  // Instância Evolution Ricardo_Andrade (= PAP_EVOLUTION_INSTANCE, ParceirosAPI.js).
  // Se cair, os alertas de grupo (disparo-grupo Flow 1) e as notificações PAP param em silêncio.
  (function () {
    var evoUrl = props.getProperty('EVOLUTION_API_URL');
    var evoKey = props.getProperty('EVOLUTION_API_KEY');
    var inst = (typeof PAP_EVOLUTION_INSTANCE !== 'undefined' && PAP_EVOLUTION_INSTANCE) ? PAP_EVOLUTION_INSTANCE : 'Ricardo_Andrade';
    if (!evoUrl || !evoKey) { servicos.push(_st_('alertasop', 'Alertas Operacionais', 'unknown', 'Evolution API não configurada')); return; }
    evoUrl = evoUrl.replace(/\/+$/, '');

    var r = _statusGet_(evoUrl + '/instance/connectionState/' + encodeURIComponent(inst), { 'apikey': evoKey });
    if (!r.ok) { servicos.push(_st_('alertasop', 'Alertas Operacionais', 'down', 'Evolution inacessível — chip ' + inst)); return; }

    var state = '';
    if (r.code >= 200 && r.code < 300) {
      try { var j = JSON.parse(r.text); state = String((j.instance && j.instance.state) || j.state || '').toLowerCase(); } catch (e) {}
    }
    if (state === 'open') {
      var fone = _statusEvoOwner_(evoUrl, evoKey, inst);
      servicos.push(_st_('alertasop', 'Alertas Operacionais', 'ok', 'Conectado' + (fone ? ' · ' + fone : '') + ' · chip ' + inst));
    } else {
      servicos.push(_st_('alertasop', 'Alertas Operacionais', 'down',
        'Desconectado (' + (state || 'sem estado') + ') — alertas de grupo/PAP não saem · chip ' + inst));
    }
  })();

  // ---- Tabela de Ofertas (última atualização) ----
  (function () {
    try {
      var rows = _getTabela();
      var metaStr = String((rows && rows[0] && rows[0][0]) || '').trim();
      var mtime = null;
      try { mtime = DriveApp.getFileById(CONFIG.TABELA_JSON_FILE_ID).getLastUpdated(); } catch (e) {}
      var staleDias = (typeof STATUS_OFERTAS_STALE_DIAS !== 'undefined') ? STATUS_OFERTAS_STALE_DIAS : 30;
      var detalhe = metaStr || 'Tabela carregada';
      var status = 'ok';
      if (mtime) {
        var dias = Math.floor((Date.now() - mtime.getTime()) / 86400000);
        detalhe = (metaStr || 'Atualizada') + ' · Drive há ' + dias + 'd';
        if (dias > staleDias) status = 'warn';
      }
      servicos.push(_st_('ofertas', 'Tabela de Ofertas', status, detalhe));
    } catch (e) {
      servicos.push(_st_('ofertas', 'Tabela de Ofertas', 'down', 'Erro ao ler JSON — ' + String(e && e.message || e)));
    }
  })();

  // ---- Chatwoot (reachability) ----
  (function () {
    var cwUrl = props.getProperty('CHATWOOT_BASE_URL') || CFG_STATUS.CHATWOOT_DEFAULT;
    var r = _statusGet_(cwUrl, {});
    if (!r.ok) { servicos.push(_st_('chatwoot', 'Chatwoot', 'down', 'Fora — ' + r.erro)); return; }
    if (r.code < 500) servicos.push(_st_('chatwoot', 'Chatwoot', 'ok', 'Plataforma no ar (HTTP ' + r.code + ')'));
    else servicos.push(_st_('chatwoot', 'Chatwoot', 'down', 'HTTP ' + r.code));
  })();

  // ---- VeroHub (reachability do host; sessão do operador é grupo "estação") ----
  (function () {
    var r = _statusGet_(CFG_STATUS.VEROHUB_HOST, {});
    if (!r.ok) { servicos.push(_st_('verohub', 'VeroHub (host)', 'down', 'Fora — ' + r.erro)); return; }
    if (r.code < 500) servicos.push(_st_('verohub', 'VeroHub (host)', 'ok', 'Host no ar (HTTP ' + r.code + ') · sessão do operador na aba Estação'));
    else servicos.push(_st_('verohub', 'VeroHub (host)', 'down', 'HTTP ' + r.code));
  })();

  // ---- VPS (Vultr) — derivado da reachability de evolution.* + n8n.* ----
  (function () {
    var up = (evoHostUp ? 1 : 0) + (n8nHostUp ? 1 : 0);
    if (up === 2) servicos.push(_st_('vps', 'Servidor VPS (Vultr)', 'ok', 'Hosts no ar (evolution + n8n)'));
    else if (up === 1) servicos.push(_st_('vps', 'Servidor VPS (Vultr)', 'warn', (evoHostUp ? 'evolution' : 'n8n') + ' no ar; o outro sem resposta'));
    else servicos.push(_st_('vps', 'Servidor VPS (Vultr)', 'down', 'evolution.* e n8n.* sem resposta — VPS pode estar fora'));
  })();

  var out = { ok: true, gerado_em: new Date().toISOString(), duracao_ms: Date.now() - t0, servicos: servicos };
  try { cache.put(CFG_STATUS.CACHE_KEY, JSON.stringify(out), CFG_STATUS.CACHE_TTL); } catch (e) {}
  return out;
}

// Mapeia account_status da Meta (conta de anúncio) → status do card.
// 1 ACTIVE · 2 DISABLED · 3 UNSETTLED · 7 PENDING_RISK_REVIEW · 8 PENDING_SETTLEMENT
// 9 IN_GRACE_PERIOD · 100 PENDING_CLOSURE · 101 CLOSED
function _statusContaMeta_(j) {
  var s = j && typeof j.account_status !== 'undefined' ? Number(j.account_status) : -1;
  var motivo = j && j.disable_reason ? ' · motivo: ' + j.disable_reason : '';
  switch (s) {
    case 1:   return { status: 'ok',   detalhe: 'Ativa' };
    case 9:   return { status: 'warn', detalhe: 'Período de carência (pagamento)' + motivo };
    case 8:   return { status: 'warn', detalhe: 'Acerto de pagamento pendente' + motivo };
    case 7:   return { status: 'warn', detalhe: 'Em revisão de risco' + motivo };
    case 3:   return { status: 'down', detalhe: 'Pagamento pendente (unsettled)' + motivo };
    case 2:   return { status: 'down', detalhe: 'Conta desativada' + motivo };
    case 100: return { status: 'down', detalhe: 'Fechamento pendente' + motivo };
    case 101: return { status: 'down', detalhe: 'Conta fechada' + motivo };
    default:  return { status: 'warn', detalhe: 'Status ' + s + motivo };
  }
}
