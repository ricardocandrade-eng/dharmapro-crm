// ══════════════════════════════════════════════════════════════════════════════
//  ViabilidadeAPI — backend GAS do módulo Viabilidade (PinG)
//  Sprint 3. Spec: prompt-viabilidade-ping.v2.md §6, §7.
//
//  Públicas (google.script.run):
//    getViabilidadeHtml()                                    → string HTML
//    getViabilidadeConfig()                                  → { ok, ativo, extensionId, usuario }
//    getViabilidadeAddressCleanupBackend(textoCru, usuario)  → { ok, logradouro|motivo, ... }
//    salvarConsultaViabilidade(usuario, consulta)            → { ok, hash, linha }
//    getHistoricoViabilidadeUsuario(usuario, limite)         → { ok, lista }
//
//  Não chama o PinG diretamente — esse trabalho fica na extensão Chrome
//  (Sprint 2). O backend cuida só de HTML, cleanup de endereço via Claude,
//  feature flag, EXTENSION_ID, e persistência LGPD (hash de endereço).
// ══════════════════════════════════════════════════════════════════════════════

// ── Constantes ────────────────────────────────────────────────────────────────
var VIABILIDADE_ABA            = 'Consultas Viabilidade';
var VIABILIDADE_PROP_ATIVO     = 'VIABILIDADE_ATIVO';            // '1' = on; default '0'
var VIABILIDADE_PROP_EXT_ID    = 'VIABILIDADE_EXTENSION_ID';     // ID(s) da extensão Chrome (v2.2.0+)
                                                                  // Pode ser 1 ID OU vários separados por vírgula —
                                                                  // necessário porque extensões "unpacked" geram ID
                                                                  // por path local (diferente em cada máquina).
                                                                  // Ex.: "abcde...,bocahgafjihhbojfeeikafglbonpmdff"
var VIABILIDADE_MODEL_CLAUDE   = 'claude-haiku-4-5-20251001';
var VIABILIDADE_CLEANUP_TIMEOUT = 8000;
var VIABILIDADE_CLEANUP_MAX_HORA = 30;                           // throttle por usuario por hora

// ── 1. HTML serve ─────────────────────────────────────────────────────────────
function getViabilidadeHtml() {
  var ativo = PropertiesService.getScriptProperties().getProperty(VIABILIDADE_PROP_ATIVO) === '1';
  if (!ativo) {
    return '<div style="padding:40px;text-align:center;color:#8b95a8;font-family:monospace;font-size:14px">' +
      'Módulo Viabilidade desativado.<br><br>' +
      'Para ativar: rodar <code>_setViabilidadeAtivo(true)</code> no editor Apps Script ' +
      '(ou definir <code>VIABILIDADE_ATIVO=1</code> em Script Properties).' +
      '</div>';
  }
  return HtmlService.createHtmlOutputFromFile('Viabilidade').getContent();
}

// ── 2. Config (consumida pelo frontend no boot) ───────────────────────────────
function getViabilidadeConfig(usuario) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(VIABILIDADE_PROP_EXT_ID) || '';
  // Aceita 1 ID OU lista separada por vírgula/ponto-e-vírgula
  var ids = raw.split(/[,;\s]+/).map(function(s){ return s.trim(); }).filter(Boolean);
  return {
    ok:           true,
    ativo:        props.getProperty(VIABILIDADE_PROP_ATIVO) === '1',
    extensionId:  ids[0] || '',  // back-compat: callers antigos leem só o primeiro
    extensionIds: ids,           // lista completa pro health check (Via A tenta cada)
    usuario:      String(usuario || 'anon')
  };
}

// ── 3. Cleanup de endereço via Claude Haiku ──────────────────────────────────
function getViabilidadeAddressCleanupBackend(textoCru, usuario) {
  try {
    var texto = String(textoCru || '').trim();
    if (texto.length < 10) {
      return { ok: false, erro: 'INPUT_CURTO', motivo: 'Texto muito curto (mínimo 10 caracteres).' };
    }
    if (texto.length > 500) {
      return { ok: false, erro: 'INPUT_LONGO', motivo: 'Texto muito longo (máximo 500 caracteres).' };
    }

    // Throttle
    var quotaResp = _consumirCleanupQuota_(usuario || 'anon');
    if (!quotaResp.ok) return quotaResp;

    var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
    if (!apiKey) {
      return { ok: false, erro: 'CLAUDE_KEY_AUSENTE', motivo: 'CLAUDE_API_KEY não configurada no Script Properties.' };
    }

    var systemPrompt = [
      'Você é um normalizador de endereços brasileiros. Recebe um endereço em',
      'qualquer formato (incompleto, abreviado, com erros, com complemento ruidoso)',
      'e devolve APENAS um JSON no formato:',
      '',
      '  { "ok": true,  "logradouro": "Rua X, Bairro Y, Cidade Z — UF" }',
      '  { "ok": false, "motivo": "<por que não foi possível normalizar>" }',
      '',
      'Regras:',
      '- Não invente. Se faltar cidade/UF/bairro e não der pra deduzir COM CERTEZA, retorne ok:false.',
      '- Não inclua número, CEP, complemento, ponto de referência.',
      '- Use abreviações padrão: "Rua", "Avenida", "Travessa", "Estrada" (não "R.", não "Av.").',
      '- Cidade com acento correto.',
      '- UF em maiúsculas, 2 letras.',
      '- Se o texto não parecer endereço, retorne ok:false com motivo "não parece endereço".',
      '',
      'Endereço bruto:',
      '---',
      texto,
      '---'
    ].join('\n');

    var out = _callClaudeApiViabilidade_(apiKey, systemPrompt, 300);
    var jsonMatch = String(out || '').match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return { ok: false, erro: 'CLAUDE_OUTPUT_INVALIDO', motivo: 'Resposta da IA fora do formato.' };
    }
    var parsed;
    try { parsed = JSON.parse(jsonMatch[0]); }
    catch (e) { return { ok: false, erro: 'CLAUDE_JSON_PARSE', motivo: e.message }; }

    if (parsed.ok === true && typeof parsed.logradouro === 'string') {
      return { ok: true, logradouro: parsed.logradouro };
    }
    return { ok: false, erro: 'CLAUDE_NAO_NORMALIZOU', motivo: String(parsed.motivo || 'sem motivo') };
  } catch (e) {
    return { ok: false, erro: 'EXCECAO', motivo: String(e && e.message || e) };
  }
}

// ── 4. Persistir consulta (LGPD: hash, não o endereço cru) ────────────────────
function salvarConsultaViabilidade(usuario, consulta) {
  try {
    if (!consulta || typeof consulta !== 'object') {
      return { ok: false, erro: 'CONSULTA_INVALIDA' };
    }
    var sheet = _getViabilidadeSheet_();
    if (!sheet) return { ok: false, erro: 'ABA_AUSENTE', mensagem: 'Aba "' + VIABILIDADE_ABA + '" não existe. Rode _criarAbaViabilidade() no editor.' };

    var hash = _hashEnderecoViabilidade_(consulta.endereco && consulta.endereco.completo);
    var ctos = Array.isArray(consulta.ctos) ? consulta.ctos.length : 0;

    var metaJson = '';
    try {
      var ctoPerto = (Array.isArray(consulta.ctos) && consulta.ctos[0]) ? consulta.ctos[0] : null;
      var meta = {
        cidade: consulta.endereco && consulta.endereco.cidade,
        uf:     consulta.endereco && consulta.endereco.uf,
        ctoPertoDistancia: ctoPerto && typeof ctoPerto.distanciaMetros === 'number' ? Math.round(ctoPerto.distanciaMetros) : null,
        ctoPertoStatus:    ctoPerto && ctoPerto.status,
        cacheHit:          !!consulta.cacheHit
      };
      metaJson = JSON.stringify(meta);
    } catch (e) {}

    sheet.appendRow([
      new Date().toISOString(),
      String(usuario || 'anon'),
      hash,
      String(consulta.resultado || 'INDETERMINADO'),
      ctos,
      String(consulta.motivo || ''),
      metaJson
    ]);
    return { ok: true, hash: hash, linha: sheet.getLastRow() };
  } catch (e) {
    return { ok: false, erro: 'EXCECAO', mensagem: String(e && e.message || e) };
  }
}

// ── 5. Histórico (últimas N consultas do usuário) ─────────────────────────────
function getHistoricoViabilidadeUsuario(usuario, limite) {
  try {
    var sheet = _getViabilidadeSheet_();
    if (!sheet) return { ok: true, lista: [] };
    var lim = parseInt(limite, 10);
    if (!lim || lim < 1) lim = 10;
    if (lim > 100) lim = 100;

    var last = sheet.getLastRow();
    if (last < 2) return { ok: true, lista: [] };

    // Lê últimas 500 linhas (>>10) e filtra por usuário; é barato
    var startRow = Math.max(2, last - 499);
    var qtd = last - startRow + 1;
    var rows = sheet.getRange(startRow, 1, qtd, 7).getValues();
    var alvo = String(usuario || '');
    var out = [];
    for (var i = rows.length - 1; i >= 0; i--) {  // mais recente primeiro
      var r = rows[i];
      if (!alvo || String(r[1] || '') === alvo) {
        out.push({
          timestamp:    String(r[0] || ''),
          usuario:      String(r[1] || ''),
          enderecoHash: String(r[2] || ''),
          resultado:    String(r[3] || ''),
          ctosQtd:      Number(r[4] || 0),
          motivo:       String(r[5] || ''),
          metaJson:     String(r[6] || '')
        });
        if (out.length >= lim) break;
      }
    }
    return { ok: true, lista: out };
  } catch (e) {
    return { ok: false, erro: 'EXCECAO', mensagem: String(e && e.message || e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function _getViabilidadeSheet_() {
  try {
    var ss = _getSpreadsheet_();
    return ss.getSheetByName(VIABILIDADE_ABA);
  } catch (e) { return null; }
}

function _hashEnderecoViabilidade_(enderecoCompleto) {
  var s = String(enderecoCompleto || '');
  // Normaliza: NFD + remove diacríticos + lowercase + collapse whitespace + trim
  var nfd = s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  var norm = nfd.toLowerCase().replace(/\s+/g, ' ').trim();
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    norm,
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    if (h.length < 2) h = '0' + h;
    hex += h;
  }
  return hex.slice(0, 16);
}

function _consumirCleanupQuota_(usuario) {
  try {
    var props = PropertiesService.getScriptProperties();
    var dt = new Date();
    var horaKey = Utilities.formatDate(dt, 'America/Sao_Paulo', 'yyyyMMddHH');
    var key = 'VIABILIDADE_CLEANUP_QUOTA_' + usuario + '_' + horaKey;
    var val = parseInt(props.getProperty(key) || '0', 10);
    if (val >= VIABILIDADE_CLEANUP_MAX_HORA) {
      return { ok: false, erro: 'CLEANUP_RATE_LIMIT', motivo: 'Máximo ' + VIABILIDADE_CLEANUP_MAX_HORA + ' cleanups por hora atingido.' };
    }
    props.setProperty(key, String(val + 1));
    return { ok: true };
  } catch (e) {
    // Quota inacessível — libera (degrade gracioso)
    return { ok: true, aviso: 'quota_inacessivel' };
  }
}

function _callClaudeApiViabilidade_(key, prompt, maxTokens) {
  var url = 'https://api.anthropic.com/v1/messages';
  var bodyObj = {
    model: VIABILIDADE_MODEL_CLAUDE,
    max_tokens: parseInt(maxTokens, 10) > 0 ? parseInt(maxTokens, 10) : 300,
    messages: [{ role: 'user', content: prompt }]
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(bodyObj),
    muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  var json;
  try { json = JSON.parse(resp.getContentText()); }
  catch (e) { throw new Error('Claude API: resposta não-JSON (HTTP ' + code + ')'); }
  if (code !== 200) {
    var errMsg = json && json.error ? json.error.message : 'HTTP ' + code;
    throw new Error('Claude API: ' + errMsg);
  }
  if (!json.content || !json.content[0] || !json.content[0].text) {
    throw new Error('Claude API retornou estrutura inesperada.');
  }
  return json.content[0].text;
}
